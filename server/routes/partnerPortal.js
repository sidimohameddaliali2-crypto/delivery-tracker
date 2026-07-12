import express from 'express';
import PartnerMenuItem from '../models/PartnerMenuItem.js';
import SpaceMenu from '../models/SpaceMenu.js';
import SpacePrice from '../models/SpacePrice.js';
import SpaceOrder, { isInLockWindow } from '../models/SpaceOrder.js';
import OrderLine from '../models/OrderLine.js';
import Invoice from '../models/Invoice.js';
import InvoiceLine from '../models/InvoiceLine.js';
import WasteLog, { WASTE_REASONS } from '../models/WasteLog.js';
import { partnerProtect } from '../middleware/partnerAuth.js';
import { sendNewOrderEmail } from '../services/emailService.js';
import Partner from '../models/Partner.js';

const router = express.Router();
router.use(partnerProtect);

// ─── helpers ─────────────────────────────────────────────────────────────────

// Auto-lock any submitted orders that have passed the 2-day window
const autoLockOrders = async (spaceId) => {
  const submitted = await SpaceOrder.find({ space: spaceId, status: 'submitted' });
  const tolock = submitted.filter(o => isInLockWindow(o.deliveryDate));
  if (tolock.length) {
    await SpaceOrder.updateMany(
      { _id: { $in: tolock.map(o => o._id) } },
      { $set: { status: 'locked', lockedAt: new Date() } }
    );
  }
};

// Get current price for a space+item pair
const currentPrice = async (spaceId, menuItemId) => {
  const sp = await SpacePrice
    .findOne({ space: spaceId, menuItem: menuItemId, effectiveFrom: { $lte: new Date() } })
    .sort({ effectiveFrom: -1 });
  return sp ? sp.price : null;
};

// ─── Profile ──────────────────────────────────────────────────────────────────

// PATCH /api/partner/profile — update partner's own profile fields
router.patch('/profile', async (req, res) => {
  try {
    const allowed = ['defaultDeliveryTime'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const partner = await Partner.findByIdAndUpdate(req.partner._id, updates, { new: true });
    res.json({
      success: true,
      data: {
        defaultDeliveryTime: partner.defaultDeliveryTime
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Menu ─────────────────────────────────────────────────────────────────────

// GET /api/partner/menu?date=YYYY-MM-DD — items assigned to this space, filtered by availability date
router.get('/menu', async (req, res) => {
  try {
    const spaceId = req.partner._id;
    const assignments = await SpaceMenu
      .find({ space: spaceId, isActive: true })
      .populate('menuItem');

    const prices = await SpacePrice.aggregate([
      { $match: { space: spaceId, effectiveFrom: { $lte: new Date() } } },
      { $sort: { menuItem: 1, effectiveFrom: -1 } },
      { $group: { _id: '$menuItem', price: { $first: '$price' } } }
    ]);
    const priceMap = {};
    prices.forEach(p => { priceMap[String(p._id)] = p.price; });

    // If a date param is provided, filter by the item's availability window
    const checkDate = req.query.date ? new Date(req.query.date) : null;
    if (checkDate) checkDate.setUTCHours(0, 0, 0, 0);

    const items = assignments
      .filter(a => {
        if (!a.menuItem || a.menuItem.isAvailable === false) return false;
        if (!checkDate) return true;
        const item = a.menuItem;
        if (item.availableFrom) {
          const from = new Date(item.availableFrom); from.setUTCHours(0,0,0,0);
          if (checkDate < from) return false;
        }
        if (item.availableTo) {
          const to = new Date(item.availableTo); to.setUTCHours(0,0,0,0);
          if (checkDate > to) return false;
        }
        return true;
      })
      .map(a => ({
        ...a.menuItem.toObject(),
        price: priceMap[String(a.menuItem._id)] ?? null
      }));

    res.json({ success: true, data: items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Orders ───────────────────────────────────────────────────────────────────

// GET /api/partner/orders
router.get('/orders', async (req, res) => {
  try {
    const spaceId = req.partner._id;
    await autoLockOrders(spaceId);

    const { status, from, to } = req.query;
    const q = { space: spaceId };
    if (status) q.status = status;
    if (from || to) {
      q.deliveryDate = {};
      if (from) q.deliveryDate.$gte = new Date(from);
      if (to) q.deliveryDate.$lte = new Date(to);
    }

    const orders = await SpaceOrder.find(q).sort({ deliveryDate: -1 });
    const orderIds = orders.map(o => o._id);
    const lines = await OrderLine.find({ order: { $in: orderIds } }).populate('menuItem', 'name mealType price');

    const linesByOrder = {};
    lines.forEach(l => {
      const key = String(l.order);
      if (!linesByOrder[key]) linesByOrder[key] = [];
      linesByOrder[key].push(l);
    });

    const result = orders.map(o => ({
      ...o.toObject(),
      lines: linesByOrder[String(o._id)] || [],
      isLocked: isInLockWindow(o.deliveryDate)
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/partner/orders/:id
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await SpaceOrder.findOne({ _id: req.params.id, space: req.partner._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const lines = await OrderLine.find({ order: order._id }).populate('menuItem', 'name mealType');
    res.json({ success: true, data: { ...order.toObject(), lines, isLocked: isInLockWindow(order.deliveryDate) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/partner/orders — upsert a draft order for a delivery date
router.post('/orders', async (req, res) => {
  try {
    const { deliveryDate, lines, notes, deliveryTime, orderType, weekGroupId } = req.body;
    if (!deliveryDate) return res.status(400).json({ success: false, message: 'deliveryDate is required' });
    if (!Array.isArray(lines)) return res.status(400).json({ success: false, message: 'lines must be an array' });

    const spaceId = req.partner._id;
    if (isInLockWindow(deliveryDate)) {
      return res.status(400).json({ success: false, message: 'This delivery date is within the 2-day advance lock window and cannot be ordered for.' });
    }

    let order = await SpaceOrder.findOne({ space: spaceId, deliveryDate: new Date(deliveryDate) });
    if (!order) {
      order = await SpaceOrder.create({
        space: spaceId, deliveryDate: new Date(deliveryDate), createdBy: spaceId,
        notes: notes || '',
        deliveryTime: deliveryTime || null,
        orderType: orderType || 'single',
        weekGroupId: weekGroupId || null
      });
    } else {
      if (order.status === 'locked') return res.status(400).json({ success: false, message: 'Order is locked and cannot be edited.' });
      if (notes !== undefined) order.notes = notes;
      if (deliveryTime !== undefined) order.deliveryTime = deliveryTime;
      await order.save();
    }

    // Upsert lines
    for (const line of lines) {
      const { menuItemId, quantity } = line;
      if (!menuItemId) continue;
      const qty = Number(quantity) || 0;
      if (qty <= 0) {
        await OrderLine.deleteOne({ order: order._id, menuItem: menuItemId });
      } else {
        await OrderLine.findOneAndUpdate(
          { order: order._id, menuItem: menuItemId },
          { quantity: qty },
          { upsert: true, new: true }
        );
      }
    }

    const updatedLines = await OrderLine.find({ order: order._id }).populate('menuItem', 'name mealType');
    res.json({ success: true, data: { ...order.toObject(), lines: updatedLines } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/partner/orders/:id/submit
router.post('/orders/:id/submit', async (req, res) => {
  try {
    const order = await SpaceOrder.findOne({ _id: req.params.id, space: req.partner._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'locked') return res.status(400).json({ success: false, message: 'Order is already locked.' });
    if (order.status === 'submitted') return res.status(400).json({ success: false, message: 'Order already submitted.' });
    if (isInLockWindow(order.deliveryDate)) return res.status(400).json({ success: false, message: 'Delivery date is within the 2-day lock window.' });

    const lines = await OrderLine.find({ order: order._id }).populate('menuItem', 'price');
    if (!lines.length) return res.status(400).json({ success: false, message: 'Order has no items.' });

    const totalAmount = lines.reduce((sum, l) => sum + (Number(l.menuItem?.price) || 0) * l.quantity, 0);
    if (totalAmount < 200) {
      return res.status(400).json({ success: false, message: `Minimum order is AED 200.00. Current total: AED ${totalAmount.toFixed(2)}.` });
    }

    order.status = 'submitted';
    order.submittedAt = new Date();
    await order.save();

    // Send notification email (non-blocking — failure won't break the response)
    const emailLines = await OrderLine.find({ order: order._id }).populate('menuItem', 'name price');
    sendNewOrderEmail({
      partner: req.partner,
      order,
      lines: emailLines.map(l => ({
        itemName: l.menuItem?.name || '—',
        quantity: l.quantity,
        unitPrice: l.menuItem?.price || 0,
        lineTotal: (l.menuItem?.price || 0) * l.quantity,
      })),
      totalAmount,
    }).catch(err => console.error('[email] Order notification failed:', err?.message || err));

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/partner/orders/:id — delete draft only
router.delete('/orders/:id', async (req, res) => {
  try {
    const order = await SpaceOrder.findOne({ _id: req.params.id, space: req.partner._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'draft') return res.status(400).json({ success: false, message: 'Only draft orders can be deleted.' });
    await OrderLine.deleteMany({ order: order._id });
    await order.deleteOne();
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/partner/orders/:id/cancel
router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const order = await SpaceOrder.findOne({ _id: req.params.id, space: req.partner._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'locked') return res.status(400).json({ success: false, message: 'Locked orders cannot be cancelled.' });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, message: 'Order is already cancelled.' });
    if (isInLockWindow(order.deliveryDate)) {
      return res.status(400).json({ success: false, message: 'This order is within the 2-day lock window and can no longer be cancelled.' });
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    await order.save();
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Invoices ─────────────────────────────────────────────────────────────────

// GET /api/partner/invoices
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await Invoice
      .find({ space: req.partner._id, type: 'partner' })
      .populate('order', 'deliveryDate notes')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/partner/invoices/:id
router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await Invoice
      .findOne({ _id: req.params.id, space: req.partner._id, type: 'partner' })
      .populate('order', 'deliveryDate notes');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    const lines = await InvoiceLine.find({ invoice: invoice._id });
    res.json({ success: true, data: { ...invoice.toObject(), lines } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Waste ────────────────────────────────────────────────────────────────────

// POST /api/partner/waste
router.post('/waste', async (req, res) => {
  try {
    const { deliveryDate, menuItemId, quantity, reason, note } = req.body;
    if (!deliveryDate || !menuItemId || !quantity || !reason) {
      return res.status(400).json({ success: false, message: 'deliveryDate, menuItemId, quantity and reason are required' });
    }
    if (!WASTE_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: `reason must be one of: ${WASTE_REASONS.join(', ')}` });
    }
    const item = await PartnerMenuItem.findById(menuItemId).select('name');
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });

    const log = await WasteLog.create({
      space: req.partner._id, deliveryDate: new Date(deliveryDate),
      menuItem: menuItemId, itemName: item.name,
      quantity: Number(quantity), party: 'partner', reason, note: note || '',
      createdById: req.partner._id, createdByModel: 'Partner'
    });
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/partner/waste
router.get('/waste', async (req, res) => {
  try {
    const { from, to } = req.query;
    const q = { space: req.partner._id };
    if (from || to) {
      q.deliveryDate = {};
      if (from) q.deliveryDate.$gte = new Date(from);
      if (to) q.deliveryDate.$lte = new Date(to);
    }
    const logs = await WasteLog.find(q).sort({ deliveryDate: -1 });
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── Reports ──────────────────────────────────────────────────────────────────

// GET /api/partner/reports
router.get('/reports', async (req, res) => {
  try {
    const spaceId = req.partner._id;
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    // Orders summary
    const orderQ = { space: spaceId, status: { $in: ['submitted', 'locked'] } };
    if (from || to) orderQ.deliveryDate = dateFilter;
    const orders = await SpaceOrder.find(orderQ);
    const orderIds = orders.map(o => o._id);

    // Invoice totals
    const invQ = { space: spaceId, type: 'partner', status: 'locked' };
    const invoices = await Invoice.find(invQ).sort({ createdAt: -1 });
    const totalSpend = invoices.reduce((s, i) => s + i.totalRevenue, 0);

    // Top items from invoice lines
    const topItems = await InvoiceLine.aggregate([
      { $match: { invoice: { $in: invoices.map(i => i._id) } } },
      { $group: { _id: '$itemName', totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: '$lineRevenue' } } },
      { $sort: { totalQty: -1 } },
      { $limit: 10 }
    ]);

    // Waste summary
    const wasteQ = { space: spaceId };
    if (from || to) wasteQ.deliveryDate = dateFilter;
    const waste = await WasteLog.aggregate([
      { $match: wasteQ },
      { $group: { _id: '$party', totalQty: { $sum: '$quantity' }, count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        orderCount: orders.length,
        invoiceCount: invoices.length,
        totalSpend,
        recentInvoices: invoices.slice(0, 5),
        topItems,
        waste
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
