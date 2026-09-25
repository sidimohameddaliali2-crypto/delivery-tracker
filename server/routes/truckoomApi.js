import express from 'express';
import User from '../models/User.js';
import truckoomApiService from '../services/truckoomApiService.js';
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

export default router;
