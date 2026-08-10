import axios from 'axios';
import dotenv from 'dotenv';
import XeroToken from '../models/XeroToken.js';

dotenv.config();

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const API_BASE = 'https://api.xero.com/api.xro/2.0';
const DEFAULT_SCOPES = 'openid profile email accounting.transactions accounting.contacts offline_access';

class XeroApiService {
  get clientId() { return process.env.XERO_CLIENT_ID; }
  get clientSecret() { return process.env.XERO_CLIENT_SECRET; }
  get redirectUri() { return process.env.XERO_REDIRECT_URI; }
  get scopes() { return process.env.XERO_SCOPES || DEFAULT_SCOPES; }

  assertConfigured() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Xero API is not configured (missing XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI)');
    }
  }

  basicAuthHeader() {
    return Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
  }

  getAuthUrl(state = 'xero-connect') {
    this.assertConfigured();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      state
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  toTokenSet(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      // refresh a minute early to avoid edge-of-expiry failures
      expires_at: Date.now() + (data.expires_in - 60) * 1000
    };
  }

  async fetchConnections(accessToken) {
    const response = await axios.get(CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data.map(c => ({ tenantId: c.tenantId, tenantName: c.tenantName }));
  }

  async exchangeCodeForToken(code) {
    this.assertConfigured();
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri }),
      { headers: { Authorization: `Basic ${this.basicAuthHeader()}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokenSet = this.toTokenSet(response.data);
    const connections = await this.fetchConnections(tokenSet.access_token);

    if (!connections.length) {
      throw new Error('No Xero organisation was authorised. Grant access to at least one organisation during consent.');
    }

    const { tenantId, tenantName } = connections[0];
    await XeroToken.findOneAndUpdate(
      { key: 'default' },
      { key: 'default', tenantId, tenantName, ...tokenSet },
      { upsert: true, new: true }
    );

    return { tenantId, tenantName };
  }

  async refreshAccessToken(refreshToken) {
    this.assertConfigured();
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      { headers: { Authorization: `Basic ${this.basicAuthHeader()}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return this.toTokenSet(response.data);
  }

  async loadToken() {
    const token = await XeroToken.findOne({ key: 'default' });
    if (!token) {
      throw new Error('Xero is not connected yet. Visit /api/xero/connect (while logged in) to authorise this app.');
    }
    return token;
  }

  async getValidToken() {
    let token = await this.loadToken();

    if (Date.now() >= token.expires_at) {
      const refreshed = await this.refreshAccessToken(token.refresh_token);
      token = await XeroToken.findOneAndUpdate({ key: 'default' }, refreshed, { new: true });
    }

    return token;
  }

  async client() {
    const token = await this.getValidToken();
    return {
      tenantId: token.tenantId,
      http: axios.create({
        baseURL: API_BASE,
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Xero-tenant-id': token.tenantId,
          Accept: 'application/json'
        }
      })
    };
  }

  async findContactByEmail(email) {
    const { http } = await this.client();
    const response = await http.get('/Contacts', { params: { where: `EmailAddress="${email}"` } });
    return response.data.Contacts?.[0] || null;
  }

  async createContact({ name, email, phone }) {
    const { http } = await this.client();
    const response = await http.put('/Contacts', {
      Contacts: [{
        Name: name,
        EmailAddress: email,
        Phones: phone ? [{ PhoneType: 'MOBILE', PhoneNumber: phone }] : undefined
      }]
    });
    return response.data.Contacts[0];
  }

  async findOrCreateContact({ name, email, phone }) {
    const existing = await this.findContactByEmail(email);
    return existing || this.createContact({ name, email, phone });
  }

  async createInvoice({ contactId, lineItems, reference, dueDate, currencyCode, status = 'AUTHORISED' }) {
    const { http } = await this.client();
    const response = await http.put('/Invoices', {
      Invoices: [{
        Type: 'ACCREC',
        Contact: { ContactID: contactId },
        Date: new Date().toISOString().slice(0, 10),
        DueDate: dueDate || new Date().toISOString().slice(0, 10),
        LineItems: lineItems,
        Reference: reference,
        CurrencyCode: currencyCode,
        Status: status
      }]
    });
    return response.data.Invoices[0];
  }

  /**
   * Line items derived from a Matter subscription's pricing fields
   * (base_price, bag_price). AccountCode/TaxType are org-specific in Xero,
   * so they're configurable via XERO_SALES_ACCOUNT_CODE / XERO_TAX_TYPE.
   */
  buildLineItemsFromSubscription(subscription) {
    const accountCode = process.env.XERO_SALES_ACCOUNT_CODE || '200';
    const taxType = process.env.XERO_TAX_TYPE || 'NONE';
    const items = [];

    if (subscription.base_price) {
      items.push({
        Description: `${subscription.plan?.name || 'Meal Plan'} subscription (${subscription.starting_date} - ${subscription.cycle_end_date})`,
        Quantity: 1,
        UnitAmount: subscription.base_price,
        AccountCode: accountCode,
        TaxType: taxType
      });
    }

    if (subscription.bag_price) {
      items.push({
        Description: 'Delivery bag deposit',
        Quantity: 1,
        UnitAmount: subscription.bag_price,
        AccountCode: accountCode,
        TaxType: taxType
      });
    }

    return items;
  }

  async createInvoiceForSubscription(subscription) {
    const contact = await this.findOrCreateContact({
      name: subscription.name,
      email: subscription.email,
      phone: subscription.phone
    });

    const lineItems = this.buildLineItemsFromSubscription(subscription);
    if (!lineItems.length) {
      throw new Error('Subscription has no priced items to invoice');
    }

    return this.createInvoice({
      contactId: contact.ContactID,
      lineItems,
      reference: `Matter subscription #${subscription.subscription_id}`,
      currencyCode: subscription.currency
    });
  }
}

export default new XeroApiService();
