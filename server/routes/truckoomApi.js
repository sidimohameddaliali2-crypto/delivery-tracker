import express from 'express';
import User from '../models/User.js';
import truckoomApiService from '../services/truckoomApiService.js';
import VehicleLocationHistory from '../models/VehicleLocationHistory.js';
import { protect, checkPermission } from '../middleware/auth.js';

// Live vehicle GPS (owner, 2026-09-24) — gated by the existing "live_map"
// permission (already on for admin/manager/dispatcher by default, see
// client/src/constants/permissions.js) rather than a new permission key.
const router = express.Router();
router.use(protect, checkPermission('live_map'));

function nameOf(driver) {
  const parts = [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : driver.email || 'Driver';
}

// @desc    Every tracked vehicle, its live GPS location, and the driver
//          it's mapped to (if any) — for Live Tracking and the Driver
//          Routes "vehicle GPS" overlay.
// @route   GET /api/truckoom/vehicles
router.get('/vehicles', async (req, res) => {
  try {
    const [fleet, drivers] = await Promise.all([
      truckoomApiService.getFleetStatus(),
      User.find({ role: 'driver', 'profile.truckoomVehicleNo': { $ne: null } })
        .select('profile.firstName profile.lastName profile.truckoomVehicleNo profile.colorCode email')
        .lean(),
    ]);

    const driverByVehicleNo = new Map(
      drivers.filter((d) => d.profile?.truckoomVehicleNo).map((d) => [d.profile.truckoomVehicleNo, d])
    );

    const vehicles = fleet.map((v) => {
      const driver = driverByVehicleNo.get(v.vehicleNo);
      return {
        ...v,
        driver: driver ? { id: String(driver._id), name: nameOf(driver), colorCode: driver.profile?.colorCode || null } : null,
      };
    });

    res.json({ success: true, data: vehicles, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Truckoom vehicles error:', error.message);
    res.status(502).json({ success: false, message: error.message || 'Failed to fetch vehicle data' });
  }
});

// @desc    Assign (or clear) which driver a tracked vehicle belongs to —
//          lets a dispatcher reassign a tracker directly from Live Tracking
//          instead of going through the driver's own profile edit form.
//          Clears the mapping from whichever driver currently holds this
//          vehicleNo first, so a vehicle never ends up pointing at two
//          drivers at once.
// @route   PUT /api/truckoom/vehicles/:vehicleNo/driver
// @body    { driverId: string | null }
router.put('/vehicles/:vehicleNo/driver', async (req, res) => {
  try {
    const { vehicleNo } = req.params;
    const { driverId } = req.body || {};

    if (driverId && !driverId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ success: false, message: 'Invalid driverId' });
    }

    await User.updateMany(
      {
        role: 'driver',
        'profile.truckoomVehicleNo': vehicleNo,
        ...(driverId ? { _id: { $ne: driverId } } : {}),
      },
      { $set: { 'profile.truckoomVehicleNo': null } }
    );

    if (driverId) {
      const driver = await User.findOneAndUpdate(
        { _id: driverId, role: 'driver' },
        { $set: { 'profile.truckoomVehicleNo': vehicleNo } },
        { new: true }
      ).select('profile.firstName profile.lastName profile.colorCode email');
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }
      return res.json({ success: true, data: { driver: { id: String(driver._id), name: nameOf(driver), colorCode: driver.profile?.colorCode || null } } });
    }

    res.json({ success: true, data: { driver: null } });
  } catch (error) {
    console.error('Truckoom vehicle driver assignment error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update vehicle driver assignment' });
  }
});

// @desc    Recorded GPS trail for a vehicle or driver over a time range —
//          the history jobs/recordVehicleLocations.js builds every minute,
//          since Truckoom's own API has no route-trail/playback endpoint.
// @route   GET /api/truckoom/history?vehicleNo=...&driverId=...&from=...&to=...
router.get('/history', async (req, res) => {
  try {
    const { vehicleNo, driverId, from, to } = req.query;
    if (!vehicleNo && !driverId) {
      return res.status(400).json({ success: false, message: 'vehicleNo or driverId is required' });
    }

    const query = {};
    if (vehicleNo) query.vehicleNo = vehicleNo;
    if (driverId) query.driver = driverId;
    if (from || to) {
      query.recordedAt = {};
      if (from) query.recordedAt.$gte = new Date(from);
      if (to) query.recordedAt.$lte = new Date(to);
    }

    const points = await VehicleLocationHistory.find(query)
      .sort({ recordedAt: 1 })
      .limit(10000)
      .select('vehicleNo driver latitude longitude recordedAt')
      .lean();

    res.json({ success: true, data: points });
  } catch (error) {
    console.error('Truckoom history error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch vehicle location history' });
  }
});

export default router;
