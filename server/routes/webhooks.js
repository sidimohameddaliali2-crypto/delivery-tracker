import express from 'express';
import WebhookEvent from '../models/WebhookEvent.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// POST /api/webhooks/customer-event
// Receives notifications from an external site (e.g. a customer pausing a
// delivery for a day, or making any other change) and logs them as-is.
// TODO: add shared-secret/HMAC verification before this handles real data.
router.post('/customer-event', async (req, res) => {
  try {
    const body = req.body || {};

    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const { eventType, customer, date, details } = body;

    const event = await WebhookEvent.create({
      eventType: eventType || 'unknown',
      customerIdentifier: customer || {},
      rawPayload: { eventType, customer, date, details, ...body }
    });

    res.status(200).json({ success: true, id: event._id });
  } catch (error) {
    console.error('Webhook customer-event error:', error);
    res.status(500).json({ error: 'Failed to record webhook event' });
  }
});

// GET /api/webhooks?eventType=pause&limit=50
// Lists recently received webhook events for review (admin use).
router.get('/', protect, async (req, res) => {
  try {
    const { eventType, limit } = req.query;

    const filter = {};
    if (eventType) {
      filter.eventType = eventType;
    }

    const events = await WebhookEvent.find(filter)
      .sort({ receivedAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 200))
      .lean();

    res.json({ success: true, count: events.length, events });
  } catch (error) {
    console.error('Get webhook events error:', error);
    res.status(500).json({ error: 'Failed to fetch webhook events' });
  }
});

export default router;
