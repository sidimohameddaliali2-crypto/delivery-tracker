import Customer from '../models/Customer.js';
import matterApiService from './matterApiService.js';

/**
 * Nutrition for a customer linked to a Matter subscription id, with a
 * fallback for stale links. When a customer renews, Matter can issue a new
 * subscription id and the old one starts returning 404 — the linked id alone
 * then finds nothing (no plan, macros, snacks/day, and no snacks assigned).
 * On a 404 (or empty result) this retries by email, and if that finds a
 * different subscription, relinks every Customer still pointing at the dead
 * id so the next lookup goes straight to the right one.
 */
export async function getNutritionForLinkedSubscription(subscriptionId, email) {
  let nutrition = null;
  let notFound = false;
  try {
    nutrition = await matterApiService.getSubscriptionNutritionBySubscriptionId(subscriptionId);
    if (!nutrition) notFound = true;
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
    notFound = true;
  }
  if (!notFound || !email) return nutrition;

  const byEmail = await matterApiService.getSubscriptionNutritionByEmail(email);
  const newId = byEmail?.subscription_id != null ? String(byEmail.subscription_id) : null;
  if (newId && newId !== String(subscriptionId)) {
    try {
      const result = await Customer.updateMany(
        { matterSubscriptionId: { $in: [String(subscriptionId), Number(subscriptionId)] } },
        { $set: { matterSubscriptionId: newId } }
      );
      if (result.modifiedCount > 0) {
        console.log(`Relinked ${result.modifiedCount} customer(s) from dead Matter subscription ${subscriptionId} to ${newId} (${email})`);
      }
    } catch (relinkError) {
      // Most likely the unique index: newId is already linked to another
      // customer. Still return the nutrition — just don't relink.
      console.error(`Failed to relink Matter subscription ${subscriptionId} -> ${newId}:`, relinkError.message);
    }
  }
  return byEmail;
}
