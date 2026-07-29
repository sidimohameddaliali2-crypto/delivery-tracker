import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { body, validationResult } from 'express-validator';
import Delivery from '../models/Delivery.js';
import DeliveryChange from '../models/DeliveryChange.js';
import Bag from '../models/Bag.js';
import User from '../models/User.js';
import { protect, authorize, admin } from '../middleware/auth.js'; // Fixed import
import { upload, handleUploadError } from '../middleware/upload.js';
import { getUploadToSpaces } from '../config/spaces.js';
import { detectAreaFromAddress } from '../config/areas.js';
import { resolveDeliveryCoordinates, extractCoordsFromGoogleMapsUrl } from '../services/geocoding.js';

// Helper to persist coordinates onto a customer's record via their deliveries
async function saveCustomerCoords(delivery, lat, lng, link) {
  if (!delivery) return;
  delivery.gpsLocation = {
    lat,
    lng,
    link: link || delivery.gpsLocation?.link
  };
  delivery.lat = lat;
  delivery.lng = lng;
  await delivery.save();
}

// Timezone handling: treat client-supplied local times as LOCAL_TZ when they lack an explicit offset
const LOCAL_TZ_OFFSET_MINUTES = Number.parseInt(
  process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || process.env.BUSINESS_TZ_OFFSET_MINUTES || '0',
  10
);
const LOCAL_TZ_OFFSET_MS = LOCAL_TZ_OFFSET_MINUTES * 60 * 1000;

function hasExplicitOffset(value) {
  return typeof value === 'string' && /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
}

function normalizeScheduledTimeInput(raw) {
  if (!raw) return null;

  // If already a Date or number, trust it
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  // Strings without timezone should be interpreted in LOCAL_TZ
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (hasExplicitOffset(trimmed)) {
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const [datePart, timePartRaw] = trimmed.split('T');
    if (datePart && timePartRaw) {
      const [y, mo, d] = datePart.split('-').map(Number);
      const [h = '0', m = '0'] = timePartRaw.split(':');
      const hours = Number.parseInt(h, 10) || 0;
      const minutes = Number.parseInt(m, 10) || 0;
      const utcMillis = Date.UTC(y, (mo || 1) - 1, d || 1, hours, minutes) - LOCAL_TZ_OFFSET_MS;
      const normalized = new Date(utcMillis);
      if (!Number.isNaN(normalized.getTime())) {
        return normalized;
      }
    }

    // Fallback to native parsing
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Other inputs (numbers, etc.)
  try {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function formatLocalDateTime(date) {
  if (!date) return 'N/A';
  const dt = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  const local = new Date(dt.getTime() + LOCAL_TZ_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

function getBusinessDayBounds(dateInput) {
  const reference = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(reference.getTime())) {
    throw new Error('Invalid date for business day bounds');
  }

  // Convert UTC instant to local business date, then back to UTC bounds for that local day.
  const local = new Date(reference.getTime() + LOCAL_TZ_OFFSET_MS);
  const startOfDayMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0, 0, 0, 0
  ) - LOCAL_TZ_OFFSET_MS;

  return {
    startOfDay: new Date(startOfDayMs),
    endOfDayExclusive: new Date(startOfDayMs + 24 * 60 * 60 * 1000)
  };
}

async function notifyManualDeliverySlack(delivery, actorLabel) {
  try {
    // Check if Slack notifications are enabled
    if (process.env.ENABLE_SLACK_NOTIFICATIONS === '0') {
      console.log('Slack notifications disabled; skipping manual delivery notification');
      return false;
    }

    const webhookUrl =
      process.env.SLACK_MANUAL_ENTRY_WEBHOOK_URL ||
      process.env.SLACK_WEBHOOK_URL ||
      process.env.SLACK_LOCATION_CHANGE_WEBHOOK_URL ||
      process.env.SLACK_REMOVAL_WEBHOOK ||
      process.env.SLACK_BAG_COLLECTION_WEBHOOK_URL ||
      process.env.SLACK_BAG_COLLECTION_WEBHOOK;

    if (!webhookUrl) {
      console.warn('Manual delivery Slack webhook not configured; skipping Slack notify');
      return false;
    }

    const lines = [
      ':incoming_envelope: *Manual Delivery Created*',
      `Customer: ${delivery.customerName || 'Unknown'} (${delivery.customerId || 'N/A'})`,
      `When: ${formatLocalDateTime(delivery.scheduledTime)} (local)`,
      delivery.address ? `Address: ${delivery.address}` : null,
      delivery.company ? `Company: ${delivery.company}` : null,
      actorLabel ? `Created by: ${actorLabel}` : null,
      delivery.driver ? `Driver: ${delivery.driver?.profile?.firstName || delivery.driver}` : null
    ].filter(Boolean);

    await axios.post(webhookUrl, { text: lines.join('\n') }, { timeout: 8000 });
    console.log('Sent manual delivery Slack notification');
    return true;
  } catch (err) {
    console.warn('Failed to send manual delivery Slack notification:', err.message);
    return false;
  }
}

const router = express.Router();

// Slack notifier for delivery removals
async function sendDeliveryRemovalToSlack(deliveries, meta = {}) {
  try {
    // Check if Slack notifications are enabled
    if (process.env.ENABLE_SLACK_NOTIFICATIONS === '0') {
      console.log('Slack notifications disabled; skipping delivery removal notification');
      return;
    }

    const webhookUrl = process.env.SLACK_REMOVAL_WEBHOOK;
    if (!webhookUrl) {
      console.warn('SLACK_REMOVAL_WEBHOOK not configured; skipping Slack notification');
      return;
    }

    const deletedBy = meta.deletedBy || 'Unknown user';
    const count = Array.isArray(deliveries) ? deliveries.length : 1;
    
    const lines = [`:wastebasket: *${count} Delivery(ies) Removed*`, `Deleted by: ${deletedBy}`, ''];

    // Show details for each delivery
    for (const delivery of deliveries.slice(0, 10)) { // Limit to first 10
      const scheduledDate = delivery.scheduledTime 
        ? new Date(delivery.scheduledTime).toISOString().slice(0, 16).replace('T', ' ')
        : 'N/A';
      
      lines.push(`*Customer:* ${delivery.customerName || 'Unknown'} (${delivery.customerId || 'N/A'})`);
      lines.push(`*Address:* ${delivery.address || 'N/A'}`);
      lines.push(`*Scheduled:* ${scheduledDate}`);
      lines.push(`*Status:* ${delivery.status || 'N/A'}`);
      if (delivery.company) lines.push(`*Company:* ${delivery.company}`);
      lines.push('');
    }

    if (deliveries.length > 10) {
      lines.push(`_...and ${deliveries.length - 10} more deliveries_`);
    }

    await axios.post(webhookUrl, { text: lines.join('\n') }, { timeout: 8000 });
  } catch (err) {
    console.error('Failed to send delivery removal to Slack:', err.message);
  }
}

// Helper function to apply changes to delivery
async function applyChangesToDelivery(delivery, changes) {
  const updateFields = {};
  
  // Convert Mongoose Map to plain object if needed
  const changesObj = changes instanceof Map ? Object.fromEntries(changes) : changes;
  
  console.log('Changes to apply (converted):', changesObj);
  
  Object.keys(changesObj).forEach(field => {
    if (field === 'scheduledTime') {
      // Handle time changes - combine with existing date in business timezone
      const existingDate = new Date(delivery.scheduledTime);
      const [hStr, mStr] = String(changesObj[field]).split(':');
      const hours = Number.parseInt(hStr || '0', 10) || 0;
      const minutes = Number.parseInt(mStr || '0', 10) || 0;

      const y = existingDate.getUTCFullYear();
      const mo = existingDate.getUTCMonth();
      const d = existingDate.getUTCDate();
      const utcMillis = Date.UTC(y, mo, d, hours, minutes, 0, 0) - LOCAL_TZ_OFFSET_MS;
      updateFields[field] = new Date(utcMillis);
    } else if (field === 'customerName') {
      updateFields[field] = changesObj[field];
    } else if (field === 'customerPhone') {
      updateFields[field] = changesObj[field];
    } else if (field === 'location' && !changesObj.address) {
      // Normalize 'location' to 'address' if provided
      updateFields['address'] = changesObj[field];
    } else {
      updateFields[field] = changesObj[field];
    }
  });

  console.log('Update fields for delivery:', delivery._id, updateFields);
  
  // Auto-detect area/zone if address is being changed
  if (updateFields.address) {
    const detectedArea = detectAreaFromAddress(updateFields.address, delivery.zone, {
      company: updateFields.company || delivery.company || ''
    });
    updateFields.zone = detectedArea;
    console.log(`🗺️ Area auto-detection in change apply: "${updateFields.zone}" for address: "${updateFields.address}"`);
  }
  
  const updatedDelivery = await Delivery.findByIdAndUpdate(
    delivery._id, 
    { $set: updateFields },
    { new: true, runValidators: true }
  );
  
  console.log('Delivery updated successfully:', updatedDelivery._id);
  console.log('Updated values:', updateFields);
  
  return updatedDelivery;
}

// Helper function to check and apply pending changes for a new delivery
async function checkAndApplyPendingChanges(delivery) {
  const { startOfDay, endOfDayExclusive } = getBusinessDayBounds(delivery.scheduledTime);

  console.log('========== AUTO-APPLY PENDING CHANGES ==========');
  console.log('Delivery:', {
    id: delivery._id.toString(),
    customerId: delivery.customerId,
    customerIdType: typeof delivery.customerId,
    customerIdTrimmed: delivery.customerId.trim(),
    scheduledTime: delivery.scheduledTime,
    scheduledTimeISO: delivery.scheduledTime.toISOString()
  });
  console.log('Search range:', {
    startOfDay: startOfDay.toISOString(),
    endOfDayExclusive: endOfDayExclusive.toISOString()
  });

  // Find pending or mis-marked applied changes for this customer and date
  // Normalize customerId by trimming whitespace and normalizing case
  const normalizedCustomerId = delivery.customerId.toString().trim();
  
  const pendingChanges = await DeliveryChange.find({
    customerId: normalizedCustomerId,
    scheduledDate: {
      $gte: startOfDay,
      $lt: endOfDayExclusive
    },
    $or: [
      { status: 'pending' },
      { status: 'applied', appliedToDelivery: { $exists: false } },
      { status: 'applied', appliedToDelivery: null }
    ]
  });

  console.log('Query result: Found', pendingChanges.length, 'changes for customerId:', normalizedCustomerId);
  
  if (pendingChanges.length === 0) {
    // Debug: check if there are ANY changes for this customer with different customerIds
    const allChanges = await DeliveryChange.find({ 
      customerId: { $regex: new RegExp('^\\s*' + delivery.customerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') }
    }).limit(10);
    console.log('DEBUG: All changes for similar customerIds:');
    allChanges.forEach(c => {
      const inRange = c.scheduledDate >= startOfDay && c.scheduledDate < endOfDayExclusive;
      console.log('  -', {
        id: c._id.toString(),
        customerId: c.customerId,
        customerIdType: typeof c.customerId,
        scheduledDate: c.scheduledDate.toISOString(),
        scheduledDateMs: c.scheduledDate.getTime(),
        status: c.status,
        appliedTo: c.appliedToDelivery?.toString() || 'null',
        inDateRange: inRange,
        startOfDayMs: startOfDay.getTime(),
        endOfDayExclusiveMs: endOfDayExclusive.getTime()
      });
    });
  }
  console.log('================================================');

  // Apply each pending change
  for (const change of pendingChanges) {
    try {
      console.log('Applying pending change:', change._id.toString(), 'with changes:', change.changes);
      console.log('Change status BEFORE update:', change.status);
      
      const updatedDelivery = await applyChangesToDelivery(delivery, change.changes);
      
      // Mark change as applied
      change.status = 'applied';
      change.appliedAt = new Date();
      change.appliedToDelivery = delivery._id;
      
      console.log('Change status AFTER update (before save):', change.status);
      console.log('AppliedToDelivery:', change.appliedToDelivery.toString());
      
      await change.save();
      
      console.log('✅ Pending change applied successfully and SAVED:', change._id.toString());
      
      // Verify the save worked by re-querying
      const verifyChange = await DeliveryChange.findById(change._id);
      console.log('Verification - change status in DB:', verifyChange.status, 'appliedTo:', verifyChange.appliedToDelivery?.toString());
      
    } catch (error) {
      console.error('❌ Error applying pending change:', change._id.toString(), error.message);
      // Continue with other changes even if one fails
    }
  }

  console.log(`Applied ${pendingChanges.length} pending changes to delivery ${delivery._id.toString()}`);
  console.log('================================================');

  return pendingChanges.length;
}

// All routes are protected
router.use(protect);

// @desc    Get all deliveries
// @route   GET /api/deliveries
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      driver, 
      company, 
      customerId,
      type,
      dateFrom, 
      dateTo,
      search 
    } = req.query;

    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const safePage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const MAX_LIMIT = 500;
    const safeLimit = Number.isNaN(parsedLimit) || parsedLimit < 1
      ? 10
      : Math.min(parsedLimit, MAX_LIMIT);

    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;
    if (driver) query.driver = driver;
    if (company) query.company = company;
    if (customerId) query.customerId = customerId;
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.scheduledTime = {};
      if (dateFrom) query.scheduledTime.$gte = new Date(dateFrom);
      if (dateTo) query.scheduledTime.$lte = new Date(dateTo);
    }

    // Search filter
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerId: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }

    // Drivers can only see their own deliveries
    if (req.user.role === 'driver') {
      query.driver = req.user._id;
    }

    const deliveries = await Delivery.find(query)
      .populate('driver', 'profile.firstName profile.lastName profile.colorCode email')
      .limit(safeLimit)
      .skip((safePage - 1) * safeLimit)
      .sort({ scheduledTime: 1 })
      .lean();

    const enhancedDeliveries = deliveries.map(delivery => enrichDeliveryTiming(delivery));

    const total = await Delivery.countDocuments(query);

    res.json({
      success: true,
      data: {
        deliveries: enhancedDeliveries,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit)
        }
      }
    });
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function normalizeBagId(bagId) {
  return typeof bagId === 'string' ? bagId.trim().toUpperCase() : '';
}

function resolveUserDisplayName(user) {
  if (!user) {
    return undefined;
  }

  const nameParts = [
    user.profile?.firstName,
    user.profile?.lastName,
  ].filter(Boolean);

  if (nameParts.length > 0) {
    return nameParts.join(' ').trim();
  }

  return user.name || user.email || undefined;
}

function normalizeLocationPayload(raw) {
  if (!raw) {
    return null;
  }

  let payload = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (payload && typeof payload === 'object') {
    const lat =
      typeof payload.lat === 'number'
        ? payload.lat
        : typeof payload.latitude === 'number'
        ? payload.latitude
        : typeof payload.coords?.latitude === 'number'
        ? payload.coords.latitude
        : undefined;

    const lng =
      typeof payload.lng === 'number'
        ? payload.lng
        : typeof payload.longitude === 'number'
        ? payload.longitude
        : typeof payload.coords?.longitude === 'number'
        ? payload.coords.longitude
        : undefined;

    const accuracy =
      typeof payload.accuracy === 'number'
        ? payload.accuracy
        : typeof payload.coords?.accuracy === 'number'
        ? payload.coords.accuracy
        : undefined;

    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng, accuracy };
    }
  }

  return null;
}

function getUserId(user) {
  if (!user) {
    return null;
  }

  if (typeof user === 'string') {
    return user;
  }

  if (user._id) {
    return user._id.toString();
  }

  if (user.id) {
    return user.id.toString();
  }

  try {
    return user.toString();
  } catch {
    return null;
  }
}

function getDeliveryDriverId(delivery) {
  if (!delivery || !delivery.driver) {
    return null;
  }

  if (delivery.driver._id) {
    return delivery.driver._id.toString();
  }

  try {
    return delivery.driver.toString();
  } catch {
    return null;
  }
}

async function releaseBagAssignment(bagId) {
  const normalizedId = normalizeBagId(bagId);
  if (!normalizedId) return;

  const bag = await Bag.findOne({ bagId: normalizedId });
  if (!bag) return;

  bag.status = 'available';
  bag.location = 'warehouse';
  bag.assignedTo = undefined;
  bag.currentDelivery = undefined;
  await bag.save();
}

async function applyBagAssignmentToDelivery(delivery, bagId, assignedBy) {
  const normalizedId = normalizeBagId(bagId);
  if (!normalizedId) {
    throw Object.assign(new Error('Bag ID is required'), { statusCode: 400 });
  }

  if (delivery.bagAssignment?.bagId && delivery.bagAssignment.bagId !== normalizedId) {
    await releaseBagAssignment(delivery.bagAssignment.bagId);
  }

  let bag = await Bag.findOne({ bagId: normalizedId });
  let isNewBag = false;
  if (!bag) {
    // Drivers scan physical bag tags that may not have been registered in
    // inventory yet (new bags, warehouse onboarding gaps). Auto-provision
    // the bag instead of blocking delivery completion — but still reject
    // scans that clearly aren't a bag code at all (garbage QR, wrong item).
    if (!/^BAG[-_]/.test(normalizedId)) {
      throw Object.assign(new Error('Bag not found'), { statusCode: 404 });
    }
    isNewBag = true;
    bag = new Bag({
      bagId: normalizedId,
      notes: 'Auto-created on first scan — bag was not pre-registered in inventory',
    });
  }

  bag.status = 'assigned';
  bag.location = 'driver';
  bag.currentDelivery = delivery._id;
  bag.assignedTo = {
    driver: delivery.driver,
    customer: {
      customerId: delivery.customerId,
      customerName: delivery.customerName
    },
    assignmentTime: new Date()
  };
  if (isNewBag) {
    if (!bag.$locals) bag.$locals = {};
    bag.$locals.historyNote = 'Auto-created and assigned (bag ID not found in inventory)';
  }
  await bag.save();

  delivery.bagAssignment = {
    bagId: normalizedId,
    assignedAt: new Date(),
    assignedBy,
    status: 'assigned'
  };
}

function enrichDeliveryTiming(delivery) {
  if (!delivery || !delivery.scheduledTime) {
    return delivery;
  }

  const scheduled = new Date(delivery.scheduledTime);
  const delivered = delivery.deliveredTime ? new Date(delivery.deliveredTime) : null;
  const earlyThreshold = new Date(scheduled.getTime() - (180 * 60 * 1000));

  let lateMinutes = delivery.lateMinutes ?? 0;
  let earlyMinutes = delivery.earlyMinutes ?? 0;
  let deliveryType = delivery.deliveryType ?? 'on-time';

  if (delivered && !Number.isNaN(delivered.getTime())) {
    const diffMinutes = Math.round((delivered - scheduled) / (1000 * 60));
    const computedEarlyMinutes = delivered < earlyThreshold
      ? Math.max(0, Math.round((earlyThreshold - delivered) / (1000 * 60)))
      : 0;
    const computedLateMinutes = diffMinutes > 0 ? diffMinutes : 0;

    earlyMinutes = computedEarlyMinutes;
    lateMinutes = computedLateMinutes;

    if (computedLateMinutes > 0) {
      deliveryType = 'late';
    } else if (computedEarlyMinutes > 0) {
      deliveryType = 'early';
    } else {
      deliveryType = 'on-time';
    }
  } else {
    earlyMinutes = 0;
    lateMinutes = 0;
    if (!['early', 'late'].includes(deliveryType)) {
      deliveryType = 'on-time';
    }
  }

  return {
    ...delivery,
    earlyMinutes,
    lateMinutes,
    deliveryType
  };
}

// Monthly delivery count grouped by customerId
// GET /api/deliveries/monthly-count?dateFrom=2026-05-01&dateTo=2026-05-31
router.get('/monthly-count', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, message: 'dateFrom and dateTo are required' });
    }
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);

    const results = await Delivery.aggregate([
      { $match: { scheduledTime: { $gte: start, $lte: end }, type: { $ne: 'Task' } } },
      { $group: { _id: '$customerId', count: { $sum: 1 } } },
      { $project: { _id: 0, customerId: '$_id', count: 1 } },
    ]);

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Monthly count error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get late and early deliveries
router.get('/late-early',  async (req, res) => {
  try {
    const { startDate, endDate, type = 'all' } = req.query;
    
    // Default to today if no dates provided
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rangeStart = startDate ? new Date(startDate) : new Date(today);
    if (Number.isNaN(rangeStart.getTime())) {
      return res.status(400).json({
        message: 'Invalid start date format. Expected YYYY-MM-DD.'
      });
    }
    rangeStart.setHours(0, 0, 0, 0);

    const endBase = endDate ? new Date(endDate) : new Date(rangeStart);
    if (Number.isNaN(endBase.getTime())) {
      return res.status(400).json({
        message: 'Invalid end date format. Expected YYYY-MM-DD.'
      });
    }
    endBase.setHours(0, 0, 0, 0);

    const rangeEndExclusive = new Date(endBase);
    rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);

    if (rangeEndExclusive <= rangeStart) {
      return res.status(400).json({
        message: 'End date must be on or after the start date.'
      });
    }

    // Get all deliveries in the date range (for total count)
    const allDeliveriesInRange = await Delivery.countDocuments({
      scheduledTime: {
        $gte: rangeStart,
        $lt: rangeEndExclusive
      }
    });

    // Get incomplete deliveries (not delivered) in the date range
    const incompleteDeliveries = await Delivery.countDocuments({
      scheduledTime: {
        $gte: rangeStart,
        $lt: rangeEndExclusive
      },
      status: { $ne: 'delivered' }
    });

    // Base query for delivered deliveries within date range
    let baseQuery = {
      status: 'delivered',
      deliveredTime: {
        $gte: rangeStart,
        $lt: rangeEndExclusive
      }
    };

    // Add coarse type filter. We skip the on-time case here to avoid dropping
    // records where lateMinutes/earlyMinutes were never persisted (we refine
    // the set after computing exact timing deltas below).
    if (type === 'late') {
      baseQuery.lateMinutes = { $gt: 0 };
    } else if (type === 'early') {
      baseQuery.earlyMinutes = { $gt: 0 };
    }

    const deliveries = await Delivery.find(baseQuery)
      .populate('driver', 'profile.firstName profile.lastName profile.colorCode email')
      .sort({ deliveredTime: -1 })
      .lean();

    // Calculate late/early minutes and enhance data
    const enhancedDeliveries = deliveries.map(delivery => {
      const scheduledTime = new Date(delivery.scheduledTime);
      const deliveredTime = new Date(delivery.deliveredTime);

      const diffMinutes = Math.round((deliveredTime - scheduledTime) / (1000 * 60));
      const earlyThresholdTime = new Date(scheduledTime.getTime() - (180 * 60 * 1000));

      const isLate = diffMinutes > 0;
      const isEarly = deliveredTime < earlyThresholdTime;

      const earlyMinutes = isEarly
        ? Math.max(0, Math.round((earlyThresholdTime - deliveredTime) / (1000 * 60)))
        : 0;

      return {
        ...delivery,
        actualLateMinutes: isLate ? diffMinutes : 0,
        earlyMinutes,
        deliveryType: isEarly ? 'early' : isLate ? 'late' : 'on-time',
        scheduledTime,
        deliveredTime
      };
    });

    // Filter based on type after calculation
    let filteredDeliveries = enhancedDeliveries;
    if (type === 'late') {
      filteredDeliveries = enhancedDeliveries.filter(d => d.deliveryType === 'late');
    } else if (type === 'early') {
      filteredDeliveries = enhancedDeliveries.filter(d => d.deliveryType === 'early');
    } else if (type === 'on-time') {
      filteredDeliveries = enhancedDeliveries.filter(d => d.deliveryType === 'on-time');
    }

    // Get statistics
    const stats = {
      total: allDeliveriesInRange,
      completed: enhancedDeliveries.length,
      incomplete: incompleteDeliveries,
      late: enhancedDeliveries.filter(d => d.deliveryType === 'late').length,
      early: enhancedDeliveries.filter(d => d.deliveryType === 'early').length,
      onTime: enhancedDeliveries.filter(d => d.deliveryType === 'on-time').length,
      avgLateTime: enhancedDeliveries.filter(d => d.deliveryType === 'late').length > 0 
        ? Math.round(enhancedDeliveries.filter(d => d.deliveryType === 'late')
            .reduce((sum, d) => sum + d.actualLateMinutes, 0) / 
            enhancedDeliveries.filter(d => d.deliveryType === 'late').length)
        : 0,
      avgEarlyTime: enhancedDeliveries.filter(d => d.deliveryType === 'early').length > 0 
        ? Math.round(enhancedDeliveries.filter(d => d.deliveryType === 'early')
            .reduce((sum, d) => sum + d.earlyMinutes, 0) / 
            enhancedDeliveries.filter(d => d.deliveryType === 'early').length)
        : 0
    };

    res.json({
      deliveries: filteredDeliveries,
      stats,
      dateRange: {
        start: rangeStart,
        end: endBase
      }
    });

  } catch (error) {
    console.error('Late/early deliveries error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});



// @desc    Get delivery by ID
// @route   GET /api/deliveries/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery ID',
      });
    }

    const delivery = await Delivery.findById(req.params.id)
      .populate('driver', 'profile.firstName profile.lastName profile.colorCode location email');

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Check if driver is accessing their own delivery
    if (req.user.role === 'driver') {
      const deliveryDriverId = getDeliveryDriverId(delivery);
      const requesterId = getUserId(req.user);
      if (!deliveryDriverId || !requesterId || deliveryDriverId !== requesterId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const deliveryObject = delivery.toObject ? delivery.toObject({ virtuals: true }) : delivery;
    const enrichedDelivery = enrichDeliveryTiming(deliveryObject);

    // Fetch bags that are either assigned to this delivery or to this customer
    const bags = await Bag.find({
      $or: [
        { currentDelivery: delivery._id },
        { 'assignedTo.customer.customerId': delivery.customerId }
      ]
    })
      .select('bagId status condition assignedTo notes location')
      .populate('assignedTo.driver', 'profile.firstName profile.lastName profile.colorCode');

    res.json({
      success: true,
      data: { delivery: enrichedDelivery, bags }
    });
  } catch (error) {
    // Improved logging for debugging: include params and user info
    try {
      console.error('Get delivery error:', {
        message: error.message,
        stack: error.stack,
        params: req.params,
        user: req.user ? { id: req.user._id, role: req.user.role } : null
      });
    } catch (logErr) {
      console.error('Error logging failure in get delivery catch:', logErr);
      console.error('Original error:', error);
    }

    // Return the error message in development to help diagnose (remove or sanitize in production)
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      // include basic info for debugging
      error: process.env.NODE_ENV === 'production' ? undefined : (error.stack || error.message)
    });
  }
});

// @desc    Create new delivery
// @route   POST /api/deliveries
// @access  Private/Admin
router.post('/', [
  body('customerId').notEmpty(),
  body('customerName').notEmpty(),
  body('scheduledTime').isISO8601(),
  body('driver').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('company').optional({ checkFalsy: true }).isString().trim().isLength({ max: 100 }),
  body('address').if(body('type').not().equals('Collection')).notEmpty()
], authorize(['admin', 'super_admin', 'dispatcher', 'manager']), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const deliveryData = req.body;

    // Normalize scheduledTime to UTC using configured local offset
    const normalizedScheduled = normalizeScheduledTimeInput(deliveryData.scheduledTime);
    if (!normalizedScheduled) {
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduledTime. Provide a valid datetime-local value.'
      });
    }
    deliveryData.scheduledTime = normalizedScheduled;

    const normalizedScheduledTime = normalizeScheduledTimeInput(deliveryData.scheduledTime);
    if (!normalizedScheduledTime) {
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduledTime; please provide a valid date/time'
      });
    }
    deliveryData.scheduledTime = normalizedScheduledTime;

    // Default company when not provided or blank
    if (!deliveryData.company || !deliveryData.company.trim()) {
      deliveryData.company = 'Matter';
    }

    // Auto-detect area from address if address is provided and area is empty/missing
    if (deliveryData.address && (!deliveryData.zone || deliveryData.zone.trim() === '')) {
      const detectedArea = detectAreaFromAddress(deliveryData.address, '', {
        company: deliveryData.company || ''
      });
      if (detectedArea) {
        deliveryData.zone = detectedArea;
        console.log(`🗺️ Area auto-detection on creation: "${detectedArea}" for address: "${deliveryData.address}"`);
      }
    }

    // Try to extract/geocode coordinates from Google Maps URL or address
    if (!deliveryData.lat || !deliveryData.lng) {
      if (!deliveryData.gpsLocation || !deliveryData.gpsLocation.lat || !deliveryData.gpsLocation.lng) {
        try {
          const coords = await resolveDeliveryCoordinates(deliveryData);
          if (coords) {
            deliveryData.gpsLocation = {
              lat: coords.lat,
              lng: coords.lng,
              link: deliveryData.mapsUrl || undefined
            };
            // Also set top-level for easier access
            deliveryData.lat = coords.lat;
            deliveryData.lng = coords.lng;
            console.log(`📍 Coordinates resolved for delivery:`, coords);
          }
        } catch (err) {
          console.warn('Geocoding failed (non-blocking):', err.message);
        }
      }
    }

    // Create delivery
    const delivery = await Delivery.create(deliveryData);

    // Check for and apply any pending changes
    const appliedChangesCount = await checkAndApplyPendingChanges(delivery);
    
    if (appliedChangesCount > 0) {
      console.log(`Applied ${appliedChangesCount} pending change(s) to delivery ${delivery._id}`);
      // Refresh delivery data after applying changes
      await delivery.populate('driver', 'profile.firstName profile.lastName profile.colorCode email');
    } else {
      // Populate driver info for response
      await delivery.populate('driver', 'profile.firstName profile.lastName profile.colorCode email');
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('delivery:created', delivery);
    } else {
      console.warn('Socket.io not initialized - cannot emit delivery:created');
    }

    // Notify Slack only for manually created single deliveries (not bulk)
    if ((delivery.type || deliveryData.type) !== 'Task' && (delivery.type || deliveryData.type) !== 'Collection') {
      const actorLabel = resolveUserDisplayName(req.user) || req.user?.email || req.user?._id?.toString();
      notifyManualDeliverySlack(delivery, actorLabel).catch((err) => {
        console.warn('Manual delivery Slack notify failed (caught):', err?.message || err);
      });
    }

    res.status(201).json({
      success: true,
      message: appliedChangesCount > 0 
        ? `Delivery created successfully with ${appliedChangesCount} pending change(s) applied`
        : 'Delivery created successfully',
      data: { delivery }
    });
  } catch (error) {
    console.error('Create delivery error:', error);
    console.error('Error stack:', error.stack);
    console.error('Delivery data that caused error:', req.body);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @desc    Create multiple deliveries in bulk
// @route   POST /api/deliveries/bulk
// @access  Private/Admin
router.post('/bulk', [
  body('deliveries').isArray({ min: 1 }).withMessage('deliveries array is required and must have at least 1 item'),
  body('deliveries.*.customerId').notEmpty().withMessage('customerId is required'),
  body('deliveries.*.customerName').notEmpty().withMessage('customerName is required'),
  body('deliveries.*.scheduledTime').isISO8601().withMessage('scheduledTime must be ISO8601 date'),
  body('deliveries.*.company').optional({ checkFalsy: true }).isString().trim().isLength({ max: 100 }).withMessage('company must be a string'),
  body('deliveries.*.address').notEmpty().withMessage('address is required')
], authorize(['admin', 'super_admin', 'dispatcher', 'manager']), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { deliveries: deliveryList } = req.body;
    const startTime = Date.now();
    console.log(`📦 Starting bulk delivery creation for ${deliveryList.length} deliveries...`);

    // Process deliveries to auto-detect areas and geocode coordinates
    const processedDeliveries = await Promise.all(deliveryList.map(async (delivery) => {
      const deliveryData = { ...delivery };

      const normalizedScheduledTime = normalizeScheduledTimeInput(deliveryData.scheduledTime);
      if (!normalizedScheduledTime) {
        throw Object.assign(new Error('Invalid scheduledTime in bulk payload'), { statusCode: 400 });
      }
      deliveryData.scheduledTime = normalizedScheduledTime;

      // Default company when missing/blank
      if (!deliveryData.company || !deliveryData.company.trim()) {
        deliveryData.company = 'Matter';
      } else {
        deliveryData.company = deliveryData.company.trim();
      }
      
      // Auto-detect area from address if area is empty/missing
      if (deliveryData.address && (!deliveryData.zone || deliveryData.zone.trim() === '')) {
        const detectedArea = detectAreaFromAddress(deliveryData.address, '', {
          company: deliveryData.company || ''
        });
        if (detectedArea) {
          deliveryData.zone = detectedArea;
        }
      }

      // Check if this customer exists in database and has coordinates
      let existingCustomerCoords = null;
      if (deliveryData.customerId) {
        try {
          const existingDelivery = await Delivery.findOne(
            { customerId: deliveryData.customerId, 'gpsLocation.lat': { $exists: true, $ne: null } },
            { gpsLocation: 1 }
          ).sort({ createdAt: -1 }).limit(1);
          
          if (existingDelivery && existingDelivery.gpsLocation && existingDelivery.gpsLocation.lat) {
            existingCustomerCoords = existingDelivery.gpsLocation;
            console.log(`✅ Found existing coordinates for customer ${deliveryData.customerId}: [${existingCustomerCoords.lat}, ${existingCustomerCoords.lng}]`);
          }
        } catch (err) {
          console.warn('Error checking for existing customer coords:', err.message);
        }
      }

      // Try to extract/geocode coordinates from Google Maps URL or address
      if (!deliveryData.lat || !deliveryData.lng) {
        if (!deliveryData.gpsLocation || !deliveryData.gpsLocation.lat || !deliveryData.gpsLocation.lng) {
          // Use existing customer coordinates if available
          if (existingCustomerCoords) {
            deliveryData.gpsLocation = {
              lat: existingCustomerCoords.lat,
              lng: existingCustomerCoords.lng,
              link: deliveryData.mapsUrl || undefined
            };
            deliveryData.lat = existingCustomerCoords.lat;
            deliveryData.lng = existingCustomerCoords.lng;
          } else {
            // Otherwise geocode
            try {
              const coords = await resolveDeliveryCoordinates(deliveryData);
              if (coords) {
                deliveryData.gpsLocation = {
                  lat: coords.lat,
                  lng: coords.lng,
                  link: deliveryData.mapsUrl || undefined
                };
                // Also set top-level for easier access
                deliveryData.lat = coords.lat;
                deliveryData.lng = coords.lng;
              }
            } catch (err) {
              console.warn('Geocoding failed for bulk delivery (non-blocking):', err.message);
            }
          }
        }
      }
      
      return deliveryData;
    }));

    // Insert all deliveries in one batch operation
    const createdDeliveries = await Delivery.insertMany(processedDeliveries, { ordered: false });
    console.log(`✅ Bulk inserted ${createdDeliveries.length} deliveries in ${Date.now() - startTime}ms`);

    // Check and apply pending changes to each delivery (can be parallelized)
    const changePromises = createdDeliveries.map(delivery => 
      checkAndApplyPendingChanges(delivery).then(count => ({
        deliveryId: delivery._id,
        changesApplied: count
      }))
    );

    const changeResults = await Promise.all(changePromises);
    const totalChangesApplied = changeResults.reduce((sum, r) => sum + r.changesApplied, 0);
    
    console.log(`✅ Applied ${totalChangesApplied} total pending changes across bulk deliveries`);

    // Populate driver info for all deliveries (batch populate)
    await Delivery.populate(createdDeliveries, { 
      path: 'driver', 
      select: 'profile.firstName profile.lastName profile.colorCode email' 
    });

    // Emit real-time updates for all created deliveries
    const io = req.app.get('io');
    if (io) {
      createdDeliveries.forEach(delivery => io.emit('delivery:created', delivery));
      console.log(`📡 Emitted delivery:created events for ${createdDeliveries.length} deliveries`);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`⏱️ Bulk delivery creation completed in ${elapsedMs}ms (${(elapsedMs / createdDeliveries.length).toFixed(2)}ms per delivery)`);

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdDeliveries.length} deliveries${totalChangesApplied > 0 ? ` with ${totalChangesApplied} pending changes applied` : ''}`,
      data: {
        deliveries: createdDeliveries,
        totalCreated: createdDeliveries.length,
        changesApplied: totalChangesApplied,
        processingTimeMs: elapsedMs
      }
    });
  } catch (error) {
    console.error('❌ Bulk delivery creation error:', error);
    const statusCode = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Server error during bulk creation',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.patch('/assign-driver', [
  body('deliveryIds').isArray({ min: 1 }).withMessage('deliveryIds array is required'),
  body('deliveryIds.*').isMongoId().withMessage('Invalid delivery ID'),
  body('driverId').isMongoId().withMessage('Valid driverId is required')
], authorize(['admin', 'super_admin', 'dispatcher', 'manager']), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { deliveryIds, driverId } = req.body;

    const driver = await User.findOne({ _id: driverId, role: 'driver' });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const deliveries = await Delivery.find({ _id: { $in: deliveryIds } });
    if (deliveries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No deliveries found for the provided IDs'
      });
    }

    const updatedDeliveries = [];
    const driverName = resolveUserDisplayName(driver) || driver.email || driver._id.toString();

    for (const delivery of deliveries) {
      delivery.driver = driverId;
      if (delivery.status === 'pending') {
        delivery.status = 'assigned';
      }

      if (!Array.isArray(delivery.timeline)) {
        delivery.timeline = [];
      }

      delivery.timeline.push({
        status: 'driver_assigned',
        timestamp: new Date(),
        notes: `Assigned to ${driverName}`
      });

      await delivery.save();
      await delivery.populate('driver', 'profile.firstName profile.lastName profile.colorCode email');
      updatedDeliveries.push(delivery);
    }

    const io = req.app.get('io');
    if (io) {
      updatedDeliveries.forEach(delivery => io.emit('delivery:updated', delivery));
    } else {
      console.warn('Socket.io not initialized - cannot emit delivery updates (assign-driver)');
    }

    res.json({
      success: true,
      message: `Assigned ${updatedDeliveries.length} deliveries to ${driverName}`,
      data: { deliveries: updatedDeliveries }
    });
  } catch (error) {
    console.error('Assign driver to deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Update delivery
// @route   PUT /api/deliveries/:id
// @access  Private/Admin
router.put('/:id', authorize(['admin', 'super_admin', 'dispatcher', 'manager']), async (req, res) => {
  try {
    const updateData = req.body;

    if (updateData.scheduledTime) {
      const normalized = normalizeScheduledTimeInput(updateData.scheduledTime);
      if (!normalized) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduledTime. Provide a valid datetime-local value.'
        });
      }
      updateData.scheduledTime = normalized;
    }

    // Get the original delivery before updating
    const originalDelivery = await Delivery.findById(req.params.id);
    if (!originalDelivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('driver', 'profile.firstName profile.lastName profile.colorCode email');

    // Track changes
    const changes = [];
    const fieldsToTrack = [
      'customerName', 'customerId', 'company', 'address', 'zone', 
      'scheduledTime', 'driver', 'status', 'notes'
    ];

    const changesMap = new Map();
    for (const field of fieldsToTrack) {
      const oldValue = originalDelivery[field];
      const newValue = delivery[field];
      
      // Handle nested objects (like driver, address)
      const oldStr = typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue || '');
      const newStr = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue || '');
      
      if (oldStr !== newStr) {
        changesMap.set(field, {
          oldValue: oldValue,
          newValue: newValue
        });
      }
    }

    // Create delivery change record if there are changes
    if (changesMap.size > 0) {
      await DeliveryChange.create({
        customerId: delivery.customerId || 'UNKNOWN',
        customerName: delivery.customerName || 'Unknown Customer',
        customerPhone: '',
        scheduledDate: delivery.scheduledTime || new Date(),
        appliedToDelivery: delivery._id,
        uploadedBy: req.user._id,
        changes: changesMap,
        reason: updateData.changeReason || 'Delivery updated',
        status: 'applied'
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('delivery:updated', delivery);
    } else {
      console.warn('Socket.io not initialized - cannot emit delivery:updated');
    }

    res.json({
      success: true,
      message: 'Delivery updated successfully',
      data: { delivery }
    });
  } catch (error) {
    console.error('Update delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Start delivery (Driver)
// @route   POST /api/deliveries/:id/start
// @access  Private/Driver
router.post('/:id/start', [
  body('bagQRCode').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bagQRCode, location } = req.body;
    const trimmedCode = typeof bagQRCode === 'string' ? bagQRCode.trim() : bagQRCode;
    const normalizedBagId = typeof trimmedCode === 'string' ? trimmedCode.toUpperCase() : trimmedCode;
    const deliveryId = req.params.id;

    // Find delivery
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    const deliveryDriverId = getDeliveryDriverId(delivery);
    const requesterId = getUserId(req.user);
    if (!deliveryDriverId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery has not been assigned to a driver yet'
      });
    }

    if (!requesterId || deliveryDriverId !== requesterId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find and assign bag
    const bag = await Bag.findOne({
      $or: [
        { bagId: normalizedBagId },
        { qrCode: trimmedCode },
      ],
    });
    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found'
      });
    }

    if (bag.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Bag is not available'
      });
    }

    // Assign bag to delivery
    await bag.assignToDriver(req.user._id, deliveryId);
    delivery.bag = {
      bagId: bag.bagId,
      assignedAt: new Date()
    };

    // Update delivery status
    await delivery.updateStatus('picked_up', 'Package picked up and bag assigned', location);

    // Update driver status
    await User.findByIdAndUpdate(req.user._id, {
      'profile.status': 'busy'
    });

    // Emit real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('delivery:statusUpdate', delivery);
      io.emit('driver:statusUpdate', {
        driverId: req.user._id,
        status: 'busy'
      });
    } else {
      console.warn('Socket.io not initialized - cannot emit status updates (start)');
    }

    res.json({
      success: true,
      message: 'Delivery started successfully',
      data: { delivery }
    });
  } catch (error) {
    console.error('Start delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Mark a collection as collected (Driver uploads proof photo)
// @route   POST /api/deliveries/:id/collect
// @access  Private/Driver,Admin,Dispatcher
router.post('/:id/collect', upload.single('proofImage'), handleUploadError, authorize(['driver', 'admin', 'super_admin', 'dispatcher']), async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }
    if (delivery.type !== 'Collection') {
      return res.status(400).json({ success: false, message: 'This delivery is not a collection' });
    }
    if (delivery.status === 'collected') {
      return res.status(400).json({ success: false, message: 'Collection already marked as collected' });
    }

    // Resolve photo URL from uploaded file or body field
    let photoUrl = req.body.photoUrl || null;
    if (req.file) {
      // req.file.path is absolute path like: /path/to/uploads/proofImage-xxxxx.jpg
      // We need to extract just the relative part: uploads/proofImage-xxxxx.jpg
      let filePath = req.file.location || req.file.path || null;
      if (filePath) {
        // If it's an absolute path, extract just the uploads/filename part
        if (filePath.includes('uploads')) {
          filePath = filePath.substring(filePath.indexOf('uploads'));
        }
        // Ensure it starts with /
        photoUrl = filePath.startsWith('/') ? filePath : '/' + filePath;
      }
    }

    delivery.status = 'collected';
    if (!delivery.collectionDetails) delivery.collectionDetails = {};
    delivery.collectionDetails.collectedAt = new Date();
    if (photoUrl) delivery.collectionDetails.collectedPhotoUrl = photoUrl;
    delivery.collectionDetails.noBagsAvailable = req.body.noBagsAvailable === 'true' || req.body.noBagsAvailable === true;

    delivery.timeline.push({
      status: 'collected',
      timestamp: new Date(),
      notes: delivery.collectionDetails.noBagsAvailable
        ? 'No bags available - reported by driver'
        : (req.body.notes || 'Marked as collected')
    });

    await delivery.save();

    const io = req.app.get('io');
    if (io) io.emit('delivery:updated', delivery);

    return res.json({ success: true, message: 'Collection marked as collected', data: { delivery } });
  } catch (error) {
    console.error('Collect endpoint error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @desc    Complete delivery (Driver)
// @route   POST /api/deliveries/:id/complete
// @access  Private/Driver
router.post('/:id/complete', upload.array('proofImages', 5), handleUploadError, async (req, res) => {
  try {
    const { location, notes } = req.body;
    const deliveryId = req.params.id;
    const normalizedLocation = normalizeLocationPayload(location);

    // Find delivery
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    const deliveryDriverId = getDeliveryDriverId(delivery);
    const requesterId = getUserId(req.user);
    if (!deliveryDriverId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery has not been assigned to a driver yet'
      });
    }

    if (!requesterId || deliveryDriverId !== requesterId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Handle proof images (multipart file uploads — legacy web flow)
    const proofImages = req.files ? req.files.map(file => file.filename) : [];

    // Merge proof from request body (React Native sends CDN URLs here)
    const bodyProof = req.body.proof
      ? (typeof req.body.proof === 'string' ? JSON.parse(req.body.proof) : req.body.proof)
      : {};

    // CDN photo URL can also arrive as a top-level req.body.photoUrl
    const bodyPhotoUrl = req.body.photoUrl || bodyProof.photoUrl || null;

    // Build proof: body proof takes precedence; fall back to uploaded files
    const proofLocation = normalizedLocation || undefined;
    const mergedImages = bodyProof.images?.length
      ? bodyProof.images
      : proofImages.length
        ? proofImages
        : bodyPhotoUrl
          ? [bodyPhotoUrl]
          : [];

    delivery.proof = {
      ...bodyProof,
      images: mergedImages,
      photoUrl: bodyPhotoUrl || mergedImages[0] || undefined,
      timestamp: new Date(),
      location: proofLocation
    };

    // Complete delivery
    await delivery.updateStatus(
      'delivered',
      notes || 'Delivery completed',
      normalizedLocation || location
    );

    // Return bag to warehouse
    if (delivery.bag && delivery.bag.bagId) {
      const bag = await Bag.findOne({ bagId: delivery.bag.bagId });
      if (bag) {
        const userName = resolveUserDisplayName(req.user);
        const updatedBag = await bag.returnToWarehouse({
          returnedBy: req.user?._id,
          returnedByName: userName,
          location: normalizedLocation,
          historyNote: `Bag returned after completing delivery ${deliveryId}`,
        });

        const bagReturnedAt = updatedBag.returnedAt || new Date();

        if (!Array.isArray(delivery.timeline)) {
          delivery.timeline = [];
        }
        delivery.timeline.push({
          status: 'bag_returned',
          timestamp: bagReturnedAt,
          notes: `Bag ${delivery.bag.bagId} returned to warehouse`,
        });

        if (delivery.bagAssignment) {
          delivery.bagAssignment.status = 'returned';
          delivery.bagAssignment.returnedAt = bagReturnedAt;
        }

        if (delivery.bag) {
          delivery.bag.returnedAt = bagReturnedAt;
        } else {
          delivery.bag = {
            bagId: delivery.bagAssignment?.bagId || delivery.bag?.bagId,
            returnedAt: bagReturnedAt,
          };
        }

        await delivery.save();
      }
    }

    // Update driver status and KPI
    await User.findByIdAndUpdate(req.user._id, {
      'profile.status': 'available',
      $inc: {
        'kpi.totalDeliveries': 1,
        'kpi.onTimeDeliveries': delivery.lateMinutes === 0 ? 1 : 0
      }
    });

    // Recalculate KPI scores
    await recalculateDriverKPI(req.user._id);

    // Emit real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('delivery:statusUpdate', delivery);
      io.emit('driver:statusUpdate', {
        driverId: req.user._id,
        status: 'available'
      });
    } else {
      console.warn('Socket.io not initialized - cannot emit status updates (complete)');
    }

    res.json({
      success: true,
      message: 'Delivery completed successfully',
      data: { delivery }
    });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.post('/return-bag', async (req, res) => {
  try {
    const {
      bagId,
      bagQRCode,
      notes,
      reason,
      location,
      driverId,
      driverName,
      timestamp,
    } = req.body || {};

    const identifier = bagId ?? bagQRCode;
    const normalizedBagId = normalizeBagId(identifier);

    if (!normalizedBagId) {
      return res.status(400).json({
        success: false,
        message: 'bagId or bagQRCode is required to return a bag',
      });
    }

    const lookupConditions = [{ bagId: normalizedBagId }];
    if (identifier) {
      lookupConditions.push({ qrCode: identifier });
      if (identifier !== normalizedBagId) {
        lookupConditions.push({ qrCode: normalizedBagId });
      }
    }

    const bag = await Bag.findOne({ $or: lookupConditions });

    if (!bag) {
      return res.status(404).json({
        success: false,
        message: 'Bag not found',
      });
    }

    const normalizedLocation = normalizeLocationPayload(location);
    const resolvedDriverId =
      driverId && mongoose.Types.ObjectId.isValid(driverId)
        ? driverId
        : req.user?._id;

    const resolvedDriverName =
      (typeof driverName === 'string' && driverName.trim()) ||
      resolveUserDisplayName(req.user) ||
      undefined;

    const historyNote = resolvedDriverName
      ? `Bag returned by ${resolvedDriverName}`
      : 'Bag returned to warehouse';

    const updatedBag = await bag.returnToWarehouse({
      returnedBy: resolvedDriverId,
      returnedByName: resolvedDriverName,
      location: normalizedLocation,
      notes: notes || reason,
      returnedAt: timestamp ? new Date(timestamp) : undefined,
      historyNote,
    });

    const bagReturnedAt = updatedBag.returnedAt || new Date();

    const deliveriesToUpdate = await Delivery.find({
      'bagAssignment.bagId': normalizedBagId,
      'bagAssignment.status': { $ne: 'returned' },
    });

    for (const delivery of deliveriesToUpdate) {
      if (delivery.bagAssignment) {
        delivery.bagAssignment.status = 'returned';
        delivery.bagAssignment.returnedAt = bagReturnedAt;
      }

      if (!Array.isArray(delivery.timeline)) {
        delivery.timeline = [];
      }

      delivery.timeline.push({
        status: 'bag_returned',
        timestamp: bagReturnedAt,
        notes: `Bag ${normalizedBagId} returned to warehouse`,
      });

      if (delivery.bag) {
        delivery.bag.returnedAt = bagReturnedAt;
      } else {
        delivery.bag = {
          bagId: normalizedBagId,
          returnedAt: bagReturnedAt,
        };
      }

      await delivery.save();
    }

    await updatedBag.populate('assignedTo.driver', 'profile.firstName profile.lastName profile.colorCode');

    res.json({
      success: true,
      message: 'Bag returned successfully',
      data: {
        bag: updatedBag,
        bagId: updatedBag.bagId,
        returnedAt: bagReturnedAt,
      },
    });
  } catch (error) {
    console.error('Error processing bag return:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});


// @desc    Get driver's today deliveries
// @route   GET /api/deliveries/driver/today
// @access  Private/Driver
router.get('/driver/today', protect, async (req, res) => {
  try {
    const deliveries = await Delivery.getDriverTodaysDeliveries(req.user._id)
      .populate('driver', 'profile.firstName profile.lastName profile.colorCode email')
      .lean();

    res.json({
      success: true,
      data: { deliveries }
    });
  } catch (error) {
    console.error('❌ Get driver deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Update delivery with bag assignment
router.patch('/:id/bag-assignment', async (req, res) => {
  try {
    const { bagId, proof } = req.body;
    
    const delivery = await Delivery.findById(req.params.id);
    
    if (!delivery) {
      return res.status(404).json({ message: 'Delivery not found' });
    }

    const deliveryDriverId = getDeliveryDriverId(delivery);
    const requesterId = getUserId(req.user);
    if (!deliveryDriverId) {
      return res.status(400).json({ message: 'Delivery has not been assigned to a driver yet' });
    }
    if (!requesterId || deliveryDriverId !== requesterId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update delivery status and bag assignment
    delivery.status = 'delivered';
    delivery.deliveredTime = new Date();
    
    // Calculate timing deltas with 3-hour early threshold
    const scheduledTime = new Date(delivery.scheduledTime);
    const deliveredTime = new Date();
    const diffMinutes = Math.round((deliveredTime - scheduledTime) / (1000 * 60));
    const earlyThresholdTime = new Date(scheduledTime.getTime() - (180 * 60 * 1000));
    const isEarly = deliveredTime < earlyThresholdTime;

    delivery.lateMinutes = diffMinutes > 0 ? diffMinutes : 0;
    delivery.earlyMinutes = isEarly
      ? Math.max(0, Math.round((earlyThresholdTime - deliveredTime) / (1000 * 60)))
      : 0;
    delivery.deliveryType = isEarly ? 'early' : diffMinutes > 0 ? 'late' : 'on-time';

    // Add bag assignment and proof
    if (bagId) {
      await applyBagAssignmentToDelivery(delivery, bagId, req.user.id);
    }

    if (proof) {
      delivery.proof = { ...delivery.proof, ...proof };
    }

    // Add to timeline
    delivery.timeline.push({
      status: 'delivered',
      timestamp: new Date(),
      notes: bagId ? `Delivery completed with bag ${bagId}` : 'Delivery completed'
    });

    await delivery.save();
    
    res.json(delivery);
  } catch (error) {
    console.error('Error updating delivery with bag assignment:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error', error: error.message });
  }
});

// Helper function to recalculate driver KPI
async function recalculateDriverKPI(driverId) {
  try {
    const driver = await User.findById(driverId);
    const deliveries = await Delivery.find({ 
      driver: driverId, 
      status: 'delivered' 
    });

    const totalDeliveries = deliveries.length;
    const onTimeDeliveries = deliveries.filter(d => d.lateMinutes === 0).length;
    const totalLateTime = deliveries.reduce((sum, d) => sum + d.lateMinutes, 0);
    const accuracyRate = totalDeliveries > 0 ? (onTimeDeliveries / totalDeliveries) * 100 : 0;
    const avgLateTime = totalDeliveries > 0 ? totalLateTime / totalDeliveries : 0;

    // Simple KPI score calculation (you can customize this)
    const kpiScore = Math.max(0, 100 - (avgLateTime * 2) - ((1 - (accuracyRate / 100)) * 50));

    await User.findByIdAndUpdate(driverId, {
      'kpi.score': Math.round(kpiScore),
      'kpi.accuracyRate': Math.round(accuracyRate),
      'kpi.avgLateTime': Math.round(avgLateTime * 10) / 10,
      'kpi.totalDeliveries': totalDeliveries,
      'kpi.onTimeDeliveries': onTimeDeliveries
    });
  } catch (error) {
    console.error('Recalculate KPI error:', error);
  }
}

// Update delivery status (for driver)
// Update delivery status (for driver)
// Update delivery status (for driver)
// Update delivery status (for driver)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, proof, bagId } = req.body;
    
    const delivery = await Delivery.findById(req.params.id);
    
    if (!delivery) {
      return res.status(404).json({ message: 'Delivery not found' });
    }

    const deliveryDriverId = getDeliveryDriverId(delivery);
    const requesterId = getUserId(req.user);
    if (!deliveryDriverId) {
      return res.status(400).json({ message: 'Delivery has not been assigned to a driver yet' });
    }
    if (!requesterId || deliveryDriverId !== requesterId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update delivery status
    delivery.status = status;

    if (status === 'delivered') {
      const deliveredTime = new Date();
      delivery.deliveredTime = deliveredTime;
      delivery.completedAt = deliveredTime;
      
      // Calculate timing deltas with 3-hour early threshold
      const scheduledTime = new Date(delivery.scheduledTime);
      const diffMinutes = Math.round((deliveredTime - scheduledTime) / (1000 * 60));
      const earlyThresholdTime = new Date(scheduledTime.getTime() - (180 * 60 * 1000));
      const isEarly = deliveredTime < earlyThresholdTime;

      delivery.lateMinutes = diffMinutes > 0 ? diffMinutes : 0;
      delivery.earlyMinutes = isEarly
        ? Math.max(0, Math.round((earlyThresholdTime - deliveredTime) / (1000 * 60)))
        : 0;
      delivery.deliveryType = isEarly ? 'early' : diffMinutes > 0 ? 'late' : 'on-time';
    } else if (status === 'completed') {
      const completedTime = new Date();
      delivery.completedAt = completedTime;
      // Tasks marked as completed should not carry over delivery timing penalties
      delivery.deliveredTime = delivery.deliveredTime || completedTime;
      delivery.deliveryType = 'on-time';
      delivery.lateMinutes = 0;
      delivery.earlyMinutes = 0;
    } else {
      // Reset timing metadata if status moves away from terminal states
      delivery.deliveryType = 'on-time';
      delivery.lateMinutes = 0;
      delivery.earlyMinutes = 0;
      delivery.completedAt = undefined;
    }

    // Handle proof data safely
    if (proof) {
      // Initialize proof object if it doesn't exist
      if (!delivery.proof) {
        delivery.proof = {};
      }
      
      // Safely merge proof data
      Object.keys(proof).forEach(key => {
        if (proof[key] !== undefined && proof[key] !== null) {
          delivery.proof[key] = proof[key];
        }
      });

      // Keep photoUrl and images in sync so both web and React Native sources work
      if (delivery.proof.photoUrl && (!delivery.proof.images || delivery.proof.images.length === 0)) {
        delivery.proof.images = [delivery.proof.photoUrl];
      } else if (delivery.proof.images && delivery.proof.images.length > 0 && !delivery.proof.photoUrl) {
        delivery.proof.photoUrl = delivery.proof.images[0];
      }

      // Ensure timestamp is set
      if (!delivery.proof.timestamp) {
        delivery.proof.timestamp = new Date();
      }

      // Persist customer location into delivery.gpsLocation when provided
      if (proof.location && status === 'delivered') {
        const { lat, lng, link } = proof.location;
        if (typeof lat === 'number' && typeof lng === 'number') {
          delivery.gpsLocation = {
            lat,
            lng,
            link: link || `https://www.google.com/maps?q=${lat},${lng}`
          };
        }
      }
    }

    // Add bag assignment if provided
    if (bagId) {
      await applyBagAssignmentToDelivery(delivery, bagId, req.user.id);
    }

    // Add to timeline
    delivery.timeline.push({
      status: status,
      timestamp: new Date(),
      notes: bagId ? `Delivery completed with bag ${bagId}` : `Status updated to ${status}`
    });

    await delivery.save();
    
    // Populate driver information before returning
    await delivery.populate('driver');
    
    res.json({
      success: true,
      message: 'Delivery status updated successfully',
      delivery: delivery.toObject()
    });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.statusCode ? error.message : 'Server error', 
      error: error.message 
    });
  }
});



// @desc    Delete deliveries by ids
// @route   DELETE /api/deliveries/by-ids
// @access  Private/Admin
router.delete('/by-ids', authorize(['admin', 'super_admin']), async (req, res) => {
  try {
    const { deliveryIds } = req.body;

    if (!Array.isArray(deliveryIds) || deliveryIds.length === 0) {
      return res.status(400).json({ success: false, message: 'deliveryIds array is required' });
    }

    // Validate ObjectIds
    const invalidId = deliveryIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) {
      return res.status(400).json({ success: false, message: `Invalid delivery id: ${invalidId}` });
    }

    // Fetch deliveries before deletion for Slack notification
    const deliveriesToDelete = await Delivery.find({ _id: { $in: deliveryIds } }).lean();
    
    const result = await Delivery.deleteMany({ _id: { $in: deliveryIds } });

    // Send Slack notification
    const deletedByName = req.user?.profile?.firstName
      ? `${req.user.profile.firstName} ${req.user.profile.lastName || ''}`.trim()
      : req.user?.email || req.user?._id || 'Unknown user';
    
    sendDeliveryRemovalToSlack(deliveriesToDelete, {
      deletedBy: deletedByName
    }).catch(() => {});

    const io = req.app.get('io');
    if (io) {
      io.emit('deliveries:deleted', {
        count: result.deletedCount,
        ids: deliveryIds
      });
    }

    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} deliveries`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Delete deliveries by ids error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// @desc    Delete deliveries by date range
// @route   DELETE /api/deliveries/bulk-delete
// @access  Private/Admin
router.delete('/bulk-delete', authorize(['admin', 'super_admin']), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.body;

    // Validate input
    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'dateFrom and dateTo are required'
      });
    }

    // Parse dates
    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    // Validate dates
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Expected ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
      });
    }

    // Validate date range
    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be on or before end date'
      });
    }

    // Set end date to end of day for inclusive range
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setHours(23, 59, 59, 999);

    // Fetch deliveries before deletion for Slack notification
    const deliveriesToDelete = await Delivery.find({
      scheduledTime: {
        $gte: startDate,
        $lte: adjustedEndDate
      }
    }).lean();

    // Delete deliveries within the date range
    const result = await Delivery.deleteMany({
      scheduledTime: {
        $gte: startDate,
        $lte: adjustedEndDate
      }
    });

    // Send Slack notification
    const deletedByName = req.user?.profile?.firstName
      ? `${req.user.profile.firstName} ${req.user.profile.lastName || ''}`.trim()
      : req.user?.email || req.user?._id || 'Unknown user';
    
    sendDeliveryRemovalToSlack(deliveriesToDelete, {
      deletedBy: deletedByName
    }).catch(() => {});

    // Emit real-time update for deleted deliveries
    const io = req.app.get('io');
    if (io) {
      io.emit('deliveries:deleted', {
        count: result.deletedCount,
        dateRange: {
          from: startDate.toISOString(),
          to: adjustedEndDate.toISOString()
        }
      });
    } else {
      console.warn('Socket.io not initialized - cannot emit deliveries:deleted');
    }

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} deliveries from ${startDate.toDateString()} to ${endDate.toDateString()}`,
      data: {
        deletedCount: result.deletedCount,
        dateRange: {
          from: startDate.toISOString(),
          to: adjustedEndDate.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Bulk delete deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH endpoint to update delivery gpsLocation
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { gpsLocation } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid delivery ID' });
    }

    const delivery = await Delivery.findByIdAndUpdate(
      id,
      { gpsLocation },
      { new: true, runValidators: true }
    );

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    res.json({
      success: true,
      message: 'Delivery updated successfully',
      data: delivery
    });
  } catch (error) {
    console.error('Update delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Report Issue - POST /:id/report-issue
router.post('/:id/report-issue', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { complaint } = req.body;

    if (!complaint || !complaint.complaintType) {
      return res.status(400).json({
        success: false,
        message: 'Complaint type is required'
      });
    }

    // Find delivery
    const delivery = await Delivery.findById(id);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Update delivery with complaint (merge with existing complaint data if any)
    const existingComplaint = delivery.complaint || {};
    delivery.complaint = {
      ...existingComplaint,
      ...complaint,
      hasComplaint: true,
      reportedAt: new Date()
    };
    
    console.log('Saving complaint data:', JSON.stringify(delivery.complaint, null, 2));
    await delivery.save();

    // Send to Slack
    const complaintTypeLabel = {
      late: 'Late Delivery',
      early: 'Early Delivery',
      missed: 'Missed Delivery',
      wrong_address: 'Wrong Address',
      delivery_issue: 'Delivery Issue',
      food_quality: 'Food Quality',
      major_incident: 'Major Incident',
      damaged_food: 'Damaged Food',
      macros_inaccuracy: 'Macros Inaccuracy',
      late_delivery_transcorp: 'Late delivery - Transcorp',
      wrong_food: 'Wrong Food',
      other: 'Other'
    }[delivery.complaint?.complaintType] || delivery.complaint?.complaintType || 'Unknown';

    const compensationText = delivery.complaint?.compensation 
      ? delivery.complaint.compensation.type === 'refund'
        ? `💰 Refund: AED ${delivery.complaint.compensation.amount}`
        : `📅 Extra Days: ${delivery.complaint.compensation.days} day(s)`
      : 'None';

    const slackMessage = {
      text: '⚠️ *New Issue Report*',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Issue Report'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Customer:*\n${delivery.customerName}`
            },
            {
              type: 'mrkdwn',
              text: `*ID:*\n${delivery.customerId}`
            },
            {
              type: 'mrkdwn',
              text: `*Complaint Type:*\n${complaintTypeLabel}`
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${delivery.status || 'Unknown'}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Remarks:*\n${delivery.complaint?.remarks || 'None'}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Compensation:*\n${compensationText}`
            },
            {
              type: 'mrkdwn',
              text: `*Reported By:*\n${req.user?.profile?.firstName || 'Unknown'}`
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_Reported at ${new Date().toLocaleString()}_`
            }
          ]
        }
      ]
    };

    // Send to Slack with fallbacks
    const slackWebhooks = [
      process.env.SLACK_ISSUE_REPORT_WEBHOOK_URL,
      process.env.SLACK_MANUAL_ENTRY_WEBHOOK_URL,
      process.env.SLACK_WEBHOOK_URL
    ].filter(Boolean);

    let slackSent = false;
    for (const webhook of slackWebhooks) {
      try {
        await axios.post(webhook, slackMessage, { timeout: 5000 });
        slackSent = true;
        console.log('✅ Issue report sent to Slack');
        break;
      } catch (error) {
        console.warn(`⚠️ Failed to send issue report to Slack (${webhook}):`, error.message);
      }
    }

    if (!slackSent) {
      console.warn('⚠️ Issue report failed to send to all Slack webhooks');
    }

    res.status(200).json({
      success: true,
      message: 'Issue reported successfully',
      data: delivery
    });
  } catch (error) {
    console.error('Report issue error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add this route to your driver routes

// Get all complaints - GET /api/deliveries/complaints
router.get('/complaints/all', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      complaintType,
      resolved,
      search,
      sortBy = 'reportedAt',
      sortOrder = -1,
      reportedDateFrom,
      reportedDateTo
    } = req.query;

    // Build query filters
    const filters = [];

    // Must have a complaint
    filters.push({ 'complaint.hasComplaint': true });

    // Filter by complaint type
    if (complaintType && complaintType !== 'all') {
      console.log('Filtering by complaint type:', complaintType);
      filters.push({ 'complaint.complaintType': complaintType });
    }

    // Filter by resolved status
    if (resolved !== undefined && resolved !== 'all') {
      console.log('Filtering by resolved:', resolved);
      filters.push({ 'complaint.resolved': resolved === 'true' });
    }

    // Filter by date range
    if (reportedDateFrom || reportedDateTo) {
      console.log('Filtering by date range:', { reportedDateFrom, reportedDateTo });
      const dateFilter = {};
      if (reportedDateFrom) {
        dateFilter.$gte = new Date(reportedDateFrom);
      }
      if (reportedDateTo) {
        dateFilter.$lte = new Date(reportedDateTo);
      }
      filters.push({
        $or: [
          { 'complaint.reportedAt': dateFilter },
          { 'updatedAt': dateFilter }
        ]
      });
    }

    // Search by customer name or ID
    if (search) {
      console.log('Searching for:', search);
      filters.push({
        $or: [
          { customerName: { $regex: search, $options: 'i' } },
          { customerId: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // Combine all filters with $and
    const query = filters.length > 0 ? { $and: filters } : { 'complaint.hasComplaint': true };

    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * pageSize;

    const sortObj = {};
    if (sortBy === 'reportedAt') {
      sortObj['complaint.reportedAt'] = parseInt(sortOrder, 10);
      sortObj['updatedAt'] = parseInt(sortOrder, 10);
    } else {
      sortObj[sortBy] = parseInt(sortOrder, 10);
    }

    console.log('Final query:', JSON.stringify(query, null, 2));
    console.log('Sort:', sortObj);

    const [complaints, total] = await Promise.all([
      Delivery.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .populate('driver', 'profile email')
        .lean(),
      Delivery.countDocuments(query)
    ]);

    console.log(`Found ${complaints.length} complaints out of ${total} total`);

    // Ensure complaint data is present
    const complaintsWithData = complaints.map(c => ({
      ...c,
      complaint: {
        ...c.complaint,
        reportedAt: c.complaint?.reportedAt || c.updatedAt
      }
    }));

    res.json({
      success: true,
      data: {
        complaints: complaintsWithData,
        pagination: {
          total,
          pages: Math.ceil(total / pageSize),
          currentPage: pageNum,
          pageSize
        }
      }
    });
  } catch (error) {
    console.error('Fetch complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get assignment suggestions (without saving)
router.post('/:id/assignment-suggestions', protect, authorize(['admin', 'super_admin', 'dispatcher']), async (req, res) => {
  try {
    const { id } = req.params;

    const delivery = await Delivery.findById(id);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Return simple message - AI auto-assignment removed
    return res.status(404).json({
      success: false,
      message: 'AI auto-assignment feature has been removed'
    });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get assignment suggestions'
    });
  }
});

// Manually set coordinates for a delivery (persists on the delivery/customer record)
router.post('/:id/manual-coords', protect, authorize(['driver', 'dispatcher', 'manager', 'admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng, link, mapsUrl, address } = req.body;

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return res.status(400).json({ success: false, message: 'lat and lng are required and must be numbers' });
    }

    const delivery = await Delivery.findById(id);
    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    // Optionally update address/link if provided
    if (address) {
      delivery.address = address;
    }
    const linkToSave = link || mapsUrl || delivery.gpsLocation?.link;

    await saveCustomerCoords(delivery, parsedLat, parsedLng, linkToSave);

    // Best-effort: update other deliveries for same customer missing coords so future requests skip geocoding
    await Delivery.updateMany(
      {
        customerId: delivery.customerId,
        $or: [
          { 'gpsLocation.lat': { $exists: false } },
          { 'gpsLocation.lat': null }
        ]
      },
      {
        $set: {
          'gpsLocation.lat': parsedLat,
          'gpsLocation.lng': parsedLng,
          'gpsLocation.link': linkToSave,
          lat: parsedLat,
          lng: parsedLng
        }
      }
    );

    res.json({ success: true, message: 'Coordinates saved', data: { delivery } });
  } catch (error) {
    console.error('Manual coords save error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

export default router;


