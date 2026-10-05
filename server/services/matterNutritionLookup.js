import Customer from '../models/Customer.js';
import matterApiService from './matterApiService.js';

const isNotFound = (error) => error?.response?.status === 404;

/**
 * Re-points the internal Customer record(s) at what Matter currently has:
 *  - matterCustomerId is always saved (it's permanent in Matter).
 *  - matterSubscriptionId is replaced only when the record was empty or still
 *    held the old, now-dead id we just looked up — never when it points at a
 *    different live subscription, and never when the unique index objects
 *    (another record already holds that subscription id).
 * Best effort: a failure here must never break the lookup that called it.
 */
async function persistMatterLink(nutrition, { matterCustomerId, matterSubscriptionId }) {
  try {
    const newCustomerId = nutrition?.customer_id != null ? String(nutrition.customer_id) : null;
    const newSubscriptionId = nutrition?.subscription_id != null ? String(nutrition.subscription_id) : null;
    const filters = [];
    if (matterCustomerId) filters.push({ matterCustomerId: String(matterCustomerId) });
    if (matterSubscriptionId) filters.push({ matterSubscriptionId: String(matterSubscriptionId) });
    if (filters.length === 0 || (!newCustomerId && !newSubscriptionId)) return;

    const docs = await Customer.find({ $or: filters }).select('_id matterCustomerId matterSubscriptionId');
    for (const doc of docs) {
      const set = {};
      if (newCustomerId && doc.matterCustomerId !== newCustomerId) set.matterCustomerId = newCustomerId;
      const currentSub = doc.matterSubscriptionId ? String(doc.matterSubscriptionId) : '';
      const staleOrEmpty = !currentSub || currentSub === String(matterSubscriptionId || '');
      if (newSubscriptionId && currentSub !== newSubscriptionId && staleOrEmpty) set.matterSubscriptionId = newSubscriptionId;
      if (Object.keys(set).length === 0) continue;

      try {
        await Customer.updateOne({ _id: doc._id }, { $set: set });
        if (set.matterSubscriptionId) {
          console.log(`Relinked customer ${doc._id} to Matter subscription ${set.matterSubscriptionId} (was ${currentSub || 'empty'})`);
        }
      } catch (error) {
        // Most likely the unique index on matterSubscriptionId — keep the
        // permanent customer id anyway.
        if (set.matterSubscriptionId && set.matterCustomerId) {
          await Customer.updateOne({ _id: doc._id }, { $set: { matterCustomerId: set.matterCustomerId } }).catch(() => {});
        }
        console.error(`Could not relink customer ${doc._id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('persistMatterLink failed:', error.message);
  }
}

/**
 * The Matter subscription for an internal customer, found through whichever
 * link still works:
 *   1. Matter customer id — permanent; follows the customer across renewals.
 *   2. Matter subscription id — the older manual link; dies on renewal.
 *   3. Email — last resort, and only finds anything when the internal and
 *      Matter emails agree.
 * Whatever is found is written back onto the Customer (see persistMatterLink),
 * so the next lookup goes straight through the permanent id.
 */
export async function getNutritionForCustomerLink({ matterCustomerId, matterSubscriptionId, email } = {}) {
  let nutrition = null;

  if (matterCustomerId) {
    try {
      nutrition = await matterApiService.getSubscriptionNutritionByCustomerId(matterCustomerId);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  if (!nutrition && matterSubscriptionId) {
    try {
      nutrition = await matterApiService.getSubscriptionNutritionBySubscriptionId(matterSubscriptionId);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  if (!nutrition && email) {
    nutrition = await matterApiService.getSubscriptionNutritionByEmail(email);
  }

  if (nutrition) await persistMatterLink(nutrition, { matterCustomerId, matterSubscriptionId });
  return nutrition;
}

// Kept for callers that only know a subscription id and an email.
export async function getNutritionForLinkedSubscription(subscriptionId, email) {
  return getNutritionForCustomerLink({ matterSubscriptionId: subscriptionId, email });
}
