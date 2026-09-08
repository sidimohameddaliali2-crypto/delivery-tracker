import express from 'express';
import mongoose from 'mongoose';
import Handoff from '../models/Handoff.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

const DRIVER_POPULATE = 'profile.firstName profile.lastName profile.phone profile.vehicleType';

// Which status a participant may move a handoff to, from where. Both
// drivers tap independently ("I've arrived"), and either may close it out
// once the bags have changed hands.
// The two "arrived" states are informational and may be set in either order
// (the second driver to arrive must not be blocked by a 409), so they can
// move between each other; only completed/cancelled are terminal.
const ALLOWED_TRANSITIONS = {
  planned: ['van_arrived', 'bike_arrived', 'completed', 'cancelled'],
  van_arrived: ['bike_arrived', 'completed', 'cancelled'],
  bike_arrived: ['van_arrived', 'completed', 'cancelled'],
  completed: [],
  cancelled: []
};

// Dispatcher view: all handoffs for a business day.
router.get('/', protect, authorize(['admin', 'super_admin', 'dispatcher', 'manager']), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date (YYYY-MM-DD) is required' });
    }
    const handoffs = await Handoff.find({ date })
      .populate('van', DRIVER_POPULATE)
      .populate('bike', DRIVER_POPULATE)
      .populate('deliveryIds', 'customerName address routeOrder status')
      .sort({ plannedVanArrivalSeconds: 1 })
      .lean();
    res.json({ success: true, data: handoffs });
  } catch (error) {
    console.error('List handoffs error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load handoffs' });
  }
});

// Either participant (van or bike driver) advances the status from their app.
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid handoff ID' });
    }
    if (!Object.keys(ALLOWED_TRANSITIONS).includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const handoff = await Handoff.findById(id);
    if (!handoff) return res.status(404).json({ success: false, message: 'Handoff not found' });

    const userId = String(req.user._id);
    const isParticipant = userId === String(handoff.van) || userId === String(handoff.bike);
    const isDispatcher = ['admin', 'super_admin', 'dispatcher', 'manager'].includes(req.user.role);
    if (!isParticipant && !isDispatcher) {
      return res.status(403).json({ success: false, message: 'Only the two drivers involved can update this handoff' });
    }

    if (!ALLOWED_TRANSITIONS[handoff.status].includes(status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot move a handoff from "${handoff.status}" to "${status}"`
      });
    }

    handoff.status = status;
    await handoff.save();
    res.json({ success: true, data: handoff });
  } catch (error) {
    console.error('Update handoff status error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update handoff' });
  }
});

export default router;
