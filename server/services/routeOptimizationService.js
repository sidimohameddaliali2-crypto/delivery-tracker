import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import Delivery from '../models/Delivery.js';
import User from '../models/User.js';
import { resolveDeliveryCoordinates } from './geocoding.js';
import { buildDistanceMatrix } from './distanceMatrixService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOLVER_SCRIPT_PATH = path.join(__dirname, '..', 'optimizer', 'solve_routes.py');

// Production runs on Linux, where `python3` is the standard command. On a
// Windows dev machine (no python3 by default), set PYTHON_BIN=python in
// your local .env to test this locally.
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const SOLVER_PROCESS_TIMEOUT_MS = 30000;
const COORD_RESOLUTION_CONCURRENCY = 15;

const DEPOT = {
  lat: Number(process.env.DELIVERY_DEPOT_LAT),
  lng: Number(process.env.DELIVERY_DEPOT_LNG),
  label: process.env.DELIVERY_DEPOT_LABEL || 'Depot'
};

function runSolver(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SOLVER_SCRIPT_PATH]);
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Route solver timed out'));
    }, SOLVER_PROCESS_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(
        `Failed to start route solver (is Python installed and on PATH? tried "${PYTHON_BIN}"): ${err.message}`
      ));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(stderr.trim() || `Route solver exited with code ${code}`));
      }
      try {
        const result = JSON.parse(stdout);
        if (!result.success) return reject(new Error(result.error || 'Route solver reported failure'));
        resolve(result);
      } catch (err) {
        reject(new Error(`Could not parse route solver output: ${err.message}${stderr ? ` (stderr: ${stderr.trim()})` : ''}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function resolveCoordinatesForAll(deliveries) {
  const coordsByDeliveryId = new Map();
  const unresolvedDeliveries = [];

  for (let i = 0; i < deliveries.length; i += COORD_RESOLUTION_CONCURRENCY) {
    const batch = deliveries.slice(i, i + COORD_RESOLUTION_CONCURRENCY);
    await Promise.all(batch.map(async (delivery) => {
      try {
        const coords = await resolveDeliveryCoordinates(delivery);
        if (coords) {
          coordsByDeliveryId.set(String(delivery._id), coords);
        } else {
          unresolvedDeliveries.push({ id: String(delivery._id), customerName: delivery.customerName });
        }
      } catch (err) {
        unresolvedDeliveries.push({ id: String(delivery._id), customerName: delivery.customerName, error: err.message });
      }
    }));
  }

  return { coordsByDeliveryId, unresolvedDeliveries };
}

/**
 * Compute an optimized set of driver routes for a set of deliveries. Does
 * NOT write anything to the database — the result is meant to be reviewed
 * (e.g. in a dispatcher preview UI) before calling applyRoutePlan.
 *
 * @param {string[]} deliveryIds - Mongo ObjectIds of deliveries to route
 * @param {string[]} driverIds - Mongo ObjectIds of drivers to route them across
 */
export async function optimizeRoutes(deliveryIds, driverIds) {
  if (!Number.isFinite(DEPOT.lat) || !Number.isFinite(DEPOT.lng)) {
    throw new Error('DELIVERY_DEPOT_LAT/DELIVERY_DEPOT_LNG are not configured');
  }
  if (!Array.isArray(deliveryIds) || deliveryIds.length === 0) {
    throw new Error('At least one delivery is required');
  }
  if (!Array.isArray(driverIds) || driverIds.length === 0) {
    throw new Error('At least one driver is required');
  }

  const [deliveries, drivers] = await Promise.all([
    Delivery.find({ _id: { $in: deliveryIds } }),
    User.find({ _id: { $in: driverIds } }).select('profile email')
  ]);

  if (deliveries.length === 0) throw new Error('No matching deliveries found');
  if (drivers.length === 0) throw new Error('No matching drivers found');

  const { coordsByDeliveryId, unresolvedDeliveries } = await resolveCoordinatesForAll(deliveries);

  const routableDeliveries = deliveries.filter((d) => coordsByDeliveryId.has(String(d._id)));
  if (routableDeliveries.length === 0) {
    throw new Error('None of the selected deliveries have a resolvable address/location');
  }

  const points = [
    { lat: DEPOT.lat, lng: DEPOT.lng },
    ...routableDeliveries.map((d) => coordsByDeliveryId.get(String(d._id)))
  ];
  const stopIds = routableDeliveries.map((d) => String(d._id));

  const { durations } = await buildDistanceMatrix(points);

  const solverResult = await runSolver({
    depot_index: 0,
    num_vehicles: drivers.length,
    duration_matrix: durations,
    stop_ids: stopIds
  });

  const deliveryById = new Map(routableDeliveries.map((d) => [String(d._id), d]));
  const routes = drivers.map((driver, vehicleIndex) => {
    const orderedDeliveryIds = solverResult.routes[String(vehicleIndex)] || [];
    return {
      driverId: String(driver._id),
      driverName: [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean).join(' ') || driver.email,
      stops: orderedDeliveryIds.map((deliveryId, index) => {
        const delivery = deliveryById.get(deliveryId);
        return {
          deliveryId,
          routeOrder: index,
          customerName: delivery?.customerName,
          address: delivery?.address
        };
      })
    };
  });

  return {
    routes,
    unresolvedDeliveries,
    totalDurationSeconds: solverResult.total_duration_seconds,
    depot: DEPOT
  };
}

/**
 * Persist a (possibly dispatcher-edited) route plan onto the underlying
 * Delivery documents — sets driver, routeOrder and routeOptimizedAt.
 * @param {{driverId: string, stops: {deliveryId: string, routeOrder: number}[]}[]} routes
 */
export async function applyRoutePlan(routes) {
  const optimizedAt = new Date();
  const bulkOps = [];
  routes.forEach(({ driverId, stops }) => {
    stops.forEach(({ deliveryId, routeOrder }) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: deliveryId },
          update: { $set: { driver: driverId, routeOrder, routeOptimizedAt: optimizedAt } }
        }
      });
    });
  });

  if (bulkOps.length === 0) return { modifiedCount: 0 };
  const result = await Delivery.bulkWrite(bulkOps);
  return { modifiedCount: result.modifiedCount };
}
