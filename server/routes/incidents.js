import express from 'express';
import Incident from '../models/Incident.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/incidents?startDate=...&endDate=...
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const incidents = await Incident.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: incidents.length,
      incidents
    });
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch incidents' });
  }
});

// POST /api/incidents
router.post('/', protect, async (req, res) => {
  try {
    const { date, vehicleType, incidentType, description } = req.body;

    if (!date || !vehicleType || !incidentType) {
      return res.status(400).json({
        error: 'Missing required fields: date, vehicleType, incidentType'
      });
    }

    const incident = await Incident.create({
      date,
      vehicleType,
      incidentType,
      description,
      reportedBy: req.user?._id
    });

    res.status(201).json({
      success: true,
      incident
    });
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: error.message || 'Failed to create incident' });
  }
});

// DELETE /api/incidents/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const incident = await Incident.findByIdAndDelete(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.json({
      success: true,
      message: 'Incident removed'
    });
  } catch (error) {
    console.error('Delete incident error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete incident' });
  }
});

export default router;
