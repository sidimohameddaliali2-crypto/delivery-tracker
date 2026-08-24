import express from 'express';
import Vehicle from '../models/Vehicle.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

const DRIVER_SELECT = 'profile.firstName profile.lastName profile.phone';

/**
 * GET /api/vehicles
 * List vehicles with search/filter/pagination, plus fleet-wide stats for
 * the KPI cards (computed independently of the current page/filter so the
 * cards always reflect the whole fleet).
 */
router.get('/', protect, async (req, res) => {
  try {
    const { search, status, type, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (type && type !== 'all') query.type = type;
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ vehicleId: regex }, { plateNumber: regex }];
    }

    const [vehicles, total, allVehicles] = await Promise.all([
      Vehicle.find(query)
        .populate('assignedDriver', DRIVER_SELECT)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Vehicle.countDocuments(query),
      Vehicle.find({}).select('status fuelLevel').lean()
    ]);

    const totalVehicles = allVehicles.length;
    const inService = allVehicles.filter((v) => v.status === 'active').length;
    const maintenanceRequired = allVehicles.filter((v) => v.status === 'maintenance').length;
    const avgFuelLevel = totalVehicles > 0
      ? Math.round(allVehicles.reduce((sum, v) => sum + (v.fuelLevel ?? 0), 0) / totalVehicles)
      : 0;

    res.json({
      success: true,
      data: vehicles,
      stats: { totalVehicles, inService, maintenanceRequired, avgFuelLevel },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch vehicles' });
  }
});

// GET /api/vehicles/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).populate('assignedDriver', DRIVER_SELECT);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    res.json({ success: true, data: vehicle });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch vehicle' });
  }
});

// POST /api/vehicles
router.post('/', protect, admin, async (req, res) => {
  try {
    const { vehicleId, type, plateNumber, assignedDriver, status, fuelLevel, notes } = req.body;

    if (!vehicleId || !type || !plateNumber) {
      return res.status(400).json({ success: false, message: 'vehicleId, type, and plateNumber are required' });
    }

    const vehicle = await Vehicle.create({
      vehicleId,
      type,
      plateNumber,
      assignedDriver: assignedDriver || null,
      status,
      fuelLevel,
      notes
    });

    const populated = await vehicle.populate('assignedDriver', DRIVER_SELECT);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A vehicle with this Vehicle ID already exists' });
    }
    console.error('Create vehicle error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create vehicle' });
  }
});

// PUT /api/vehicles/:id — also used to assign/unassign a driver and change status/fuel level
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const { vehicleId, type, plateNumber, assignedDriver, status, fuelLevel, notes } = req.body;
    const update = {};
    if (vehicleId !== undefined) update.vehicleId = vehicleId;
    if (type !== undefined) update.type = type;
    if (plateNumber !== undefined) update.plateNumber = plateNumber;
    if (assignedDriver !== undefined) update.assignedDriver = assignedDriver || null;
    if (status !== undefined) update.status = status;
    if (fuelLevel !== undefined) update.fuelLevel = fuelLevel;
    if (notes !== undefined) update.notes = notes;

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .populate('assignedDriver', DRIVER_SELECT);

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    res.json({ success: true, data: vehicle });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A vehicle with this Vehicle ID already exists' });
    }
    console.error('Update vehicle error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update vehicle' });
  }
});

// DELETE /api/vehicles/:id
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete vehicle' });
  }
});

export default router;
