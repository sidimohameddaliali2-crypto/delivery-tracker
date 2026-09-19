import Customer from '../models/Customer.js';

/**
 * Single place that decides "which internal Customer does this external
 * (Matter website) record belong to". Used by both the single-record match
 * (GET /api/customers/match) and the bulk match (POST /api/customers/match/bulk),
 * so the two views can no longer disagree about whether a subscription is
 * matched — and by the Kitchen auto-populate job (menus.js) that resolves an
 * entire batch of Matter subscriptions against internal customers at once.
 *
 * Match order, stopping at the first hit: a saved manual link (highest
 * confidence — a human already confirmed it) -> email -> phone (last-9-digit
 * suffix) -> name. See Customer.matterSubscriptionId for why manual always
 * wins over the automatic guesses.
 */

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const buildEmailRegex = (email) => {
  const cleaned = String(email || '').trim();
  return new RegExp(`^${escapeRegex(cleaned)}$`, 'i');
};
const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');
const phoneSuffix = (value, len = 9) => normalizePhoneDigits(value).slice(-len);
const normalizeName = (first, last) => [first, last].filter(Boolean).join(' ').trim().toLowerCase();

export const MATCH_PROJECTION = 'customerId email firstName lastName phone company planStartDate cycleDuration amountPaid discount mealExclusion matterSubscriptionId';

/**
 * resolveCustomerMatch({ email, phone, name, subscriptionId })
 *   -> { customer: <Customer doc|null>, matchedBy: 'manual'|'email'|'phone'|'name'|null }
 * Single-record version — hits the DB directly for each cascade level.
 */
export async function resolveCustomerMatch({ email, phone, name, subscriptionId } = {}) {
  let customer = null;
  let matchedBy = null;

  if (subscriptionId && String(subscriptionId).trim()) {
    customer = await Customer.findOne({ matterSubscriptionId: String(subscriptionId).trim() }).select(MATCH_PROJECTION);
    if (customer) matchedBy = 'manual';
  }

  if (!customer && email && String(email).trim()) {
    customer = await Customer.findOne({ email: buildEmailRegex(email) }).select(MATCH_PROJECTION);
    if (customer) matchedBy = 'email';
  }

  if (!customer && phone) {
    const suffix = phoneSuffix(phone);
    if (suffix) {
      const candidates = await Customer.find({ phone: { $exists: true, $ne: '' } }).select(MATCH_PROJECTION);
      customer = candidates.find((c) => phoneSuffix(c.phone) === suffix) || null;
      if (customer) matchedBy = 'phone';
    }
  }

  if (!customer && name && String(name).trim()) {
    const parts = String(name).trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    const query = lastName
      ? { firstName: new RegExp(`^${escapeRegex(firstName)}$`, 'i'), lastName: new RegExp(`^${escapeRegex(lastName)}$`, 'i') }
      : { firstName: new RegExp(`^${escapeRegex(firstName)}$`, 'i') };
    customer = await Customer.findOne(query).select(MATCH_PROJECTION);
    if (customer) matchedBy = 'name';
  }

  return { customer, matchedBy };
}

/**
 * resolveCustomerMatchBulk(customers, subscriptions)
 *   -> Map<subscriptionId, { customer, matchedBy }>
 * In-memory version of the same cascade, run over a pre-fetched customer list
 * against a pre-fetched subscription list — for callers matching hundreds of
 * records at once (the subscription list's "no internal match" filter, and
 * the Kitchen auto-populate job) where a per-record DB round trip would be
 * far too slow.
 *
 * `customers` should include `phone` (and the usual email/name fields) for
 * phone-level matching to work here — callers that can't supply phone (e.g.
 * a subscription payload that itself has no phone) simply won't produce a
 * 'phone' match for that entry, same as if phone were blank.
 */
export function resolveCustomerMatchBulk(customers, subscriptions) {
  const byManualLink = new Map();
  const byEmail = new Map();
  const byPhoneSuffix = new Map();
  const byName = new Map();

  for (const c of customers) {
    if (c.matterSubscriptionId) byManualLink.set(String(c.matterSubscriptionId), c);
    const email = String(c.email || '').trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, c);
    const suffix = phoneSuffix(c.phone);
    if (suffix && !byPhoneSuffix.has(suffix)) byPhoneSuffix.set(suffix, c);
    const name = normalizeName(c.firstName, c.lastName);
    if (name && !byName.has(name)) byName.set(name, c);
  }

  const results = new Map();
  for (const sub of subscriptions) {
    if (!sub || sub.subscriptionId == null) continue;
    const subId = String(sub.subscriptionId);

    let customer = byManualLink.get(subId) || null;
    let matchedBy = customer ? 'manual' : null;

    if (!customer && sub.email) {
      customer = byEmail.get(String(sub.email).trim().toLowerCase()) || null;
      if (customer) matchedBy = 'email';
    }

    if (!customer && sub.phone) {
      const suffix = phoneSuffix(sub.phone);
      if (suffix) {
        customer = byPhoneSuffix.get(suffix) || null;
        if (customer) matchedBy = 'phone';
      }
    }

    if (!customer && sub.name) {
      customer = byName.get(String(sub.name).trim().toLowerCase()) || null;
      if (customer) matchedBy = 'name';
    }

    results.set(subId, { customer, matchedBy });
  }

  return results;
}

/** Manual link always wins — the one place that decides which Matter subscription a customer's data should come from. */
export function resolveMatterSubscriptionId(customer) {
  return customer?.matterSubscriptionId || null;
}

/**
 * The one canonical way a Customer gets created from external Matter data —
 * used by the Kitchen auto-populate job (and anywhere else that needs to seed
 * an internal record from a subscription with no internal match at all)
 * instead of each call site inventing its own shape.
 */
export async function createCustomerFromMatterSubscription(sub) {
  const email = String(sub?.email || sub?.customer_email || '').trim().toLowerCase();
  const name = String(sub?.name || sub?.customer_name || '').trim();
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
  const subscriptionId = String(sub?.subscription_id || sub?.subscriptionId || '').trim();

  const customerId = email
    ? email.split('@')[0]
    : `matter_${subscriptionId || Date.now()}`;

  const customer = new Customer({
    customerId,
    firstName: firstName || name || 'Matter Customer',
    lastName: rest.join(' ') || '',
    email: email || undefined,
    phone: sub?.phone || '',
    matterSubscriptionId: subscriptionId || undefined,
    dataSource: 'MatterApi'
  });

  await customer.save();
  return customer;
}
