import express from 'express';
import BagNote from '../models/BagNote.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/bag-notes?date=YYYY-MM-DD
// Returns all notes for a given calendar date
router.get('/', protect, async (req, res) => {
  try {
    const { date } = req.query;

    const filter = {};
    if (date) {
      const start = new Date(date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setUTCHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const notes = await BagNote.find(filter).sort({ createdAt: -1 }).lean();

    res.json({ success: true, count: notes.length, notes });
  } catch (error) {
    console.error('Get bag notes error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch bag notes' });
  }
});

// POST /api/bag-notes
// Create or upsert a note for a customer on a specific date
router.post('/', protect, async (req, res) => {
  try {
    const { customerId, customerName, bagId, date, note } = req.body;

    if (!customerId || !date || !note) {
      return res.status(400).json({ error: 'Missing required fields: customerId, date, note' });
    }

    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Upsert: update existing note for same customer+day, or create new
    const existing = await BagNote.findOne({
      customerId,
      date: { $gte: dayStart, $lte: dayEnd }
    });

    let bagNote;
    if (existing) {
      existing.note = note;
      existing.customerName = customerName || existing.customerName;
      existing.bagId = bagId || existing.bagId;
      existing.createdBy = req.user?._id;
      existing.createdByName =
        req.user?.profile?.firstName
          ? `${req.user.profile.firstName} ${req.user.profile.lastName || ''}`.trim()
          : req.user?.name || req.user?.email || 'Unknown';
      bagNote = await existing.save();
    } else {
      bagNote = await BagNote.create({
        customerId,
        customerName,
        bagId,
        date: dayStart,
        note,
        createdBy: req.user?._id,
        createdByName:
          req.user?.profile?.firstName
            ? `${req.user.profile.firstName} ${req.user.profile.lastName || ''}`.trim()
            : req.user?.name || req.user?.email || 'Unknown'
      });
    }

    res.status(201).json({ success: true, bagNote });
  } catch (error) {
    console.error('Save bag note error:', error);
    res.status(500).json({ error: error.message || 'Failed to save bag note' });
  }
});

// DELETE /api/bag-notes/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const bagNote = await BagNote.findByIdAndDelete(req.params.id);
    if (!bagNote) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Delete bag note error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete note' });
  }
});

export default router;
