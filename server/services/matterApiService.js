import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const formatAddress = (addr) => {
  if (!addr) return '';
  return [addr.building, addr.unit ? `Unit ${addr.unit}` : null, addr.floor, addr.area, addr.emirate]
    .filter(Boolean)
    .join(', ');
};

class MatterApiService {
  constructor() {
    this.baseURL = process.env.MATTER_API_BASE_URL;
    this.token = process.env.MATTER_API_TOKEN;
  }

  client() {
    if (!this.baseURL || !this.token) {
      throw new Error('Matter API is not configured (missing MATTER_API_BASE_URL or MATTER_API_TOKEN)');
    }

    return axios.create({
      baseURL: this.baseURL,
      headers: { Authorization: `Bearer ${this.token}` },
      timeout: 15000
    });
  }

  /**
   * List subscriptions, optionally filtered by email/customerId/renewal date and paginated.
   */
  async listSubscriptions({ page = 1, pageSize = 50, email, customerId, updatedSince } = {}) {
    const response = await this.client().get('/subscriptions', {
      params: {
        page,
        page_size: pageSize,
        email,
        customer_id: customerId,
        updated_since: updatedSince
      }
    });

    return response.data;
  }

  /**
   * Get a single subscription by id.
   */
  async getSubscription(subscriptionId) {
    const response = await this.client().get(`/subscriptions/${subscriptionId}`);
    return response.data;
  }

  /**
   * Find a customer's active website subscription by email and return its
   * macros/calories/snacks_per_day/plan name/address/delivery window. The
   * list endpoint doesn't include these, so this looks up the subscription
   * id first, then fetches the full record.
   */
  async getSubscriptionNutritionByEmail(email) {
    const list = await this.listSubscriptions({ email, pageSize: 1 });
    const match = list?.data?.[0];
    if (!match) return null;

    const detail = await this.getSubscription(match.subscription_id);
    const subscription = detail?.data;
    if (!subscription) return null;

    return {
      subscription_id: subscription.subscription_id,
      macros: subscription.macros || null,
      total_calories: subscription.total_calories ?? null,
      snacks_per_day: subscription.snacks_per_day ?? null,
      plan_name: subscription.plan?.name ?? null,
      customer_addresses: subscription.customer_addresses || [],
      delivery_window: subscription.delivery_window || null
    };
  }

  /**
   * Get the pause state for a subscription.
   */
  async getSubscriptionPauses(subscriptionId) {
    const response = await this.client().get(`/subscriptions/${subscriptionId}/pauses`);
    return response.data;
  }

  /**
   * Page through every subscription (the list endpoint caps at ~100/page).
   */
  async listAllSubscriptions() {
    const pageSize = 100;
    let page = 1;
    let totalPages = 1;
    const all = [];

    do {
      const result = await this.listSubscriptions({ page, pageSize });
      all.push(...(result?.data || []));
      totalPages = result?.meta?.total_pages || 1;
      page += 1;
    } while (page <= totalPages);

    return all;
  }

  /**
   * Find active, non-cycle-ended subscriptions whose delivery_schedule has
   * an active entry for the given date. Checking delivery_schedule requires
   * a full-detail fetch per subscription (the list endpoint doesn't include
   * it), so this is expensive — hundreds of calls for a full customer base —
   * and is meant to be triggered on demand, not on every page load.
   */
  async findSubscriptionsWithDeliveryOnDate(dateKey) {
    const all = await this.listAllSubscriptions();
    const todayStr = new Date().toISOString().slice(0, 10);
    const candidates = all.filter((sub) =>
      sub.subscription_status === 'active'
      && String(sub.cycle_end_date || '').slice(0, 10) >= todayStr
    );

    const CONCURRENCY = 20;
    const matches = [];

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (sub) => {
        try {
          const detail = await this.getSubscription(sub.subscription_id);
          const schedule = detail?.data?.delivery_schedule || [];
          const hasDelivery = schedule.some(
            (entry) => String(entry.date).slice(0, 10) === dateKey && entry.status === 'active'
          );
          if (!hasDelivery) return null;
          return {
            subscription_id: sub.subscription_id,
            customer_id: sub.customer_id,
            name: sub.name,
            email: sub.email,
            phone: detail.data.phone || '',
            address: formatAddress(detail.data.customer_addresses?.[0]),
            meal_frequency: detail.data.plan?.meal_frequency ?? 1,
            exclusions: (detail.data.exclusions || []).map((ex) => ex.title).filter(Boolean),
            subscription_status: sub.subscription_status,
            plan_name: detail.data.plan?.name ?? null,
            cycle_end_date: sub.cycle_end_date ?? null,
            renewal_due_date: sub.renewal_due_date ?? null,
            renewal_eligible: sub.renewal_eligible ?? null
          };
        } catch (error) {
          console.error(`delivery-on-date check failed for subscription ${sub.subscription_id}:`, error.message);
          return null;
        }
      }));
      matches.push(...results.filter(Boolean));
    }

    return matches;
  }

  /**
   * All active subscriptions' contact info (name/email/phone/address).
   * Phone and address only exist on the full-detail record, so this fetches
   * every active subscription's detail — hundreds of calls — meant to be
   * triggered on demand (e.g. an export button), not on every page load.
   */
  async listActiveCustomerContacts() {
    const all = await this.listAllSubscriptions();
    const activeSubs = all.filter((sub) => sub.subscription_status === 'active');

    const CONCURRENCY = 20;
    const contacts = [];

    for (let i = 0; i < activeSubs.length; i += CONCURRENCY) {
      const batch = activeSubs.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (sub) => {
        try {
          const detail = await this.getSubscription(sub.subscription_id);
          const subscription = detail?.data;
          if (!subscription) return null;
          return {
            name: subscription.name || sub.name,
            email: subscription.email || sub.email,
            phone: subscription.phone || '',
            address: formatAddress(subscription.customer_addresses?.[0])
          };
        } catch (error) {
          console.error(`Failed to fetch contact info for subscription ${sub.subscription_id}:`, error.message);
          return null;
        }
      }));
      contacts.push(...results.filter(Boolean));
    }

    return contacts;
  }
}

export default new MatterApiService();
