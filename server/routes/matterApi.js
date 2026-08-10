import express from 'express';
import { protect } from '../middleware/auth.js';
import matterApiService from '../services/matterApiService.js';

const router = express.Router();

// List subscriptions (filterable, paginated)
router.get('/subscriptions', protect, async (req, res) => {
  try {
    const { page, page_size: pageSize, email, customer_id: customerId, updated_since: updatedSince } = req.query;
    const data = await matterApiService.listSubscriptions({ page, pageSize, email, customerId, updatedSince });
    res.json({ success: true, data });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Matter API list subscriptions error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to fetch subscriptions', error: error.response?.data || error.message });
  }
});

// Look up a subscription's macros/calories by customer email (used by Kitchen List)
router.get('/subscriptions/nutrition-by-email', protect, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: 'email is required' });
    }
    const data = await matterApiService.getSubscriptionNutritionByEmail(email);
    res.json({ success: true, data });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Matter API nutrition-by-email error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to fetch subscription nutrition', error: error.response?.data || error.message });
  }
});

// Find active, non-cycle-ended subscriptions with a scheduled delivery on a
// given date (per their own delivery_schedule). Expensive — checks every
// active subscription's full detail — meant to be triggered on demand.
router.get('/subscriptions/delivery-on-date', protect, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required' });
    }
    const data = await matterApiService.findSubscriptionsWithDeliveryOnDate(date);
    res.json({ success: true, data });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Matter API delivery-on-date error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to check deliveries for date', error: error.response?.data || error.message });
  }
});

// All active customers' contact info (name/email/phone/address), for export.
// Expensive — fetches full detail for every active subscription — meant to
// be triggered on demand.
router.get('/subscriptions/active-contacts', protect, async (req, res) => {
  try {
    const data = await matterApiService.listActiveCustomerContacts();
    res.json({ success: true, data });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Matter API active-contacts error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to fetch active customer contacts', error: error.response?.data || error.message });
  }
});

// Get a single subscription
router.get('/subscriptions/:id', protect, async (req, res) => {
  try {
    const data = await matterApiService.getSubscription(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Matter API get subscription error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to fetch subscription', error: error.response?.data || error.message });
  }
});

// Get a subscription's pause state
router.get('/subscriptions/:id/pauses', protect, async (req, res) => {
  try {
    const data = await matterApiService.getSubscriptionPauses(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Matter API get subscription pauses error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to fetch subscription pauses', error: error.response?.data || error.message });
  }
});

export default router;
