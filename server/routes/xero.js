import express from 'express';
import { protect } from '../middleware/auth.js';
import xeroApiService from '../services/xeroApiService.js';
import matterApiService from '../services/matterApiService.js';

const router = express.Router();

// One-time admin setup: open this URL directly in a browser to authorise the app with Xero.
router.get('/connect', (req, res) => {
  try {
    res.redirect(xeroApiService.getAuthUrl());
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Xero redirects the browser back here with a code after consent.
router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`Xero authorisation failed: ${error}`);
    if (!code) return res.status(400).send('Missing authorisation code');

    const { tenantName } = await xeroApiService.exchangeCodeForToken(code);
    res.send(`Xero connected to "${tenantName}". You can close this tab.`);
  } catch (error) {
    console.error('Xero callback error:', error.response?.data || error.message);
    res.status(500).send('Failed to connect to Xero. Check server logs.');
  }
});

router.get('/status', protect, async (req, res) => {
  try {
    const token = await xeroApiService.loadToken();
    res.json({ success: true, connected: true, tenantName: token.tenantName, tenantId: token.tenantId });
  } catch (error) {
    res.json({ success: true, connected: false, message: error.message });
  }
});

// Create a Xero invoice for the customer behind a Matter subscription.
router.post('/invoices/from-subscription/:subscriptionId', protect, async (req, res) => {
  try {
    const raw = await matterApiService.getSubscription(req.params.subscriptionId);
    const subscription = raw?.data || raw;
    const invoice = await xeroApiService.createInvoiceForSubscription(subscription);
    res.json({ success: true, data: invoice });
  } catch (error) {
    const status = error?.response?.status || 500;
    console.error('Xero create invoice error:', error.response?.data || error.message);
    res.status(status).json({ success: false, message: 'Failed to create Xero invoice', error: error.response?.data || error.message });
  }
});

export default router;
