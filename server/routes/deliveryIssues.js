import express from 'express';
import DeliveryIssue from '../models/DeliveryIssue.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/delivery-issues
// Supports ?status=open|resolved, ?customerId=xxx
router.get('/', protect, async (req, res) => {
  try {
    const { status, customerId } = req.query;
    const filter = {};

    if (status && ['open', 'resolved'].includes(status)) {
      filter.status = status;
    }
    if (customerId) {
      filter.customerId = customerId;
    }

    const issues = await DeliveryIssue.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: issues.length, issues });
  } catch (error) {
    console.error('Get delivery issues error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch delivery issues' });
  }
});

// POST /api/delivery-issues
router.post('/', protect, async (req, res) => {
  try {
    const { customerId, customerName, issueType, description, photoUrl, priority } = req.body;

    if (!customerId || !customerName || !issueType || !description) {
      return res.status(400).json({
        error: 'Missing required fields: customerId, customerName, issueType, description'
      });
    }

    const reportedByName = req.user?.profile?.firstName
      ? `${req.user.profile.firstName} ${req.user.profile.lastName || ''}`.trim()
      : req.user?.name || req.user?.email || 'Unknown';

    const issue = await DeliveryIssue.create({
      customerId,
      customerName,
      issueType,
      description,
      photoUrl: photoUrl || undefined,
      priority: priority || 'medium',
      reportedBy: req.user?._id,
      reportedByName
    });

    res.status(201).json({ success: true, issue });
  } catch (error) {
    console.error('Create delivery issue error:', error);
    res.status(500).json({ error: error.message || 'Failed to create delivery issue' });
  }
});

// PATCH /api/delivery-issues/:id
// Used by dispatcher/admin to resolve or update an issue
router.patch('/:id', protect, async (req, res) => {
  try {
    const issue = await DeliveryIssue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const { status, resolvedNotes } = req.body;

    if (status && ['open', 'resolved'].includes(status)) {
      issue.status = status;
      if (status === 'resolved') {
        issue.resolvedAt = new Date();
        issue.resolvedBy = req.user?._id;
        issue.resolvedByName = req.user?.profile?.firstName
          ? `${req.user.profile.firstName} ${req.user.profile.lastName || ''}`.trim()
          : req.user?.name || req.user?.email || 'Unknown';
      } else {
        // Re-opening
        issue.resolvedAt = undefined;
        issue.resolvedBy = undefined;
        issue.resolvedByName = undefined;
      }
    }

    if (resolvedNotes !== undefined) {
      issue.resolvedNotes = resolvedNotes;
    }

    await issue.save();

    res.json({ success: true, issue });
  } catch (error) {
    console.error('Update delivery issue error:', error);
    res.status(500).json({ error: error.message || 'Failed to update delivery issue' });
  }
});

export default router;
