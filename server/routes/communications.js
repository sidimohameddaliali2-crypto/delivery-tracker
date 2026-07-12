import express from 'express';
import * as XLSX from 'xlsx';
import { protect } from '../middleware/auth.js';
import Communication from '../models/Communication.js';
import { sendAndLogSlack, updateSlackMessage } from '../services/slackNotifier.js';
import SlackLog from '../models/SlackLog.js';
import Delivery from '../models/Delivery.js';
import { detectAreaFromAddress } from '../config/areas.js';
// Local timezone offset (minutes) used to interpret time-only inputs as local time
const LOCAL_TZ_OFFSET_MINUTES = Number.parseInt(
  process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || process.env.BUSINESS_TZ_OFFSET_MINUTES || '0',
  10
);
const LOCAL_TZ_OFFSET_MS = LOCAL_TZ_OFFSET_MINUTES * 60 * 1000;

const router = express.Router();

function buildSlackMentions(mentions = []) {
  if (!Array.isArray(mentions) || mentions.length === 0) return '';
  const tokens = mentions
    .map((m) => String(m).trim())
    .filter(Boolean)
    .map((m) => {
      // If looks like a Slack ID (U..., W...), wrap as <@ID>
      if (/^[UW][A-Z0-9]{8,}$/i.test(m)) return `<@${m}>`;
      // If already like <@U...>
      if (/^<@.+>$/.test(m)) return m;
      // If starts with @, keep it; Slack may still highlight
      if (m.startsWith('@')) return m;
      return `@${m}`;
    });
  return tokens.join(' ');
}

function buildSlackText(doc) {
  const typeLabel = {
    renewal: 'Renewal',
    renewal_outside: 'Renewal (Outside Dubai)',
    new_customer: 'New Customer',
    new_customer_outside: 'New Customer (Outside Dubai)'
  }[doc.type] || doc.type;

  // Helper to format date without timezone shift
  const formatDateOnly = (dateValue) => {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const lines = [
    `*${typeLabel}*`,
    doc.customerName ? `• Customer: ${doc.customerName}${doc.customerId ? ` (${doc.customerId})` : ''}` : null,
    doc.city ? `• City: ${doc.city}` : null,
    doc.renewalStartDate ? `• Renewal start: ${formatDateOnly(doc.renewalStartDate)}` : null,
    doc.numberOfDays != null ? `• Number of days: ${doc.numberOfDays}` : null,
    doc.startDate ? `• Start date: ${formatDateOnly(doc.startDate)}` : null,
    // endDate intentionally excluded from Slack per requirements
    doc.deliveryTiming ? `• Delivery timing: ${doc.deliveryTiming}` : null,
    doc.address ? `• Address: ${doc.address}` : null,
    doc.referredBy ? `• Referred by: ${doc.referredBy}` : null,
    doc.contactNo ? `• Contact: ${doc.contactNo}` : null,
    doc.email ? `• Email: ${doc.email}` : null,
    doc.category ? `• Category: ${doc.category}` : null,
    doc.mealPlan ? `• Meal plan: ${doc.mealPlan}` : null,
    doc.dislikes ? `• Dislikes: ${doc.dislikes}` : null,
    doc.breakfast ? `• Breakfast: ${doc.breakfast}` : null,
    doc.discountRate != null ? `• Discount rate: ${doc.discountRate}` : null,
    doc.macros?.c != null ? `• Macros: C ${doc.macros.c} / P ${doc.macros.p ?? '-'} / F ${doc.macros.f ?? '-'} / Kcal ${doc.macros.kcal ?? '-'}` : null,
    doc.mealQuantity != null ? `• Meal quantity: ${doc.mealQuantity}` : null,
    doc.price != null ? `• Price: ${doc.price}` : null,
    doc.deliveryFee != null ? `• Delivery fee: ${doc.deliveryFee}` : null,
    doc.bagDeposit != null ? `• Bag deposit: ${doc.bagDeposit}` : null,
    doc.paymentMethod ? `• Payment: ${doc.paymentMethod === 'cash' ? 'Cash' : 'Payment Link'}` : null,
    doc.message ? `• Notes: ${doc.message}` : null,
  ].filter(Boolean);

  const mentionLine = buildSlackMentions(doc.mentions);
  if (mentionLine) lines.push(mentionLine);
  return lines.join('\n');
}

function parseTimeFromWindow(timing) {
  if (!timing) return { hours: 9, minutes: 0 };
  const match = /(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?<ampm>am|pm)?/i.exec(timing);
  if (!match?.groups) return { hours: 9, minutes: 0 };
  let hours = Number(match.groups.h) || 9;
  const minutes = Number(match.groups.m || '0') || 0;
  const ampm = match.groups.ampm?.toLowerCase();
  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  return { hours, minutes };
}

async function createDeliveriesFromRange({ customerId, customerName, address, deliveryTiming, startDate, endDate }) {
  if (!customerId || !customerName || !address || !startDate) return [];
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) end.setTime(start.getTime());

  const { hours, minutes } = parseTimeFromWindow(deliveryTiming);
  const deliveries = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    // Interpret as local date/time, then convert to UTC like deliveries route
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth(); // 0-based
    const d = dt.getUTCDate();
    const utcMillis = Date.UTC(y, m, d, hours, minutes) - LOCAL_TZ_OFFSET_MS;
    const sched = new Date(utcMillis);
    const data = {
      customerId,
      customerName,
      scheduledTime: sched,
      address,
      company: 'Matter'
    };
    const zone = detectAreaFromAddress(address, '', { company: 'Matter' });
    if (zone) data.zone = zone;
    try {
      const created = await Delivery.create(data);
      deliveries.push(created);
    } catch (err) {
      console.warn('Failed to create delivery from communication:', err.message);
    }
  }
  return deliveries;
}

// Create communication and send to Slack
router.post('/', protect, async (req, res) => {
  try {
    const { type, title, message, customerName, customerId, city, outsideDubai, mentions, renewalStartDate, numberOfDays, macros, mealQuantity, price, deliveryFee, bagDeposit, paymentMethod, deliveryTiming, address, referredBy, contactNo, email, category, mealPlan, startDate, endDate, dislikes } = req.body || {};
    if (!type) return res.status(400).json({ success: false, message: 'type is required' });

    // Keep macros as text if provided
    const parsedMacros = macros && typeof macros === 'object' ? {
      c: macros.c !== undefined ? String(macros.c) : undefined,
      p: macros.p !== undefined ? String(macros.p) : undefined,
      f: macros.f !== undefined ? String(macros.f) : undefined,
      kcal: macros.kcal !== undefined ? String(macros.kcal) : undefined,
    } : undefined;

    const doc = await Communication.create({
      type,
      title,
      message,
      customerName,
      customerId,
      city,
      outsideDubai: Boolean(outsideDubai),
      mentions: Array.isArray(mentions) ? mentions : [],
      renewalStartDate: renewalStartDate ? new Date(renewalStartDate) : undefined,
      numberOfDays: numberOfDays !== undefined ? Number(numberOfDays) : undefined,
      macros: parsedMacros,
      mealQuantity: mealQuantity !== undefined ? String(mealQuantity) : undefined,
      price: price !== undefined ? String(price) : undefined,
      deliveryFee: deliveryFee !== undefined ? String(deliveryFee) : undefined,
      bagDeposit: bagDeposit !== undefined ? String(bagDeposit) : undefined,
      paymentMethod: paymentMethod || 'cash',
      deliveryTiming,
      address,
      referredBy,
      contactNo,
      email,
      category,
      mealPlan,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      dislikes,
      createdBy: req.user?._id || req.user?.id
    });

    let deliveriesCreated = [];
    if ((type === 'new_customer' || type === 'new_customer_outside') && startDate) {
      deliveriesCreated = await createDeliveriesFromRange({
        customerId,
        customerName,
        address,
        deliveryTiming,
        startDate,
        endDate
      });
    }

    // Map communication type to appropriate Slack webhook
    const webhookMap = {
      'new_customer': 'SLACK_NEW_CUSTOMER_WEBHOOK_URL',
      'new_customer_outside': 'SLACK_NEW_CUSTOMER_OUTSIDE_WEBHOOK_URL',
      'renewal': 'SLACK_RENEWAL_WEBHOOK_URL',
      'renewal_outside': 'SLACK_RENEWAL_OUTSIDE_WEBHOOK_URL'
    };
    const webhookEnvKey = webhookMap[type] || 'SLACK_COMMUNICATIONS_WEBHOOK_URL';

    const slackText = buildSlackText(doc);
    const resp = await sendAndLogSlack({
      type: 'communication',
      text: slackText,
      webhookEnvKey,
      meta: {
        customerId: doc.customerId,
        customerName: doc.customerName,
        userId: req.user?._id || req.user?.id,
        communicationId: doc._id
      }
    });

    doc.slackText = slackText;
    doc.sentToSlack = !!resp.ok;
    await doc.save();

    return res.json({ success: true, data: doc, deliveriesCreated: deliveriesCreated.map((d) => d._id), slack: resp });
  } catch (error) {
    console.error('Create communication error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// List communications
router.get('/', protect, async (req, res) => {
  try {
    const { type, limit = 50, page = 1 } = req.query;
    const q = {};
    if (type) q.type = type;
    const per = Math.min(Number(limit) || 50, 200);
    const p = Math.max(Number(page) || 1, 1);
    const docs = await Communication.find(q)
      .sort({ createdAt: -1 })
      .skip((p - 1) * per)
      .limit(per)
      .lean()
      .exec();
    const total = await Communication.countDocuments(q);
    return res.json({ success: true, data: docs, total, page: p, limit: per });
  } catch (error) {
    console.error('List communications error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Delete communication
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Communication.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Communication not found' });
    }
    return res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete communication error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Update communication (allow editing of all fields)
router.put('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    // Normalize mentions to array
    if (typeof updates.mentions === 'string') {
      updates.mentions = updates.mentions
        .split(',')
        .map((s) => String(s).trim())
        .filter(Boolean);
    }
    // Keep new-customer numeric-like fields as text per requirements
    if (updates.macros && typeof updates.macros === 'object') {
      const m = updates.macros;
      if (m.c !== undefined) m.c = String(m.c);
      if (m.p !== undefined) m.p = String(m.p);
      if (m.f !== undefined) m.f = String(m.f);
      if (m.kcal !== undefined) m.kcal = String(m.kcal);
    }
    if (updates.mealQuantity !== undefined) updates.mealQuantity = String(updates.mealQuantity);
    if (updates.price !== undefined) updates.price = String(updates.price);
    if (updates.deliveryFee !== undefined) updates.deliveryFee = String(updates.deliveryFee);
    if (updates.bagDeposit !== undefined) updates.bagDeposit = String(updates.bagDeposit);
    if (updates.discountRate !== undefined) updates.discountRate = String(updates.discountRate);

    const doc = await Communication.findByIdAndUpdate(id, updates, { new: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Communication not found' });
    }
    // Re-send updated message to Slack so edits are reflected
    const webhookMap = {
      'new_customer': 'SLACK_NEW_CUSTOMER_WEBHOOK_URL',
      'new_customer_outside': 'SLACK_NEW_CUSTOMER_OUTSIDE_WEBHOOK_URL',
      'renewal': 'SLACK_RENEWAL_WEBHOOK_URL',
      'renewal_outside': 'SLACK_RENEWAL_OUTSIDE_WEBHOOK_URL'
    };
    const webhookEnvKey = webhookMap[doc.type] || 'SLACK_COMMUNICATIONS_WEBHOOK_URL';
    const latestLog = await SlackLog.findOne({ communicationId: doc._id, type: 'communication' }).sort({ createdAt: -1 }).lean().exec();
    let resp;
    const updatedText = buildSlackText(doc);
    if (latestLog?.channel && latestLog?.ts && process.env.SLACK_BOT_TOKEN) {
      // Try to edit the previous Slack message in-place
      resp = await updateSlackMessage({ channel: latestLog.channel, ts: latestLog.ts, text: updatedText });
    }
    if (!resp || !resp.ok) {
      // Fallback: post an explicit update message
      resp = await sendAndLogSlack({
        type: 'communication_update',
        text: `*Updated Communication*\n${updatedText}`,
        webhookEnvKey,
        meta: {
          customerId: doc.customerId,
          customerName: doc.customerName,
          userId: req.user?._id || req.user?.id,
          communicationId: doc._id
        }
      });
    }
    doc.slackText = updatedText;
    doc.sentToSlack = !!resp.ok;
    await doc.save();
    return res.json({ success: true, data: doc, slack: resp });
  } catch (error) {
    console.error('Update communication error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Export Excel
router.get('/export.xlsx', protect, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    const q = {};
    if (type) q.type = type;
    if (startDate || endDate) {
      const gte = startDate ? new Date(startDate) : null;
      const lte = endDate ? new Date(endDate) : null;
      // Normalize to full-day bounds if only YYYY-MM-DD provided
      if (gte && !isNaN(gte)) {
        gte.setHours(0, 0, 0, 0);
      }
      if (lte && !isNaN(lte)) {
        lte.setHours(23, 59, 59, 999);
      }
      q.createdAt = {};
      if (gte) q.createdAt.$gte = gte;
      if (lte) q.createdAt.$lte = lte;
    }
    const docs = await Communication.find(q).sort({ createdAt: -1 }).lean().exec();
    
    // Helper to format date without timezone shift
    const formatDateOnly = (dateValue) => {
      if (!dateValue) return '';
      const d = new Date(dateValue);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const rows = docs.map((d) => ({
      Date: new Date(d.createdAt).toISOString(),
      Type: d.type,
      CustomerName: d.customerName || '',
      CustomerId: d.customerId || '',
      City: d.city || '',
      OutsideDubai: d.outsideDubai ? 'Yes' : 'No',
      RenewalStart: formatDateOnly(d.renewalStartDate),
      NumberOfDays: d.numberOfDays ?? '',
      StartDate: formatDateOnly(d.startDate),
      EndDate: formatDateOnly(d.endDate),
      DeliveryTiming: d.deliveryTiming || '',
      Address: d.address || '',
      ReferredBy: d.referredBy || '',
      ContactNo: d.contactNo || '',
      Email: d.email || '',
      Category: d.category || '',
      MealPlan: d.mealPlan || '',
      Dislikes: d.dislikes || '',
      Breakfast: d.breakfast || '',
      DiscountRate: d.discountRate ?? '',
      MacrosC: d.macros?.c ?? '',
      MacrosP: d.macros?.p ?? '',
      MacrosF: d.macros?.f ?? '',
      MacrosKcal: d.macros?.kcal ?? '',
      MealQuantity: d.mealQuantity ?? '',
      Price: d.price ?? '',
      DeliveryFee: d.deliveryFee ?? '',
      PaymentMethod: d.paymentMethod || '',
      Mentions: Array.isArray(d.mentions) ? d.mentions.join(', ') : '',
      Message: d.message || '',
      SentToSlack: d.sentToSlack ? 'Yes' : 'No'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Communications');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // Build a descriptive filename if filtered
    const parts = ['communications'];
    if (type) parts.push(type);
    if (startDate || endDate) parts.push(`${startDate || 'all'}-${endDate || 'all'}`);
    const filename = `${parts.join('_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Export communications error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

export default router;
