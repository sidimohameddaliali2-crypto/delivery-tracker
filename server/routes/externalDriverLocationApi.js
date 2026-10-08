import express from 'express';
import User from '../models/User.js';
import truckoomApiService from '../services/truckoomApiService.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';

// Read-only driver-location API for the same external/third-party consumers
// as externalDeliveryApi.js — owner, 2026-10-08: "someone from my api can
// access the tracker api and have the location of the driver." Reuses the
// same static API-key auth (DELIVERY_API_KEYS) rather than a separate key,
// and the same fleet/driver join routes/truckoomApi.js already does for the
// in-app Live Tracking page (Truckoom "Trace" vehicle GPS, joined against
// User.profile.truckoomVehicleNo) — just exposed under /api/external instead
// of behind staff JWT + the live_map permission.

const router = express.Router();

router.use(apiKeyAuth);

function nameOf(driver) {
  const parts = [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : driver.email || 'Driver';
}

// @desc    Every tracked vehicle's live GPS location, with the driver it's
//          mapped to (if any). Vehicles with no current fix have lat/lng null
//          rather than being dropped, so a consumer can tell "no driver
//          assigned" apart from "assigned but not reporting a location."
// @route   GET /api/external/drivers/locations
router.get('/locations', async (req, res) => {
  try {
    const [fleet, drivers] = await Promise.all([
      truckoomApiService.getFleetStatus(),
      User.find({ role: 'driver', 'profile.truckoomVehicleNo': { $ne: null } })
        .select('profile.firstName profile.lastName profile.truckoomVehicleNo profile.phone email')
        .lean(),
    ]);

    const driverByVehicleNo = new Map(
      drivers.filter((d) => d.profile?.truckoomVehicleNo).map((d) => [d.profile.truckoomVehicleNo, d])
    );

    const data = fleet.map((v) => {
      const driver = driverByVehicleNo.get(v.vehicleNo);
      return {
        vehicleNo: v.vehicleNo,
        vehicleType: v.vehicleType,
        location: Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
          ? { lat: v.latitude, lng: v.longitude }
          : null,
        driver: driver
          ? {
              id: String(driver._id),
              name: nameOf(driver),
              phone: driver.profile?.phone || null,
              email: driver.email || null,
            }
          : null,
      };
    });

    res.json({ success: true, data, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('External driver-location API error:', error.message);
    res.status(502).json({ success: false, message: error.message || 'Failed to fetch driver location data' });
  }
});

export default router;
