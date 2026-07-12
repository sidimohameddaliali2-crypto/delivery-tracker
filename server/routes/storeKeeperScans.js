import express from 'express';
import StoreKeeperScan from '../models/StoreKeeperScan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

function resolveUserDisplayName(user) {
  if (!user) return null;
  const first = user.profile?.firstName || '';
  const last = user.profile?.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || user.name || user.email || null;
}

function normalizeDateKey(input) {
  if (!input) return null;
  const asText = String(input);
  const match = asText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return asText;

  const parsed = new Date(asText);
  if (Number.isNaN(parsed.getTime())) return null;

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

router.post('/', async (req, res) => {
  try {
    const { bagId, action, result, detail, timestamp, source } = req.body || {};

    if (!bagId || !action) {
      return res.status(400).json({
        success: false,
        message: 'bagId and action are required'
      });
    }

    const scan = await StoreKeeperScan.create({
      bagId: String(bagId).trim().toUpperCase(),
      action,
      result: result || null,
      detail: detail || null,
      source: source || 'store_keeper',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      scannedBy: req.user?._id || null,
      scannedByName: resolveUserDisplayName(req.user)
    });

    return res.status(201).json({
      success: true,
      data: scan
    });
  } catch (error) {
    console.error('Error creating store keeper scan log:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save store keeper scan log',
      error: error.message
    });
  }
});

router.get('/today', async (req, res) => {
  try {
    const requestedDateKey = normalizeDateKey(req.query.date);
    const now = new Date();
    const currentDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateKey = requestedDateKey || currentDateKey;

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(parsedLimit) ? 300 : Math.min(Math.max(parsedLimit, 1), 2000);

    const data = await StoreKeeperScan.find({
      source: 'store_keeper',
      dateKey
    })
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      count: data.length,
      dateKey,
      data
    });
  } catch (error) {
    console.error('Error fetching store keeper scan logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch store keeper scan logs',
      error: error.message
    });
  }
});

export default router;
