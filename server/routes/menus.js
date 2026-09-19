import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import MenuItem from '../models/MenuItem.js';
import KitchenBreakfastPreset from '../models/KitchenBreakfastPreset.js';
import KitchenSnackPreset from '../models/KitchenSnackPreset.js';
import WeeklyMenu from '../models/WeeklyMenu.js';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';
import { protect } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheDelete, cacheDeletePattern } from '../config/cache.js';
import athleatService from '../services/athleatService.js';
import matterApiService, { describeMatterApiError } from '../services/matterApiService.js';
import {
  resolveCustomerMatch,
  resolveCustomerMatchBulk,
  resolveMatterSubscriptionId,
  createCustomerFromMatterSubscription
} from '../services/customerMatchService.js';

const router = express.Router();

const toDayKey = (value) => {
  if (!value) return '';
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

// Add `days` calendar days to a "YYYY-MM-DD" string, returning "YYYY-MM-DD".
const addDaysToDateKey = (dateKey, days) => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const isWeekendKey = (dateKey) => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
};

/**
 * Background (fire-and-forget) processing for days a customer skipped in the
 * menu-selection link. For each skipped day we find the customer's Matter
 * website subscription and create a pause: the skipped day is paused and a
 * resume day is placed right after the subscription's cycle_end_date
 * (skipping weekends unless the customer takes weekend deliveries).
 *
 * Nothing here is surfaced to the customer. Per-day outcome (success, or the
 * error detail) is written back onto the MenuSelectionRecord.skippedDays so it
 * shows next to that date in the admin selections view.
 *
 * `matterSubscriptionId` (from Customer.matterSubscriptionId, the manual
 * link) is used to fetch the subscription directly when set, since a
 * customer's internal email doesn't always match their Matter website email —
 * falling back to the by-email lookup only when there's no manual link.
 */
async function processSkippedDayPauses({ weeklyMenuId, email, weekendEnabled, matterSubscriptionId }) {
  const record = await MenuSelectionRecord.findOne({ weeklyMenuId, email }).select('skippedDays').lean();
  if (!record || !Array.isArray(record.skippedDays) || record.skippedDays.length === 0) return;

  const pending = record.skippedDays.filter((s) => s.pauseStatus === 'pending' || s.pauseStatus === 'failed');
  if (pending.length === 0) return;

  const results = new Map(); // dateKey -> { pauseStatus, resumeDate, subscriptionId, error }
  const fail = (dateKey, error) => results.set(toDayKey(dateKey), { pauseStatus: 'failed', error: String(error || 'Unknown error') });

  let subscription = null;
  let cycleEndKey = null;
  let existingPaused = new Set();
  let usedReturn = new Set();

  try {
    // Already-fetched full detail when resolved by id (it has cycle_end_date
    // on it directly); the by-email path only gets a summary row and needs a
    // second fetch below for the same detail.
    let detailData = null;
    if (matterSubscriptionId) {
      const detail = await matterApiService.getSubscription(matterSubscriptionId);
      subscription = detail?.data || null;
      detailData = subscription;
    } else {
      const list = await matterApiService.listSubscriptions({ email, pageSize: 1 });
      subscription = list?.data?.[0] || null;
    }
    if (!subscription) {
      pending.forEach((s) => fail(s.date, 'No Matter website subscription found for this customer'));
    } else {
      if (!detailData) {
        const detail = await matterApiService.getSubscription(subscription.subscription_id);
        detailData = detail?.data || null;
      }
      cycleEndKey = toDayKey(detailData?.cycle_end_date || subscription.cycle_end_date);
      if (!cycleEndKey) {
        pending.forEach((s) => fail(s.date, 'Subscription has no cycle_end_date to place the resume day after'));
      }
      try {
        const pauseState = await matterApiService.getSubscriptionPauses(subscription.subscription_id);
        existingPaused = new Set((pauseState?.paused_days || pauseState?.data?.paused_days || []).map(toDayKey));
        usedReturn = new Set((pauseState?.resumed_days || pauseState?.data?.resumed_days || []).map(toDayKey));
      } catch (err) {
        // Non-fatal — we can still create pauses, just can't dedupe/skip used return days.
        console.error('processSkippedDayPauses: failed to read existing pauses:', err.message);
      }
    }
  } catch (err) {
    const msg = describeMatterApiError(err) || err.message || 'Failed to reach the Matter API';
    pending.forEach((s) => fail(s.date, msg));
  }

  if (subscription && cycleEndKey) {
    let cursor = addDaysToDateKey(cycleEndKey, 1);
    const nextResumeDate = () => {
      while (
        usedReturn.has(cursor) ||
        existingPaused.has(cursor) ||
        (!weekendEnabled && isWeekendKey(cursor))
      ) {
        cursor = addDaysToDateKey(cursor, 1);
      }
      const chosen = cursor;
      usedReturn.add(chosen);
      cursor = addDaysToDateKey(cursor, 1);
      return chosen;
    };

    for (const skip of pending) {
      const dateKey = toDayKey(skip.date);
      if (!dateKey) { fail(skip.date, 'Invalid skipped date'); continue; }
      if (existingPaused.has(dateKey)) {
        results.set(dateKey, { pauseStatus: 'already_paused', subscriptionId: subscription.subscription_id });
        continue;
      }
      const resumeDate = nextResumeDate();
      try {
        await matterApiService.createSubscriptionPause(subscription.subscription_id, {
          pausedDays: [dateKey],
          chosenDays: [resumeDate],
          reason: 'Customer skipped this day in the menu selection link'
        });
        existingPaused.add(dateKey);
        results.set(dateKey, {
          pauseStatus: 'success',
          resumeDate,
          subscriptionId: subscription.subscription_id
        });
      } catch (err) {
        // Release the resume day we reserved so the next skipped day reuses it.
        usedReturn.delete(resumeDate);
        fail(dateKey, describeMatterApiError(err) || err.message || 'Matter rejected the pause');
      }
    }
  }

  // Write outcomes back onto the record (targeted $set — no full-doc revalidation).
  const fresh = await MenuSelectionRecord.findOne({ weeklyMenuId, email }).select('skippedDays').lean();
  if (!fresh) return;
  const merged = (fresh.skippedDays || []).map((s) => {
    const r = results.get(toDayKey(s.date));
    if (!r) return s;
    return {
      date: s.date,
      pauseStatus: r.pauseStatus,
      resumeDate: r.resumeDate || s.resumeDate,
      subscriptionId: r.subscriptionId || s.subscriptionId,
      error: r.pauseStatus === 'failed' ? r.error : undefined,
      processedAt: new Date()
    };
  });
  await MenuSelectionRecord.updateOne({ weeklyMenuId, email }, { $set: { skippedDays: merged } });
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const buildEmailRegex = (email) => {
  const cleaned = String(email || '').trim();
  return new RegExp(`^${escapeRegex(cleaned)}$`, 'i');
};

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

// menuItemId is an optional ObjectId ref — meals with no linked catalog item
// (e.g. auto-assigned snacks/main meals) legitimately have none. Mongoose
// accepts `undefined` for an optional field but throws a cast error on `''`,
// so this normalizes any falsy/empty value to undefined before it's ever
// assigned to a document.
const toMenuItemId = (value) => {
  const raw = (value && typeof value === 'object' && value._id) ? value._id : value;
  return raw === '' || raw === null || raw === undefined ? undefined : raw;
};

const buildMealName = (item = {}) => {
  const provided = String(item.mealName || '').trim();
  if (provided) return provided;

  const parts = [
    String(item.proteinSource || '').trim(),
    String(item.carbs || '').trim(),
    String(item.veg || '').trim(),
    String(item.sauce || '').trim()
  ].filter(Boolean);

  return parts.length ? parts.join(' | ') : '';
};

const normalizeBreakfastKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeBreakfastPresetEntry = (raw = {}) => {
  return {
    breakfastName: String(raw.breakfastName || '').trim(),
    C: Number(raw.C ?? raw.carbs ?? 0) || 0,
    P: Number(raw.P ?? raw.protein ?? 0) || 0,
    F: Number(raw.F ?? raw.fats ?? 0) || 0,
    V: Number(raw.V ?? raw.vegWeight ?? 80) || 80,
    isLargeBreakfast: !!raw.isLargeBreakfast
  };
};

const parseKitchenBreakfastPreset = (menuDoc) => {
  const breakfastPreset = normalizeBreakfastPresetEntry(menuDoc?.breakfastPreset || menuDoc?.breakfastMacros || {});
  return {
    breakfastName: breakfastPreset.breakfastName,
    C: breakfastPreset.C,
    P: breakfastPreset.P,
    F: breakfastPreset.F,
    V: breakfastPreset.V,
    isLargeBreakfast: breakfastPreset.isLargeBreakfast
  };
};

const parseKitchenBreakfastPresetsByName = (menuDoc) => {
  const source = menuDoc?.breakfastPresetsByName;
  if (!source) return {};

  const pairs = source instanceof Map
    ? Array.from(source.entries())
    : Object.entries(source || {});

  return pairs.reduce((acc, [rawKey, rawValue]) => {
    const key = normalizeBreakfastKey(rawKey);
    if (!key) return acc;
    acc[key] = normalizeBreakfastPresetEntry(rawValue || {});
    return acc;
  }, {});
};

// Global, name-keyed snack macro table (see KitchenSnackPreset). Each entry
// is that snack's own fixed C/P/F, used directly wherever the name matches —
// never divided by snacksPerDay, unlike the per-date Snack Rotation list.
const normalizeSnackKey = normalizeBreakfastKey;

const normalizeSnackPresetEntry = (raw = {}) => ({
  snackName: String(raw.snackName || raw.name || '').trim(),
  C: Number(raw.C ?? raw.carbs ?? 0) || 0,
  P: Number(raw.P ?? raw.protein ?? 0) || 0,
  F: Number(raw.F ?? raw.fats ?? 0) || 0
});

const parseKitchenSnackPresetsByName = (doc) => {
  const source = doc?.presetsByName;
  if (!source) return {};

  const pairs = source instanceof Map
    ? Array.from(source.entries())
    : Object.entries(source || {});

  return pairs.reduce((acc, [rawKey, rawValue]) => {
    const key = normalizeSnackKey(rawKey);
    if (!key) return acc;
    acc[key] = normalizeSnackPresetEntry(rawValue || {});
    return acc;
  }, {});
};

const normalizeKitchenMacros = (rawMacros) => {
  if (!rawMacros) return { C: 0, P: 0, F: 0, calories: 0 };

  if (rawMacros.total) {
    return {
      C: Number(rawMacros.total.C) || 0,
      P: Number(rawMacros.total.P) || 0,
      F: Number(rawMacros.total.F) || 0,
      calories: Number(rawMacros.total.calories) || 0
    };
  }

  return {
    C: Number(rawMacros.C) || 0,
    P: Number(rawMacros.P) || 0,
    F: Number(rawMacros.F) || 0,
    calories: Number(rawMacros.calories) || 0
  };
};

// ============================================
// CUSTOMER MEAL DATA ROUTES
// ============================================

/**
 * GET /api/customers/:customerId/meal-profile
 * Fetch customer meal preferences (DB only).
 * Optional query param: menuId — when provided, loads the customer's selections
 * for that specific menu from MenuSelectionRecord (historical). Falls back to
 * customer.selectedMeals when no MenuSelectionRecord exists yet (e.g. old data).
 */
router.get('/customers/:customerId/meal-profile', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { email, menuId } = req.query;

    // normalize incoming email values
    const resolvedEmail = String(email || (customerId.includes('@') ? customerId : '')).trim();

    console.log('=== GET meal-profile called ===');
    console.log('customerId:', customerId);
    console.log('email from query:', email);
    console.log('menuId from query:', menuId);

    // Try to get from cache first (30 minute TTL for profiles)
    // Include menuId in cache key so per-menu loads are cached separately
    const cacheKey = `customer:profile:${customerId}:${resolvedEmail}:${menuId || ''}`;
    // Only use cache when a specific menuId is requested (historical menu selections).
    // For plain profile views (no menuId), always read from DB so edits are reflected immediately.
    if (menuId) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: cached,
          cached: true
        });
      }
    }

    let customer = null;
    let matchedBy = resolvedEmail ? 'email' : null;
    if (resolvedEmail) {
      customer = await Customer.findOne({ email: buildEmailRegex(resolvedEmail) });
    }

    if (!customer) {
      customer = await Customer.findOne({ customerId });
      if (customer) matchedBy = 'customerId';
    }

    // Neither an exact internal email nor customerId lookup found anything.
    // The email the customer typed here might just not match how they're
    // stored internally (e.g. a personal address here, a work one on their
    // Matter account) — so look up their Matter website subscription by this
    // email instead, and use ITS phone/name/subscription id to find the
    // matching internal Customer record via the same cascade used for
    // subscription matching elsewhere. `matchedBy` is returned to the
    // frontend so it can eventually confirm "we matched you as X" rather
    // than silently substituting another person's data.
    if (!customer && resolvedEmail) {
      try {
        const nutrition = await matterApiService.getSubscriptionNutritionByEmail(resolvedEmail);
        if (nutrition?.subscription_id) {
          const fuzzy = await resolveCustomerMatch({
            subscriptionId: nutrition.subscription_id,
            phone: nutrition.phone,
            name: nutrition.customer_name
          });
          if (fuzzy.customer) {
            customer = await Customer.findById(fuzzy.customer._id);
            matchedBy = fuzzy.matchedBy;
            // Persist the link so this resolves instantly (and via the
            // exact-email path) next time, instead of re-hitting Matter.
            if (customer && !customer.matterSubscriptionId) {
              customer.matterSubscriptionId = String(nutrition.subscription_id);
              await customer.save();
            }
          }
        }
      } catch (lookupError) {
        console.error('meal-profile: Matter subscription lookup failed for', resolvedEmail, '-', lookupError.message);
      }
    }
    console.log('Customer found in DB:', customer ? 'YES' : 'NO');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found in database.'
      });
    }

    // External Athleat/FileMaker sync intentionally disabled.

    // Determine which selections to return.
    // If menuId is provided, prefer the MenuSelectionRecord for that specific menu
    // so customers loading an older link see their historical selections for that menu.
    let consolidatedMeals = [];
    // True only when we found a real MenuSelectionRecord for this specific menu.
    // The frontend uses this to decide whether to skip straight to the "All Set" page.
    let foundMenuSelectionRecord = false;

    if (menuId && resolvedEmail) {
      const record = await MenuSelectionRecord.findOne({
        weeklyMenuId: menuId,
        email: buildEmailRegex(resolvedEmail)
      });
      // Kitchen-side auto-assigned meals (isAutoAssigned) live in the same
      // array as customer-picked ones, but must never appear in the
      // customer-facing preview/confirmation — only the Kitchen List should
      // see them. So they're excluded here before anything is returned.
      const manuallySelectedMeals = (record?.selectedMeals || []).filter((m) => !m.isAutoAssigned);

      if (record && manuallySelectedMeals.length > 0) {
        foundMenuSelectionRecord = true;
        consolidatedMeals = manuallySelectedMeals.map(m => ({
          date: m.date,
          mealType: m.mealType,
          menuItemId: m.menuItemId,
          mealName: m.mealName,
          description: m.description,
          slotNumber: m.slotNumber,
          proteinChoice: m.proteinChoice,
          vegChoice: m.vegChoice,
          carbChoice: m.carbChoice,
          sauceChoice: m.sauceChoice,
          quantity: m.quantity || 1
        }));
        console.log('Loaded', consolidatedMeals.length, 'selections from MenuSelectionRecord for menu', menuId);
      }
    }

    // Fall back to customer.selectedMeals only when no MenuSelectionRecord was found.
    // These meals may belong to a DIFFERENT menu — the frontend will check currentWeekMenu
    // to decide whether they apply to the current link.
    if (consolidatedMeals.length === 0) {
      let rawMeals = customer.selectedMeals || [];
      if (rawMeals.length > 0) {
        const consolidatedMap = new Map();
        rawMeals.forEach(meal => {
          const dateKey = meal.date ? meal.date.toISOString().split('T')[0] : '';
          const itemId = String(meal.menuItemId || '');
          const slotKey = Number(meal.slotNumber || 0);
          const mealNameKey = String(meal.mealName || '');
          const key = `${dateKey}-${itemId}-${slotKey}-${mealNameKey}`;
          if (consolidatedMap.has(key)) {
            const existing = consolidatedMap.get(key);
            existing.quantity = (existing.quantity || 1) + (meal.quantity || 1);
          } else {
            consolidatedMap.set(key, {
              date: meal.date,
              mealType: meal.mealType,
              menuItemId: meal.menuItemId,
              mealName: meal.mealName,
              description: meal.description,
              slotNumber: meal.slotNumber,
              proteinChoice: meal.proteinChoice,
              vegChoice: meal.vegChoice,
              carbChoice: meal.carbChoice,
              sauceChoice: meal.sauceChoice,
              quantity: meal.quantity || 1
            });
          }
        });
        consolidatedMeals = Array.from(consolidatedMap.values());

        // Save consolidated meals back to database if they changed
        if (consolidatedMeals.length !== customer.selectedMeals.length) {
          customer.selectedMeals = consolidatedMeals;
          await customer.save();
        }
      }
    }

    const returnData = {
      customerId: customer.customerId,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      mealPerDay: customer.mealPerDay,
      breakfastInclude: customer.breakfastInclude,
      mealSnack: customer.mealSnack,
      snackCount: customer.snackCount || 0,
      mealPlan: customer.mealPlan,
      mealExclusion: customer.mealExclusion,
      allergies: customer.allergies || [],
      athleatId: customer.athleatId,
      athleatSyncedAt: customer.athleatSyncedAt,
      selectedMeals: consolidatedMeals,
      macros: customer.macros || { C: 0, P: 0, F: 0 },
      // currentWeekMenu reflects what the customer last submitted regardless of menu
      currentWeekMenu: customer.currentWeekMenu,
      // hasSubmittedForRequestedMenu = true ONLY when a real MenuSelectionRecord was found
      // for the requested menuId. Never true from the customer.selectedMeals fallback.
      hasSubmittedForRequestedMenu: foundMenuSelectionRecord,
      lastMenuSelectionDate: customer.lastMenuSelectionDate,
      weekend: customer.weekend || false,
      hasFileMakerPreferences: !!(customer.mealPerDay > 1 || customer.mealPlan),
      // How this Customer was resolved: 'email' (exact, typical case),
      // 'customerId', or a fuzzy Matter-subscription match ('manual',
      // 'phone', 'name') when the typed email didn't match anything
      // internally directly. Non-'email' values are a hint the frontend can
      // use to confirm identity before showing the customer their data.
      matchedBy,
      note: null
    };

    // Only cache when a specific menuId was requested (historical selections).
    // Plain profile views skip caching so edits are always reflected on refresh.
    if (menuId) {
      await cacheSet(cacheKey, returnData, 300); // 5 min TTL
    }

    return res.json({
      success: true,
      data: returnData
    });
  } catch (error) {
    console.error('Error in GET meal-profile:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/customers/:customerId/filemaker-layouts
 * Fetch raw FileMaker layout data for a customer (Customer, Leads, Orders)
 */
router.get('/customers/:customerId/filemaker-layouts', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { email } = req.query;

    const customer = await Customer.findOne({ customerId });
    const resolvedEmail = String(email || customer?.email || '').trim();

    if (!resolvedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to fetch FileMaker layouts.'
      });
    }

    const parseFilemakerDate = (value) => {
      if (!value) return null;

      const raw = String(value).trim();
      if (!raw) return null;

      const direct = new Date(raw);
      if (!Number.isNaN(direct.getTime())) return direct;

      const mdY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdY) {
        const month = Number(mdY[1]);
        const day = Number(mdY[2]);
        const year = Number(mdY[3]);
        const parsed = new Date(year, month - 1, day);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }

      return null;
    };

    const formatAsFilemakerDate = (date) => {
      const month = String(date.getMonth() + 1);
      const day = String(date.getDate());
      const year = String(date.getFullYear());
      return `${month}/${day}/${year}`;
    };

    const [customerLayout, leadLayout, orderLayout] = await Promise.all([
      athleatService.getCustomerRawByEmail(resolvedEmail),
      athleatService.getLeadRawByEmail(resolvedEmail),
      athleatService.getOrderRawByEmail(resolvedEmail)
    ]);

    const primaryCustomer = customerLayout[0] || null;
    const uuidCustomer = primaryCustomer?.fieldData?.uuid || '';

    const orderScheduleLayout = uuidCustomer
      ? await athleatService.getOrderScheduleRawByUUID(uuidCustomer)
      : [];

    const candidateDates = [];
    orderLayout.forEach((record) => {
      const fieldData = record?.fieldData || {};
      candidateDates.push(parseFilemakerDate(fieldData.dateStart));
      candidateDates.push(parseFilemakerDate(fieldData.dateEnd));
    });
    orderScheduleLayout.forEach((record) => {
      const fieldData = record?.fieldData || {};
      candidateDates.push(parseFilemakerDate(fieldData.date));
    });

    const validDates = candidateDates.filter(Boolean);
    let menuItemLayout = [];
    if (validDates.length > 0) {
      validDates.sort((a, b) => a.getTime() - b.getTime());
      const minDate = formatAsFilemakerDate(validDates[0]);
      const maxDate = formatAsFilemakerDate(validDates[validDates.length - 1]);
      menuItemLayout = await athleatService.getMenuItemsRaw(minDate, maxDate);
    }

    return res.json({
      success: true,
      data: {
        readOnly: true,
        note: 'Preview only. No customer/profile/FileMaker records are updated by this endpoint.',
        email: resolvedEmail,
        customerLayout,
        leadLayout,
        orderLayout,
        orderScheduleLayout,
        menuItemLayout,
        summary: {
          customerCount: customerLayout.length,
          leadCount: leadLayout.length,
          orderCount: orderLayout.length,
          orderScheduleCount: orderScheduleLayout.length,
          menuItemCount: menuItemLayout.length,
          uuidCustomer: uuidCustomer || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching FileMaker layouts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch FileMaker layouts',
      error: error.message
    });
  }
});

/**
 * POST /api/customers/:customerId/meal-profile
 * Update customer meal preferences
 */
router.post('/customers/:customerId/meal-profile', async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      email,
      mealPerDay,
      breakfastInclude,
      mealSnack,
      snackCount,
      mealPlan,
      mealExclusion,
      allergies,
      dietaryRestrictions,
      preferences
    } = req.body;

    const updateFields = {};
    if (email !== undefined && email) updateFields.email = email;
    if (mealPerDay !== undefined) updateFields.mealPerDay = Number(mealPerDay);
    if (breakfastInclude !== undefined) updateFields.breakfastInclude = breakfastInclude;
    if (mealSnack !== undefined) updateFields.mealSnack = mealSnack;
    if (snackCount !== undefined) updateFields.snackCount = Number(snackCount) || 0;
    if (req.body.weekend !== undefined) updateFields.weekend = !!req.body.weekend;
    if (mealPlan !== undefined) updateFields.mealPlan = mealPlan;
    if (mealExclusion !== undefined) updateFields.mealExclusion = mealExclusion;
    if (allergies !== undefined) updateFields.allergies = allergies;
    if (dietaryRestrictions !== undefined) updateFields.dietaryRestrictions = dietaryRestrictions;
    if (preferences !== undefined) updateFields.preferences = preferences;

    // findOneAndUpdate is atomic and avoids stale-read race conditions
    const customer = await Customer.findOneAndUpdate(
      { customerId },
      { $set: updateFields },
      { new: true, upsert: true, runValidators: true }
    );

    // Invalidate ALL possible cache key variants for this customer
    const emailVal = customer.email || '';
    const keysToDelete = [
      `customer:profile:${customerId}::`,
      `customer:profile:${customerId}:${emailVal}:`,
      `customer:profile:${emailVal}:${emailVal}:`,
    ];
    await Promise.all([
      cacheDeletePattern(`customer:profile:${customerId}:*`),
      // Also clear email-keyed entries (used when customer accesses via share link with email)
      cacheDeletePattern(`customer:profile:${emailVal}:*`),
      ...keysToDelete.map(k => cacheDelete(k).catch(() => {}))
    ]);

    res.json({
      success: true,
      message: 'Meal profile updated successfully',
      data: customer
    });
  } catch (error) {
    console.error('Error updating meal profile:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/customers/:customerId/complete-profile
 * Fetch COMPLETE customer profile (DB only)
 */
router.get('/customers/:customerId/complete-profile', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { email } = req.query;

    console.log('\n=== GET complete-profile called ===');
    console.log('customerId:', customerId);
    console.log('email:', email);

    let customer = await Customer.findOne({ customerId });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const emailToUse = email || customer.email;
    if (!emailToUse) {
      return res.json({
        customer: {
          customerId: customer.customerId,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone
        },
        filemaked: null,
        note: 'No email found for this customer. Cannot fetch FileMaker profile.'
      });
    }

    return res.json({
      customer: {
        customerId: customer.customerId,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        athleatId: customer.athleatId,
        athleatSyncedAt: customer.athleatSyncedAt,
        uuid: customer.uuid
      },
      filemakeData: null,
      note: 'External FileMaker/Athleat API is disabled. Returning database profile only.'
    });
  } catch (error) {
    console.error('Error fetching complete profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customers/:customerId/filemaker-raw
 * Fetch raw data placeholder (external API disabled)
 */
router.get('/customers/:customerId/filemaker-raw', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { email, startDate, endDate } = req.query;

    console.log('\n=== GET filemaker-raw called ===');
    console.log('customerId:', customerId);
    console.log('email:', email);

    const customer = await Customer.findOne({ customerId });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    console.log('Customer found. email in DB:', customer.email);
    const emailToUse = email || customer.email;
    console.log('emailToUse:', emailToUse);
    
    if (!emailToUse) {
      return res.json({
        customer: {
          customerId: customer.customerId,
          email: customer.email
        },
        raw: null,
        note: 'No email found for this customer. Cannot fetch FileMaker data.'
      });
    }

    const uuidCustomer = customer.uuid || '';

    let startDateStr = startDate;
    let endDateStr = endDate;
    if (!startDateStr || !endDateStr) {
      const today = new Date();
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      startDateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
      endDateStr = `${end.getMonth() + 1}/${end.getDate()}/${end.getFullYear()}`;
    }

    return res.json({
      customer: {
        customerId: customer.customerId,
        email: customer.email,
        uuid: uuidCustomer
      },
      dateRange: {
        startDate: startDateStr,
        endDate: endDateStr
      },
      raw: {
        customer: [],
        lead: [],
        order: [],
        schedule: []
      },
      note: 'External FileMaker/Athleat API is disabled.'
    });
  } catch (error) {
    console.error('Error fetching raw FileMaker data:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEEKLY MENU ROUTES
// ============================================

/**
 * GET /api/menus
 * Get all weekly menus (admin only)
 */
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, isActive = 'true' } = req.query;

    const query = {};
    if (isActive !== 'all') {
      query.isActive = isActive === 'true' || isActive === true;
    }

    const menus = await WeeklyMenu.find(query)
      .populate('createdBy', 'profile.firstName profile.lastName')
      .sort({ startDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await WeeklyMenu.countDocuments(query);

    // Real per-day customer selection counts (quantity-aware), for the list
    // card's day strip. Client does the local-date bucketing (same pattern
    // as the existing per-day meal-item counts) to avoid server/browser
    // timezone mismatches, so we just hand over raw {date, count} pairs.
    const menuIds = menus.map((m) => m._id);
    const selectionAgg = menuIds.length > 0
      ? await MenuSelectionRecord.aggregate([
          { $match: { weeklyMenuId: { $in: menuIds } } },
          { $unwind: '$selectedMeals' },
          { $match: { 'selectedMeals.date': { $ne: null } } },
          {
            $group: {
              _id: { menuId: '$weeklyMenuId', date: '$selectedMeals.date' },
              count: { $sum: { $ifNull: ['$selectedMeals.quantity', 1] } }
            }
          }
        ])
      : [];
    const selectionsByMenuId = new Map();
    selectionAgg.forEach((row) => {
      const key = String(row._id.menuId);
      const list = selectionsByMenuId.get(key) || [];
      list.push({ date: row._id.date, count: row.count });
      selectionsByMenuId.set(key, list);
    });

    const menusWithSelections = menus.map((m) => ({
      ...m.toObject(),
      selectionsByDate: selectionsByMenuId.get(String(m._id)) || []
    }));

    res.json({
      success: true,
      data: menusWithSelections,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching menus:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/kitchen-list
 * Returns the active menu list for the kitchen list page.
 */
router.get('/kitchen-list', protect, async (req, res) => {
  try {
    const menus = await WeeklyMenu.find({ isActive: true })
      .select('title name startDate endDate selectionCount breakfastPreset breakfastMacros breakfastPresetsByName')
      .sort({ startDate: -1 })
      .lean();

    return res.json({
      success: true,
      data: menus.map((menu) => ({
        ...menu,
        breakfastPreset: parseKitchenBreakfastPreset(menu),
        breakfastPresetsByName: parseKitchenBreakfastPresetsByName(menu)
      }))
    });
  } catch (error) {
    console.error('Error fetching kitchen list menus:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/kitchen-breakfast-presets
 * Returns the global kitchen breakfast presets shared across all menus.
 */
router.get('/kitchen-breakfast-presets', protect, async (req, res) => {
  try {
    const doc = await KitchenBreakfastPreset.findOne({ key: 'global' }).lean();

    return res.json({
      success: true,
      data: {
        breakfastPreset: parseKitchenBreakfastPreset(doc || {}),
        presetsByName: parseKitchenBreakfastPresetsByName({ breakfastPresetsByName: doc?.presetsByName })
      }
    });
  } catch (error) {
    console.error('Error fetching global breakfast presets:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/menus/kitchen-breakfast-presets
 * Saves the global kitchen breakfast presets shared across all menus.
 */
router.put('/kitchen-breakfast-presets', protect, async (req, res) => {
  try {
    const { presets = [], defaultPreset = null } = req.body || {};

    if (!Array.isArray(presets)) {
      return res.status(400).json({
        success: false,
        message: 'presets must be an array'
      });
    }

    const normalizedMap = presets.reduce((acc, row) => {
      const normalized = normalizeBreakfastPresetEntry(row || {});
      const key = normalizeBreakfastKey(normalized.breakfastName || row?.name || '');
      if (!key) return acc;
      acc[key] = normalized;
      return acc;
    }, {});

    const mapEntries = Object.values(normalizedMap);
    const resolvedDefault = normalizeBreakfastPresetEntry(defaultPreset || mapEntries[0] || {});

    const doc = await KitchenBreakfastPreset.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          breakfastPreset: resolvedDefault,
          presetsByName: normalizedMap
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        breakfastPreset: parseKitchenBreakfastPreset(doc || {}),
        presetsByName: parseKitchenBreakfastPresetsByName({ breakfastPresetsByName: doc?.presetsByName })
      }
    });
  } catch (error) {
    console.error('Error saving global breakfast presets:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/kitchen-snack-presets
 * Returns the global, name-keyed snack macro table shared across all menus
 * and dates (see KitchenSnackPreset). Used as a fallback at calc time when a
 * snack's name matches an entry here — see calculateKitchenListEntry.
 */
router.get('/kitchen-snack-presets', protect, async (req, res) => {
  try {
    const doc = await KitchenSnackPreset.findOne({ key: 'global' }).lean();
    return res.json({
      success: true,
      data: { presetsByName: parseKitchenSnackPresetsByName(doc || {}) }
    });
  } catch (error) {
    console.error('Error fetching global snack presets:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/menus/kitchen-snack-presets
 * Saves the global snack macro table.
 * Body: { presets: [{ snackName, C, P, F }, ...] }
 */
router.put('/kitchen-snack-presets', protect, async (req, res) => {
  try {
    const { presets = [] } = req.body || {};
    if (!Array.isArray(presets)) {
      return res.status(400).json({ success: false, message: 'presets must be an array' });
    }

    const normalizedMap = presets.reduce((acc, row) => {
      const normalized = normalizeSnackPresetEntry(row || {});
      const key = normalizeSnackKey(normalized.snackName);
      if (!key) return acc;
      acc[key] = normalized;
      return acc;
    }, {});

    const doc = await KitchenSnackPreset.findOneAndUpdate(
      { key: 'global' },
      { $set: { presetsByName: normalizedMap } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: { presetsByName: parseKitchenSnackPresetsByName(doc || {}) }
    });
  } catch (error) {
    console.error('Error saving global snack presets:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/:id/breakfast-presets
 * Returns imported breakfast presets for a menu.
 */
router.get('/:id/breakfast-presets', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const menu = await WeeklyMenu.findById(id)
      .select('breakfastPreset breakfastMacros breakfastPresetsByName')
      .lean();

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    return res.json({
      success: true,
      data: {
        breakfastPreset: parseKitchenBreakfastPreset(menu),
        presetsByName: parseKitchenBreakfastPresetsByName(menu)
      }
    });
  } catch (error) {
    console.error('Error fetching breakfast presets:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/menus/:id/breakfast-presets
 * Saves imported breakfast presets for a menu.
 */
router.put('/:id/breakfast-presets', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { presets = [], defaultPreset = null } = req.body || {};

    if (!Array.isArray(presets)) {
      return res.status(400).json({
        success: false,
        message: 'presets must be an array'
      });
    }

    const normalizedMap = presets.reduce((acc, row) => {
      const normalized = normalizeBreakfastPresetEntry(row || {});
      const key = normalizeBreakfastKey(normalized.breakfastName || row?.name || '');
      if (!key) return acc;
      acc[key] = normalized;
      return acc;
    }, {});

    const mapEntries = Object.values(normalizedMap);
    const resolvedDefault = normalizeBreakfastPresetEntry(
      defaultPreset || mapEntries[0] || {}
    );

    const menu = await WeeklyMenu.findByIdAndUpdate(
      id,
      {
        $set: {
          breakfastPreset: resolvedDefault,
          breakfastPresetsByName: normalizedMap
        }
      },
      { new: true }
    )
      .select('breakfastPreset breakfastPresetsByName')
      .lean();

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    return res.json({
      success: true,
      data: {
        breakfastPreset: parseKitchenBreakfastPreset(menu),
        presetsByName: parseKitchenBreakfastPresetsByName(menu)
      }
    });
  } catch (error) {
    console.error('Error saving breakfast presets:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

const toDateKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

// A legacy record's value may still be a plain array (before the first/second
// split) — treat it as the "first" pool so old data keeps working.
const normalizeSnackPools = (value) => {
  if (Array.isArray(value)) return { first: value, second: [] };
  return { first: value?.first || [], second: value?.second || [] };
};

/**
 * GET /api/menus/:id/snack-options
 * Returns the kitchen-defined snack ingredient options, keyed by date, each
 * split into a "first" and "second" pool.
 */
router.get('/:id/snack-options', protect, async (req, res) => {
  try {
    const menu = await WeeklyMenu.findById(req.params.id).select('snackOptionsByDate').lean();
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    const optionsByDate = {};
    for (const [date, value] of Object.entries(menu.snackOptionsByDate || {})) {
      optionsByDate[date] = normalizeSnackPools(value);
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error fetching snack options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/menus/:id/snack-options
 * Replaces the "first" and "second" snack pools for one date, OR — when
 * `entries` is given — for many dates at once in a single save (see
 * main-meal-options above for why: the weekly upload used to PUT once per date).
 * Body: { date: 'YYYY-MM-DD', first: [{ name, exclusions, C, P, F }], second: [...] }
 *   or: { entries: [{ date, first, second }, ...] }
 */
router.put('/:id/snack-options', protect, async (req, res) => {
  try {
    const { date, first, second, entries } = req.body || {};

    const normalizePool = (list) => (Array.isArray(list) ? list : [])
      .map((opt) => ({
        name: String(opt?.name || '').trim(),
        exclusions: Array.isArray(opt?.exclusions)
          ? opt.exclusions.map((e) => String(e).trim()).filter(Boolean)
          : String(opt?.exclusions || '').split(',').map((e) => e.trim()).filter(Boolean),
        C: Number(opt?.C) || 0,
        P: Number(opt?.P) || 0,
        F: Number(opt?.F) || 0
      }))
      .filter((opt) => opt.name);

    const menu = await WeeklyMenu.findById(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    if (Array.isArray(entries) && entries.length > 0) {
      let appliedAny = false;
      for (const entry of entries) {
        const dateKey = toDateKey(entry?.date);
        if (!dateKey) continue;
        menu.snackOptionsByDate.set(dateKey, {
          first: normalizePool(entry?.first),
          second: normalizePool(entry?.second)
        });
        appliedAny = true;
      }
      if (!appliedAny) {
        return res.status(400).json({ success: false, message: 'No entry had a valid date' });
      }
    } else {
      const dateKey = toDateKey(date);
      if (!dateKey) {
        return res.status(400).json({ success: false, message: 'A valid date is required' });
      }
      menu.snackOptionsByDate.set(dateKey, {
        first: normalizePool(first),
        second: normalizePool(second)
      });
    }

    await menu.save();

    const optionsByDate = {};
    for (const [key, value] of menu.snackOptionsByDate.entries()) {
      optionsByDate[key] = normalizeSnackPools(value);
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error saving snack options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/menus/:id/breakfast-options
 * Returns the kitchen-defined per-date breakfast rotation (name + exclusions).
 * Macros are resolved separately by name against breakfastPresetsByName.
 */
router.get('/:id/breakfast-options', protect, async (req, res) => {
  try {
    const menu = await WeeklyMenu.findById(req.params.id).select('breakfastOptionsByDate').lean();
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    const optionsByDate = {};
    for (const [date, options] of Object.entries(menu.breakfastOptionsByDate || {})) {
      optionsByDate[date] = options || [];
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error fetching breakfast options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/menus/:id/breakfast-options
 * Replaces the breakfast rotation for one date, OR — when `entries` is
 * given — for many dates at once in a single save (see main-meal-options
 * above for why).
 * Body: { date: 'YYYY-MM-DD', options: [{ name, exclusions }] }
 *   or: { entries: [{ date, options }, ...] }
 */
router.put('/:id/breakfast-options', protect, async (req, res) => {
  try {
    const { date, options, entries } = req.body || {};

    const normalize = (list) => (Array.isArray(list) ? list : [])
      .map((opt) => ({
        name: String(opt?.name || '').trim(),
        exclusions: Array.isArray(opt?.exclusions)
          ? opt.exclusions.map((e) => String(e).trim()).filter(Boolean)
          : String(opt?.exclusions || '').split(',').map((e) => e.trim()).filter(Boolean)
      }))
      .filter((opt) => opt.name);

    const menu = await WeeklyMenu.findById(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    if (Array.isArray(entries) && entries.length > 0) {
      let appliedAny = false;
      for (const entry of entries) {
        const dateKey = toDateKey(entry?.date);
        if (!dateKey) continue;
        menu.breakfastOptionsByDate.set(dateKey, normalize(entry?.options));
        appliedAny = true;
      }
      if (!appliedAny) {
        return res.status(400).json({ success: false, message: 'No entry had a valid date' });
      }
    } else {
      const dateKey = toDateKey(date);
      if (!dateKey) {
        return res.status(400).json({ success: false, message: 'A valid date is required' });
      }
      menu.breakfastOptionsByDate.set(dateKey, normalize(options));
    }

    await menu.save();

    const optionsByDate = {};
    for (const [key, opts] of menu.breakfastOptionsByDate.entries()) {
      optionsByDate[key] = opts || [];
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error saving breakfast options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const optionExcludedByCustomer = (option, customerExclusions) => {
  const optExclusions = (option.exclusions || []).map((e) => String(e).toLowerCase().trim());
  return customerExclusions.some((ex) => optExclusions.some((tag) => tag.includes(ex) || ex.includes(tag)));
};

/**
 * POST /api/menus/:id/assign-snacks
 * Ensures each customer's snack slots are filled for that day (from their
 * website subscription's snacks_per_day). Each date has a "first" and
 * "second" snack pool; slot 1 (and every odd slot) draws from "first", slot 2
 * (and every even slot) from "second" — so a 2-snack/day customer gets
 * exactly one from each, a 50/50 split — falling back to the other pool if
 * one has no eligible option. Each pick is random within its pool, skipping
 * any option whose exclusion tags match the customer's exclusion list.
 * Idempotent: only fills in missing slots, never duplicates existing
 * assignments. Macros for each slot are the ingredient's macros divided by
 * the day's snack count.
 *
 * Body: { date, customers: [{ email }] } — scopes to just these customers'
 * snacks for just this date (used by the unified Auto-Assign action for
 * customers missing a selection on a specific date). Omit both to fall back
 * to the old menu-wide behavior (every customer's selection record, every
 * date they have non-snack meals for).
 */
async function runAssignSnacks(menuId, { date, customers } = {}) {
    const scopedDateKey = date ? toDateKey(date) : null;
    const scopedEmails = Array.isArray(customers)
      ? new Set(customers.map((c) => String(c.email || '').trim().toLowerCase()).filter(Boolean))
      : null;

    const menu = await WeeklyMenu.findById(menuId).select('snackOptionsByDate').lean();
    if (!menu) {
      return { error: 'Menu not found', status: 404 };
    }
    const snackOptionsByDate = menu.snackOptionsByDate || {};

    const allRecords = await MenuSelectionRecord.find({ weeklyMenuId: menuId });
    const records = scopedEmails
      ? allRecords.filter((r) => scopedEmails.has(String(r.email || '').trim().toLowerCase()))
      : allRecords;

    // Batch-resolve each record's matterSubscriptionId up front (via its
    // Customer ref, or by email for older records that predate the ref) so
    // the nutrition lookup below can use the id-based path — the by-email
    // Matter lookup silently finds nothing for customers whose internal
    // email differs from their Matter website email.
    const customerIds = records.map((r) => r.customer).filter(Boolean);
    const emailsNeedingLookup = records.filter((r) => !r.customer).map((r) => r.email);
    const [byId, byEmail] = await Promise.all([
      customerIds.length
        ? Customer.find({ _id: { $in: customerIds } }).select('matterSubscriptionId').lean()
        : [],
      emailsNeedingLookup.length
        ? Customer.find({ email: { $in: emailsNeedingLookup.map((e) => buildEmailRegex(e)) } }).select('email matterSubscriptionId').lean()
        : []
    ]);
    const subscriptionIdByCustomerId = new Map(byId.map((c) => [String(c._id), c.matterSubscriptionId]));
    const subscriptionIdByEmail = new Map(byEmail.map((c) => [String(c.email).toLowerCase(), c.matterSubscriptionId]));

    // Nutrition lookups (2 Matter API calls each) dominate runtime — run every
    // customer concurrently instead of one at a time.
    const results = await Promise.all(records.map(async (record) => {
      const stats = { assigned: 0, skippedNoSnacksNeeded: 0, skippedNoOptions: 0, datesWithNoOptions: [] };

      const matterSubscriptionId = record.customer
        ? subscriptionIdByCustomerId.get(String(record.customer))
        : subscriptionIdByEmail.get(String(record.email).toLowerCase());

      let nutrition = null;
      try {
        nutrition = matterSubscriptionId
          ? await matterApiService.getSubscriptionNutritionBySubscriptionId(matterSubscriptionId)
          : await matterApiService.getSubscriptionNutritionByEmail(record.email);
      } catch (lookupError) {
        console.error(`Snack assignment: failed to look up ${record.email}:`, lookupError.message);
      }

      const snacksPerDay = Number(nutrition?.snacks_per_day) || 0;
      if (snacksPerDay <= 0) {
        stats.skippedNoSnacksNeeded = 1;
        return stats;
      }

      const exclusions = String(record.mealExclusion || '')
        .split(/[,;|]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      // Scoped runs only ever touch the one requested date — even if the
      // customer has meals on other dates already, this call has no business
      // touching those.
      const dateKeys = scopedDateKey
        ? [scopedDateKey]
        : Array.from(new Set(
            (record.selectedMeals || [])
              .filter((m) => m.mealType !== 'snack')
              .map((m) => toDateKey(m.date))
              .filter(Boolean)
          ));

      let changed = false;

      for (const dateKey of dateKeys) {
        const existingSnackCount = (record.selectedMeals || []).filter(
          (m) => m.mealType === 'snack' && toDateKey(m.date) === dateKey
        ).length;
        const slotsNeeded = snacksPerDay - existingSnackCount;
        if (slotsNeeded <= 0) continue;

        const rawPools = snackOptionsByDate[dateKey];
        const dayPools = Array.isArray(rawPools)
          ? { first: rawPools, second: [] }
          : { first: rawPools?.first || [], second: rawPools?.second || [] };
        const eligibleFirst = dayPools.first.filter((opt) => !optionExcludedByCustomer(opt, exclusions));
        const eligibleSecond = dayPools.second.filter((opt) => !optionExcludedByCustomer(opt, exclusions));

        if (eligibleFirst.length === 0 && eligibleSecond.length === 0) {
          stats.skippedNoOptions += 1;
          stats.datesWithNoOptions.push(dateKey);
          continue;
        }

        for (let i = 0; i < slotsNeeded; i += 1) {
          const overallSlotIndex = existingSnackCount + i;
          const preferFirst = overallSlotIndex % 2 === 0;
          let pool = preferFirst ? eligibleFirst : eligibleSecond;
          if (pool.length === 0) pool = preferFirst ? eligibleSecond : eligibleFirst;
          if (pool.length === 0) {
            stats.skippedNoOptions += 1;
            continue;
          }

          const choice = pool[Math.floor(Math.random() * pool.length)];
          record.selectedMeals.push({
            date: new Date(dateKey),
            mealType: 'snack',
            mealName: choice.name,
            quantity: 1,
            snackMacros: {
              C: (Number(choice.C) || 0) / snacksPerDay,
              P: (Number(choice.P) || 0) / snacksPerDay,
              F: (Number(choice.F) || 0) / snacksPerDay
            },
            isAutoAssigned: true
          });
          stats.assigned += 1;
          changed = true;
        }
      }

      if (changed) {
        await record.save();
      }

      return stats;
    }));

    const assigned = results.reduce((sum, r) => sum + r.assigned, 0);
    const skippedNoSnacksNeeded = results.reduce((sum, r) => sum + r.skippedNoSnacksNeeded, 0);
    const skippedNoOptions = results.reduce((sum, r) => sum + r.skippedNoOptions, 0);
    const datesWithNoOptions = Array.from(new Set(results.flatMap((r) => r.datesWithNoOptions))).sort();

    return {
      data: { assigned, skippedNoSnacksNeeded, skippedNoOptions, datesWithNoOptions, customersProcessed: records.length }
    };
}

router.post('/:id/assign-snacks', protect, async (req, res) => {
  try {
    const { date, customers } = req.body || {};
    const result = await runAssignSnacks(req.params.id, { date, customers });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error assigning snacks:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Runs `mapper` over `items` with at most `limit` in flight at once — server-
// side equivalent of the client's kitchenData.js helper, used here so a
// Matter Core batch's per-customer nutrition lookups (for snacks_per_day)
// don't fire all at once.
const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/**
 * Matter Core plan customers skip the chicken/beef/fish type rotation and
 * exclusion filtering entirely: a customer needing N main meals just gets
 * matterCoreMealOptionsByDate[dateKey][0..N-1] in order (offset by however
 * many they already have that day), one breakfast is always the date's FIRST
 * breakfast option (never random), and snacks are always each pool's FIRST
 * item (never random) — "first meal available, second meal available."
 * Idempotent per customer, same as runAssignMainMeals/runAssignSnacks: only
 * fills the gap between what they already have and what they need.
 *
 * Breakfast does NOT reduce the main meal count here (unlike
 * runAssignMainMeals, where breakfastInclude counts as one of
 * meal_frequency's slots) — a Matter Core customer with meal_frequency 2 and
 * breakfastInclude on gets 2 main meals AND a breakfast, not 1 main meal.
 *
 * `customers` here additionally carries `subscriptionId` (the Matter
 * subscription id) so snacks_per_day can be looked up directly, and
 * `mealFrequency` from that same subscription (see runAutoPopulateMissing).
 */
async function runAssignMatterCoreMeals(menuId, dateKey, customers) {
  const menu = await WeeklyMenu.findById(menuId)
    .select('matterCoreMealOptionsByDate breakfastOptionsByDate snackOptionsByDate')
    .lean();
  if (!menu) {
    return { error: 'Menu not found', status: 404 };
  }

  const mealList = (menu.matterCoreMealOptionsByDate || {})[dateKey] || [];
  const breakfastOptions = (menu.breakfastOptionsByDate || {})[dateKey] || [];
  const rawSnackPools = (menu.snackOptionsByDate || {})[dateKey];
  const snackPools = Array.isArray(rawSnackPools)
    ? { first: rawSnackPools, second: [] }
    : { first: rawSnackPools?.first || [], second: rawSnackPools?.second || [] };

  const emails = customers.map((c) => String(c.email || '').trim()).filter(Boolean);
  const customerDocs = await Customer.find({ email: { $in: emails.map((e) => buildEmailRegex(e)) } })
    .select('email breakfastInclude')
    .lean();
  const breakfastIncludeByEmail = new Map(
    customerDocs.map((c) => [String(c.email || '').trim().toLowerCase(), !!c.breakfastInclude])
  );

  const sortedCustomers = [...customers].sort(
    (a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
  );

  // snacks_per_day lives on the Matter website subscription, not on the
  // caller-supplied customer shape — fetched here (bounded concurrency)
  // directly by subscription id, since these customers were already resolved
  // from a specific Matter subscription by the caller.
  const snacksPerDayBySubscriptionId = new Map();
  await mapWithConcurrency(
    sortedCustomers.filter((c) => c.subscriptionId),
    8,
    async (c) => {
      try {
        const nutrition = await matterApiService.getSubscriptionNutritionBySubscriptionId(c.subscriptionId);
        snacksPerDayBySubscriptionId.set(c.subscriptionId, Number(nutrition?.snacks_per_day) || 0);
      } catch (err) {
        console.error(`Matter Core assignment: nutrition lookup failed for subscription ${c.subscriptionId}:`, err.message);
        snacksPerDayBySubscriptionId.set(c.subscriptionId, 0);
      }
    }
  );

  let assignedMainMeals = 0;
  let skippedNoOption = 0;
  let assignedBreakfast = 0;
  let skippedBreakfastNoOption = 0;
  let assignedSnacks = 0;
  let skippedSnackNoOption = 0;

  for (const customer of sortedCustomers) {
    const email = String(customer.email || '').trim();
    if (!email) continue;

    const existingRecord = await MenuSelectionRecord.findOne({ weeklyMenuId: menuId, email }).lean();
    const existingMainMealsCount = (existingRecord?.selectedMeals || []).filter(
      (m) => toDateKey(m.date) === dateKey && ['lunch', 'dinner'].includes(m.mealType)
    ).length;
    const hasBreakfastAlready = (existingRecord?.selectedMeals || []).some(
      (m) => toDateKey(m.date) === dateKey && m.mealType === 'breakfast'
    );
    const existingSnackCount = (existingRecord?.selectedMeals || []).filter(
      (m) => m.mealType === 'snack' && toDateKey(m.date) === dateKey
    ).length;

    const breakfastInclude = breakfastIncludeByEmail.get(email.toLowerCase()) || false;
    // Unlike the standard-plan assignment (runAssignMainMeals), breakfast is
    // never subtracted from the main meal count for Matter Core — it's
    // always an extra on top of the full meal_frequency, per the plan's
    // own rules.
    const totalNeeded = Math.max(1, Number(customer.mealFrequency) || 1);
    const slotsNeeded = totalNeeded - existingMainMealsCount;

    const newMeals = [];
    const mealTypeForSlot = (index) => (index === 1 ? 'dinner' : 'lunch');

    if (slotsNeeded > 0) {
      for (let i = 0; i < slotsNeeded; i += 1) {
        const position = existingMainMealsCount + i;
        const chosen = mealList[position];
        if (!chosen) {
          skippedNoOption += 1;
          continue;
        }
        newMeals.push({
          date: new Date(dateKey),
          mealType: mealTypeForSlot(position),
          mealName: chosen.name,
          quantity: 1,
          slotNumber: position,
          isAutoAssigned: true
        });
        assignedMainMeals += 1;
      }
    }

    if (breakfastInclude && !hasBreakfastAlready) {
      const choice = breakfastOptions[0];
      if (choice) {
        newMeals.push({
          date: new Date(dateKey),
          mealType: 'breakfast',
          mealName: choice.name,
          quantity: 1,
          isAutoAssigned: true
        });
        assignedBreakfast += 1;
      } else {
        skippedBreakfastNoOption += 1;
      }
    }

    const snacksPerDay = customer.subscriptionId
      ? (snacksPerDayBySubscriptionId.get(customer.subscriptionId) || 0)
      : 0;
    const snackSlotsNeeded = snacksPerDay - existingSnackCount;
    if (snackSlotsNeeded > 0) {
      for (let i = 0; i < snackSlotsNeeded; i += 1) {
        const overallSlotIndex = existingSnackCount + i;
        const pool = overallSlotIndex % 2 === 0 ? snackPools.first : snackPools.second;
        const choice = pool[0];
        if (!choice) {
          skippedSnackNoOption += 1;
          continue;
        }
        newMeals.push({
          date: new Date(dateKey),
          mealType: 'snack',
          mealName: choice.name,
          quantity: 1,
          snackMacros: {
            C: (Number(choice.C) || 0) / snacksPerDay,
            P: (Number(choice.P) || 0) / snacksPerDay,
            F: (Number(choice.F) || 0) / snacksPerDay
          },
          isAutoAssigned: true
        });
        assignedSnacks += 1;
      }
    }

    if (newMeals.length === 0) continue;

    await MenuSelectionRecord.findOneAndUpdate(
      { weeklyMenuId: menuId, email },
      {
        $setOnInsert: {
          weeklyMenuId: menuId,
          email,
          customer: customer.customerRef || undefined,
          customerId: customer.customerId ? String(customer.customerId) : undefined,
          firstName: customer.name || email
        },
        $push: { selectedMeals: { $each: newMeals } }
      },
      { upsert: true }
    );
  }

  return {
    data: {
      assignedMainMeals,
      skippedNoOption,
      assignedBreakfast,
      skippedBreakfastNoOption,
      assignedSnacks,
      skippedSnackNoOption,
      customersProcessed: sortedCustomers.length
    }
  };
}

router.post('/:id/assign-matter-core-meals', protect, async (req, res) => {
  try {
    const { date, customers } = req.body || {};
    const dateKey = toDateKey(date);
    if (!dateKey) {
      return res.status(400).json({ success: false, message: 'A valid date is required' });
    }
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({ success: false, message: 'customers must be a non-empty array' });
    }

    const result = await runAssignMatterCoreMeals(req.params.id, dateKey, customers);
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error assigning Matter Core meals:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/menus/:id/auto-populate-missing
 * Body: { date }
 *
 * Kitchen counting should never silently miss a Matter subscriber who has a
 * delivery that day but never submitted a menu selection themselves. This
 * finds every Matter website subscription with an active delivery on `date`,
 * resolves each to an internal Customer via the same match cascade used
 * elsewhere (manual link -> email -> phone -> name — see
 * customerMatchService), and for any that still have no selection for that
 * date, runs the same main-meal/breakfast/snack assignment kitchen staff
 * already trigger manually (runAssignMainMeals/runAssignSnacks), so the
 * gap-filling logic only exists once. A customer already matched internally
 * (even under a different email) is reused, never duplicated — a new
 * Customer is only created when the full cascade finds nothing at all.
 *
 * findSubscriptionsWithDeliveryOnDate does a full-detail Matter API fetch per
 * active subscription, so the result is cached briefly per (menu, date) —
 * this is meant to run once per kitchen page load for a date, not on every
 * request.
 */
async function runAutoPopulateMissing(menuId, dateKey) {
  const cacheKey = `menu:${menuId}:autoPopulated:${dateKey}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { data: cached, cached: true };

  const subscriptions = await matterApiService.findSubscriptionsWithDeliveryOnDate(dateKey);
  if (subscriptions.length === 0) {
    const empty = {
      matterSubscriptionsChecked: 0,
      alreadyCovered: 0,
      newlyCreatedCustomers: 0,
      customersAssigned: 0,
      matterCoreCustomersAssigned: 0,
      assignedMainMeals: null,
      assignedSnacks: null,
      assignedMatterCore: null
    };
    await cacheSet(cacheKey, empty, 900);
    return { data: empty };
  }

  const existingRecords = await MenuSelectionRecord.find({ weeklyMenuId: menuId })
    .select('email customer selectedMeals')
    .lean();
  const recordsByEmail = new Map(existingRecords.map((r) => [String(r.email || '').toLowerCase(), r]));
  const recordsByCustomerId = new Map(
    existingRecords.filter((r) => r.customer).map((r) => [String(r.customer), r])
  );

  const allCustomers = await Customer.find({}).select('email firstName lastName phone matterSubscriptionId').lean();
  const matches = resolveCustomerMatchBulk(allCustomers, subscriptions);

  let alreadyCovered = 0;
  let newlyCreatedCustomers = 0;
  const needsAssignment = [];
  // Matter Core customers skip the type/exclusion-based rotation entirely —
  // see runAssignMatterCoreMeals — so they're routed separately, identified
  // by the Matter subscription's own plan.name, same source KitchenList
  // already shows as "planName".
  const needsMatterCoreAssignment = [];

  for (const sub of subscriptions) {
    const subId = String(sub.subscription_id);
    let customer = matches.get(subId)?.customer || null;

    let existingRecord = customer ? recordsByCustomerId.get(String(customer._id)) : null;
    if (!existingRecord && sub.email) {
      existingRecord = recordsByEmail.get(String(sub.email).toLowerCase());
    }
    if (!existingRecord && customer?.email) {
      existingRecord = recordsByEmail.get(String(customer.email).toLowerCase());
    }

    const hasSelectionThatDay = (existingRecord?.selectedMeals || []).some((m) => toDateKey(m.date) === dateKey);
    if (hasSelectionThatDay) {
      alreadyCovered += 1;
      continue;
    }

    if (!customer) {
      customer = await createCustomerFromMatterSubscription(sub);
      newlyCreatedCustomers += 1;
    }

    const item = {
      email: customer.email || sub.email,
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || sub.name,
      customerId: customer.customerId,
      customerRef: customer._id,
      subscriptionId: sub.subscription_id,
      mealFrequency: sub.meal_frequency,
      exclusions: sub.exclusions || []
    };

    if (String(sub.plan_name || '').trim().toLowerCase() === 'matter core') {
      needsMatterCoreAssignment.push(item);
    } else {
      needsAssignment.push(item);
    }
  }

  let assignedMainMeals = null;
  let assignedSnacks = null;
  if (needsAssignment.length > 0) {
    const mainResult = await runAssignMainMeals(menuId, dateKey, needsAssignment);
    assignedMainMeals = mainResult.error ? { error: mainResult.error } : mainResult.data;

    const snackResult = await runAssignSnacks(menuId, {
      date: dateKey,
      customers: needsAssignment.map((c) => ({ email: c.email }))
    });
    assignedSnacks = snackResult.error ? { error: snackResult.error } : snackResult.data;
  }

  let assignedMatterCore = null;
  if (needsMatterCoreAssignment.length > 0) {
    const matterCoreResult = await runAssignMatterCoreMeals(menuId, dateKey, needsMatterCoreAssignment);
    assignedMatterCore = matterCoreResult.error ? { error: matterCoreResult.error } : matterCoreResult.data;
  }

  const summary = {
    matterSubscriptionsChecked: subscriptions.length,
    alreadyCovered,
    newlyCreatedCustomers,
    customersAssigned: needsAssignment.length,
    matterCoreCustomersAssigned: needsMatterCoreAssignment.length,
    assignedMainMeals,
    assignedSnacks,
    assignedMatterCore
  };

  // 15 min TTL — long enough to cover a kitchen shift's repeat page loads
  // for the same date without re-running the expensive Matter sweep, short
  // enough that a delivery-schedule change or new submission is picked up
  // again soon.
  await cacheSet(cacheKey, summary, 900);
  return { data: summary };
}

router.post('/:id/auto-populate-missing', protect, async (req, res) => {
  try {
    const { date } = req.body || {};
    const dateKey = toDateKey(date);
    if (!dateKey) {
      return res.status(400).json({ success: false, message: 'A valid date is required' });
    }

    const result = await runAutoPopulateMissing(req.params.id, dateKey);
    return res.json({ success: true, data: result.data, cached: !!result.cached });
  } catch (error) {
    console.error('Error auto-populating missing selections:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/menus/:id/main-meal-options
 * Returns the kitchen-defined main meal rotation + fallback sub meals, keyed by date.
 */
router.get('/:id/main-meal-options', protect, async (req, res) => {
  try {
    const menu = await WeeklyMenu.findById(req.params.id).select('mainMealOptionsByDate').lean();
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    const optionsByDate = {};
    for (const [date, value] of Object.entries(menu.mainMealOptionsByDate || {})) {
      optionsByDate[date] = { mainMeals: value?.mainMeals || [], subMeals: value?.subMeals || [] };
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error fetching main meal options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/menus/:id/main-meal-options
 * Replaces the main meal rotation + fallback sub meals for one date, OR —
 * when `entries` is given — for many dates at once in a single save (used by
 * the weekly menu upload, which used to PUT once per date sequentially;
 * uploading a full week could mean 7+ round trips just for this one type).
 * Body: { date, mainMeals: [{name, type, exclusions}], subMeals: [...] }
 *   or: { entries: [{ date, mainMeals, subMeals }, ...] }
 */
router.put('/:id/main-meal-options', protect, async (req, res) => {
  try {
    const { date, mainMeals, subMeals, entries } = req.body || {};

    const normalize = (list) => (Array.isArray(list) ? list : [])
      .map((opt) => ({
        name: String(opt?.name || '').trim(),
        type: ['chicken', 'beef', 'fish'].includes(opt?.type) ? opt.type : null,
        exclusions: Array.isArray(opt?.exclusions)
          ? opt.exclusions.map((e) => String(e).trim()).filter(Boolean)
          : String(opt?.exclusions || '').split(',').map((e) => e.trim()).filter(Boolean)
      }))
      .filter((opt) => opt.name && opt.type);

    const menu = await WeeklyMenu.findById(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    if (Array.isArray(entries) && entries.length > 0) {
      let appliedAny = false;
      for (const entry of entries) {
        const dateKey = toDateKey(entry?.date);
        if (!dateKey) continue;
        menu.mainMealOptionsByDate.set(dateKey, {
          mainMeals: normalize(entry?.mainMeals).slice(0, 3),
          subMeals: normalize(entry?.subMeals)
        });
        appliedAny = true;
      }
      if (!appliedAny) {
        return res.status(400).json({ success: false, message: 'No entry had a valid date' });
      }
    } else {
      const dateKey = toDateKey(date);
      if (!dateKey) {
        return res.status(400).json({ success: false, message: 'A valid date is required' });
      }
      menu.mainMealOptionsByDate.set(dateKey, {
        mainMeals: normalize(mainMeals).slice(0, 3),
        subMeals: normalize(subMeals)
      });
    }

    await menu.save();

    const optionsByDate = {};
    for (const [key, value] of menu.mainMealOptionsByDate.entries()) {
      optionsByDate[key] = { mainMeals: value?.mainMeals || [], subMeals: value?.subMeals || [] };
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error saving main meal options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/menus/:id/matter-core-meal-options
 * Returns the kitchen-defined Matter Core meal rotation, keyed by date — a
 * plain ordered list, no type/exclusion fields (see matterCoreMealOptionSchema).
 */
router.get('/:id/matter-core-meal-options', protect, async (req, res) => {
  try {
    const menu = await WeeklyMenu.findById(req.params.id).select('matterCoreMealOptionsByDate').lean();
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    const optionsByDate = {};
    for (const [date, value] of Object.entries(menu.matterCoreMealOptionsByDate || {})) {
      optionsByDate[date] = Array.isArray(value) ? value : [];
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error fetching Matter Core meal options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/menus/:id/matter-core-meal-options
 * Replaces the Matter Core meal list for one date, OR — when `entries` is
 * given — for many dates at once (same batch pattern as main-meal-options).
 * Body: { date, meals: [{name}] } or: { entries: [{ date, meals }, ...] }
 */
router.put('/:id/matter-core-meal-options', protect, async (req, res) => {
  try {
    const { date, meals, entries } = req.body || {};

    const normalize = (list) => (Array.isArray(list) ? list : [])
      .map((opt) => ({ name: String(opt?.name || '').trim() }))
      .filter((opt) => opt.name);

    const menu = await WeeklyMenu.findById(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    if (Array.isArray(entries) && entries.length > 0) {
      let appliedAny = false;
      for (const entry of entries) {
        const dateKey = toDateKey(entry?.date);
        if (!dateKey) continue;
        menu.matterCoreMealOptionsByDate.set(dateKey, normalize(entry?.meals));
        appliedAny = true;
      }
      if (!appliedAny) {
        return res.status(400).json({ success: false, message: 'No entry had a valid date' });
      }
    } else {
      const dateKey = toDateKey(date);
      if (!dateKey) {
        return res.status(400).json({ success: false, message: 'A valid date is required' });
      }
      menu.matterCoreMealOptionsByDate.set(dateKey, normalize(meals));
    }

    await menu.save();

    const optionsByDate = {};
    for (const [key, value] of menu.matterCoreMealOptionsByDate.entries()) {
      optionsByDate[key] = value || [];
    }

    res.json({ success: true, data: optionsByDate });
  } catch (error) {
    console.error('Error saving Matter Core meal options:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/menus/:id/assign-main-meals
 * Fills in a main meal (and, when the customer's profile has
 * breakfastInclude set, a breakfast) for each given customer on a date.
 * Main meals are assigned in a fixed type order — chicken, then beef, then
 * fish — one per slot, up to how many meals the customer needs. If a type's
 * main option is on the customer's exclusion list (or was already used
 * today), that slot falls back to the SUB meal of the SAME type, never a
 * different type's sub or the main/sub pool at large. A customer can never
 * receive the same dish twice in one day — every choice (main or sub) is
 * checked against what's already been assigned to them today first.
 *
 * When breakfastInclude is set, breakfast counts as one of the customer's
 * meal_frequency slots (e.g. meal_frequency 3 + breakfastInclude = 2 main
 * meals + 1 breakfast, not 3 main meals), and one breakfast is picked at
 * random from that date's breakfastOptionsByDate — filtered by the
 * customer's exclusions the same way main/sub meals and snacks are.
 *
 * Idempotent per customer: only fills the gap between their existing main
 * meals that day and their (breakfast-adjusted) meal_frequency, and never
 * adds a second breakfast if one already exists that day.
 * Body: { date, customers: [{ email, name, customerId, mealFrequency, exclusions }] }
 */
/**
 * Core "fill in main meals + breakfast" logic shared by the manual
 * POST /:id/assign-main-meals route (kitchen-staff-triggered, explicit
 * customer list from the UI) and the automatic auto-populate-missing route
 * (Stage 3 — runs the same assignment for Matter customers who never
 * submitted a selection at all). `customers` here is the same shape both
 * callers already use: [{ email, name, customerId, mealFrequency, exclusions }].
 */
async function runAssignMainMeals(menuId, dateKey, customers) {
    const menu = await WeeklyMenu.findById(menuId)
      .select('mainMealOptionsByDate breakfastOptionsByDate')
      .lean();
    if (!menu) {
      return { error: 'Menu not found', status: 404 };
    }

    const dayOptions = (menu.mainMealOptionsByDate || {})[dateKey] || { mainMeals: [], subMeals: [] };
    const mainMeals = dayOptions.mainMeals || [];
    const subMeals = dayOptions.subMeals || [];
    const breakfastOptions = (menu.breakfastOptionsByDate || {})[dateKey] || [];

    if (mainMeals.length === 0) {
      return { error: 'No main meals configured for this date', status: 400 };
    }

    // breakfastInclude lives on the Customer profile, not the Matter subscription
    // payload — batch-fetch it once for every customer being assigned.
    const emails = customers.map((c) => String(c.email || '').trim()).filter(Boolean);
    const customerDocs = await Customer.find({ email: { $in: emails.map((e) => buildEmailRegex(e)) } })
      .select('email breakfastInclude')
      .lean();
    const breakfastIncludeByEmail = new Map(
      customerDocs.map((c) => [String(c.email || '').trim().toLowerCase(), !!c.breakfastInclude])
    );

    // Stable order so re-running is deterministic and repeatable.
    const sortedCustomers = [...customers].sort(
      (a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
    );

    const MAIN_MEAL_TYPE_ORDER = ['chicken', 'beef', 'fish'];
    const nameKeyOf = (opt) => String(opt?.name || '').trim().toLowerCase();

    let assigned = 0;
    let skippedNoOption = 0;
    let skippedAlreadyAssigned = 0;
    let assignedBreakfast = 0;
    let skippedBreakfastNoOption = 0;

    for (const customer of sortedCustomers) {
      const email = String(customer.email || '').trim();
      if (!email) continue;

      const existingRecord = await MenuSelectionRecord.findOne({ weeklyMenuId: menuId, email }).lean();
      const existingMainMealsCount = (existingRecord?.selectedMeals || []).filter(
        (m) => toDateKey(m.date) === dateKey && ['lunch', 'dinner'].includes(m.mealType)
      ).length;
      const hasBreakfastAlready = (existingRecord?.selectedMeals || []).some(
        (m) => toDateKey(m.date) === dateKey && m.mealType === 'breakfast'
      );

      const breakfastInclude = breakfastIncludeByEmail.get(email.toLowerCase()) || false;
      const baseMealFrequency = Math.max(1, Number(customer.mealFrequency) || 1);
      const totalNeeded = Math.max(0, baseMealFrequency - (breakfastInclude ? 1 : 0));
      const slotsNeeded = totalNeeded - existingMainMealsCount;

      const customerExclusions = (customer.exclusions || []).map((e) => String(e).toLowerCase().trim());
      const assignedMeals = [];

      // Seed with what the customer already has today, so a re-run (or a
      // customer who already self-selected some meals) never duplicates a
      // dish they already have, on top of never duplicating within this run.
      const assignedNamesToday = new Set(
        (existingRecord?.selectedMeals || [])
          .filter((m) => toDateKey(m.date) === dateKey && ['lunch', 'dinner'].includes(m.mealType))
          .map((m) => String(m.mealName || '').trim().toLowerCase())
      );

      if (slotsNeeded > 0) {
        // One type per slot, in order — chicken, beef, fish. Slots beyond 3
        // (an unusually high meal count) cycle back through the type order;
        // the no-duplicate-dish check below still applies, so a repeated
        // type only succeeds if that type's pool has more than one option.
        const typesForSlots = [];
        for (let slot = 0; slot < slotsNeeded; slot += 1) {
          typesForSlots.push(MAIN_MEAL_TYPE_ORDER[slot % MAIN_MEAL_TYPE_ORDER.length]);
        }

        typesForSlots.forEach((type) => {
          const mainCandidate = mainMeals.find((m) => m.type === type);
          let chosen = null;

          if (
            mainCandidate
            && !optionExcludedByCustomer(mainCandidate, customerExclusions)
            && !assignedNamesToday.has(nameKeyOf(mainCandidate))
          ) {
            chosen = mainCandidate;
          } else {
            chosen = subMeals.find((sub) =>
              sub.type === type
              && !optionExcludedByCustomer(sub, customerExclusions)
              && !assignedNamesToday.has(nameKeyOf(sub))
            ) || null;
          }

          if (chosen) {
            assignedNamesToday.add(nameKeyOf(chosen));
            assignedMeals.push(chosen);
            assigned += 1;
          } else {
            skippedNoOption += 1;
          }
        });
      } else {
        skippedAlreadyAssigned += 1;
      }

      const mealTypeForSlot = (index) => (index === 1 ? 'dinner' : 'lunch');
      const newMeals = assignedMeals.map((meal, index) => ({
        date: new Date(dateKey),
        mealType: mealTypeForSlot(existingMainMealsCount + index),
        mealName: meal.name,
        manualProteinType: meal.type,
        quantity: 1,
        // Disambiguates same-mealType slots (e.g. a 3rd meal, also labeled
        // "lunch") so they're never mistaken for duplicates of each other
        // when read back — see the mealType/slotNumber consolidation key in
        // GET /:id/selections.
        slotNumber: existingMainMealsCount + index,
        isAutoAssigned: true
      }));

      if (breakfastInclude && !hasBreakfastAlready) {
        const eligibleBreakfasts = breakfastOptions.filter((opt) => !optionExcludedByCustomer(opt, customerExclusions));
        if (eligibleBreakfasts.length > 0) {
          const choice = eligibleBreakfasts[Math.floor(Math.random() * eligibleBreakfasts.length)];
          newMeals.push({
            date: new Date(dateKey),
            mealType: 'breakfast',
            mealName: choice.name,
            quantity: 1,
            isAutoAssigned: true
          });
          assignedBreakfast += 1;
        } else {
          skippedBreakfastNoOption += 1;
        }
      }

      if (newMeals.length === 0) continue;

      await MenuSelectionRecord.findOneAndUpdate(
        { weeklyMenuId: menuId, email },
        {
          $setOnInsert: {
            weeklyMenuId: menuId,
            email,
            // customerRef is only supplied by the auto-populate job (Stage 3),
            // which already resolved the internal Customer — the manual UI
            // path doesn't have it and falls back to the email-based index.
            customer: customer.customerRef || undefined,
            customerId: customer.customerId ? String(customer.customerId) : undefined,
            firstName: customer.name || email
          },
          $push: { selectedMeals: { $each: newMeals } }
        },
        { upsert: true }
      );
    }

    return {
      data: {
        assigned,
        skippedNoOption,
        skippedAlreadyAssigned,
        assignedBreakfast,
        skippedBreakfastNoOption,
        customersProcessed: sortedCustomers.length
      }
    };
}

router.post('/:id/assign-main-meals', protect, async (req, res) => {
  try {
    const { date, customers } = req.body || {};
    const dateKey = toDateKey(date);
    if (!dateKey) {
      return res.status(400).json({ success: false, message: 'A valid date is required' });
    }
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({ success: false, message: 'customers must be a non-empty array' });
    }

    const result = await runAssignMainMeals(req.params.id, dateKey, customers);
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error assigning main meals:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/menus/share/:token
 * Access menu via share link (public)
 */
router.get('/share/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const cacheKey = `menu:share:${token}`;

    // Try to get from cache first (5 minute TTL for share links)
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const menu = await WeeklyMenu.findOne({
      'shareLink.token': token
    })
      .populate({
        path: 'meals.items',
        model: 'MenuItem'
      });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found or link expired'
      });
    }

    if (menu.shareLink?.isActive === false) {
      return res.status(410).json({
        success: false,
        message: 'This link is expired'
      });
    }

    // Check if link has expired
    if (menu.shareLink.expiresAt && new Date() > menu.shareLink.expiresAt) {
      // Auto-extend expired links by 30 days
      menu.shareLink.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await menu.save();
    }

    // Increment view count
    menu.viewCount += 1;
    await menu.save();

    // Cache the response for 5 minutes
    await cacheSet(cacheKey, menu.toObject(), 300);

    console.log('=== Returning menu from /share/:token ===');
    console.log('Menu ID:', menu._id);
    console.log('enableCompletionMessage:', menu.enableCompletionMessage);
    console.log('completionMessage:', menu.completionMessage);

    res.json({
      success: true,
      data: menu
    });
  } catch (error) {
    console.error('Error fetching shared menu:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/:id
 * Get a weekly menu with populated items (admin only)
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    const menu = await WeeklyMenu.findById(id)
      .populate({ path: 'meals.items', model: 'MenuItem' });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    return res.json({
      success: true,
      data: menu
    });
  } catch (error) {
    console.error('Error fetching menu:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/menus
 * Create a new weekly menu (admin only)
 */
router.post('/', protect, async (req, res) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      mealPlans,
      meals,
      days,
      enableCompletionMessage,
      completionMessage,
      bodybuilderMode,
      selectionDeadlines
    } = req.body;

    console.log('=== POST /menus - Creating new menu ===');
    console.log('enableCompletionMessage:', enableCompletionMessage);
    console.log('completionMessage:', completionMessage);

    const menu = new WeeklyMenu({
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      mealPlans: mealPlans || ['Standard'],
      meals: meals || [],
      enableCompletionMessage: enableCompletionMessage || false,
      completionMessage: completionMessage || 'Your meal selections have been saved successfully.',
      selectionDeadlines: Array.isArray(selectionDeadlines) ? selectionDeadlines : [],
      createdBy: req.user._id,
      shareLink: {
        token: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    await menu.save();

    console.log('Menu saved successfully:');
    console.log('enableCompletionMessage:', menu.enableCompletionMessage);
    console.log('completionMessage:', menu.completionMessage);

    if (Array.isArray(days) && days.length > 0) {
      const mealMap = new Map();

      for (const day of days) {
        if (!day?.date || !Array.isArray(day.items)) {
          continue;
        }

        const dayDate = new Date(day.date);

        for (const item of day.items) {
          if (!item?.mealName) {
            const generatedMealName = buildMealName(item);
            if (!generatedMealName) {
              continue;
            }
          }

          const mealType = item.mealType || 'lunch';
          const mealName = buildMealName(item);
          const isBodybuilderItem = bodybuilderMode === true || (Array.isArray(mealPlans) && mealPlans.includes('Bodybuilder'));

          const combinedIngredients = isBodybuilderItem
            ? [
                `Protein: ${String(item.proteinSource || '').trim()}`,
                `Vegetables: ${String(item.veg || '').trim()}`,
                `Carbs: ${String(item.carbs || '').trim()}`,
                `Sauces: ${String(item.sauce || '').trim()}`
              ].filter((value) => value.split(': ')[1]).join('; ')
            : (item.ingredients || '');

          const menuItem = new MenuItem({
            itemDate: dayDate,
            mealType,
            mealName,
            mealPlan: isBodybuilderItem ? 'Bodybuilder' : 'Standard',
            ingredients: combinedIngredients,
            proteinSource: item.proteinSource || '',
            category: item.category || '',
            intolerances: item.intolerances || '',
            allergens: String(item.allergens || '').split(',').map(s => s.trim()).filter(Boolean),
            garnish: item.garnish || '',
            carbs: item.carbs || '',
            veg: item.veg || '',
            sauce: item.sauce || ''
          });

          await menuItem.save();

          const key = `${dayDate.toISOString().split('T')[0]}|${mealType}`;
          if (!mealMap.has(key)) {
            mealMap.set(key, {
              date: dayDate,
              mealType,
              items: []
            });
          }
          mealMap.get(key).items.push(menuItem._id);
        }
      }

      menu.meals = Array.from(mealMap.values());
      await menu.save();
    }

    res.status(201).json({
      success: true,
      message: 'Menu created successfully',
      data: menu
    });
  } catch (error) {
    console.error('Error creating menu:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/menus/:id
 * Update weekly menu (admin only)
 */
router.put('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    const {
      title,
      description,
      meals,
      isPublished,
      days,
      startDate,
      endDate,
      mealPlans,
      enableCompletionMessage,
      completionMessage,
      shareLinkActive,
      bodybuilderMode,
      selectionDeadlines,
      breakfastPreset,
      breakfastPresetsByName
    } = req.body;

    console.log('=== PUT /menus/:id - Updating menu ===');
    console.log('Menu ID:', id);
    console.log('enableCompletionMessage:', enableCompletionMessage);
    console.log('completionMessage:', completionMessage);

    const menu = await WeeklyMenu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    if (title) menu.title = title;
    if (description) menu.description = description;
    if (startDate) menu.startDate = new Date(startDate);
    if (endDate) menu.endDate = new Date(endDate);
    if (Array.isArray(mealPlans) && mealPlans.length > 0) menu.mealPlans = mealPlans;
    if (meals) menu.meals = meals;
    if (isPublished !== undefined) menu.isPublished = isPublished;
    if (enableCompletionMessage !== undefined) menu.enableCompletionMessage = enableCompletionMessage;
    if (completionMessage !== undefined) menu.completionMessage = completionMessage;
    if (Array.isArray(selectionDeadlines)) menu.selectionDeadlines = selectionDeadlines;
    if (breakfastPreset !== undefined) menu.breakfastPreset = breakfastPreset;
    if (breakfastPresetsByName !== undefined) menu.breakfastPresetsByName = breakfastPresetsByName;
    if (typeof shareLinkActive === 'boolean') {
      if (!menu.shareLink) {
        menu.shareLink = {
          token: crypto.randomBytes(32).toString('hex'),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isActive: shareLinkActive
        };
      } else {
        menu.shareLink.isActive = shareLinkActive;
      }
    }

    console.log('Before save - menu.enableCompletionMessage:', menu.enableCompletionMessage);
    console.log('Before save - menu.completionMessage:', menu.completionMessage);

    if (Array.isArray(days) && days.length > 0) {
      const existingItemIds = (menu.meals || [])
        .flatMap((meal) => meal.items || [])
        .map((id) => String(id))
        .filter(Boolean);

      // Build a lookup of existing MenuItems so we can REUSE their _id when the
      // same (date + mealType + mealName) is re-submitted.  Reusing _id keeps
      // customer selectedMeals.menuItemId references valid after an edit.
      const existingItems = existingItemIds.length > 0
        ? await MenuItem.find({ _id: { $in: existingItemIds } }).lean()
        : [];

      const existingItemMap = new Map(); // key: "YYYY-MM-DD|mealType|mealName" → MenuItem doc
      for (const item of existingItems) {
        const dateKey = item.itemDate
          ? new Date(item.itemDate).toISOString().split('T')[0]
          : '';
        const key = `${dateKey}|${item.mealType || ''}|${(item.mealName || '').trim().toLowerCase()}`;
        if (!existingItemMap.has(key)) existingItemMap.set(key, item);
      }

      const mealMap = new Map();
      const usedExistingIds = new Set(); // track which old _ids we reused

      for (const day of days) {
        if (!day?.date || !Array.isArray(day.items)) {
          continue;
        }

        const dayDate = new Date(day.date);

        for (const item of day.items) {
          if (!item?.mealName) {
            const generatedMealName = buildMealName(item);
            if (!generatedMealName) {
              continue;
            }
          }

          const mealType = item.mealType || 'lunch';
          const mealName = buildMealName(item);
          const isBodybuilderItem = bodybuilderMode === true || (Array.isArray(menu.mealPlans) && menu.mealPlans.includes('Bodybuilder'));

          const combinedIngredients = isBodybuilderItem
            ? [
                `Protein: ${String(item.proteinSource || '').trim()}`,
                `Vegetables: ${String(item.veg || '').trim()}`,
                `Carbs: ${String(item.carbs || '').trim()}`,
                `Sauces: ${String(item.sauce || '').trim()}`
              ].filter((value) => value.split(': ')[1]).join('; ')
            : (item.ingredients || '');

          const updatedFields = {
            itemDate: dayDate,
            mealType,
            mealName,
            mealPlan: isBodybuilderItem ? 'Bodybuilder' : 'Standard',
            ingredients: combinedIngredients,
            proteinSource: item.proteinSource || '',
            category: item.category || '',
            intolerances: item.intolerances || '',
            allergens: String(item.allergens || '').split(',').map(s => s.trim()).filter(Boolean),
            garnish: item.garnish || '',
            carbs: item.carbs || '',
            veg: item.veg || '',
            sauce: item.sauce || ''
          };

          // Try to match an existing MenuItem by date + mealType + mealName
          // so we can UPDATE it in-place rather than delete+recreate.
          // This preserves customer selectedMeals.menuItemId references.
          const matchKey = `${dayDate.toISOString().split('T')[0]}|${mealType}|${(mealName || '').trim().toLowerCase()}`;
          const existingMatch = existingItemMap.get(matchKey);

          let menuItemId;
          if (existingMatch && !usedExistingIds.has(String(existingMatch._id))) {
            // Reuse existing MenuItem — update its fields in-place
            await MenuItem.findByIdAndUpdate(existingMatch._id, { $set: updatedFields });
            menuItemId = existingMatch._id;
            usedExistingIds.add(String(existingMatch._id));
          } else {
            // No match — create a new MenuItem
            const menuItem = new MenuItem(updatedFields);
            await menuItem.save();
            menuItemId = menuItem._id;
          }

          const key = `${dayDate.toISOString().split('T')[0]}|${mealType}`;
          if (!mealMap.has(key)) {
            mealMap.set(key, {
              date: dayDate,
              mealType,
              items: []
            });
          }
          mealMap.get(key).items.push(menuItemId);
        }
      }

      // Delete only old MenuItems that were NOT reused in the new menu
      const unusedIds = existingItemIds.filter((id) => !usedExistingIds.has(id));
      if (unusedIds.length > 0) {
        await MenuItem.deleteMany({ _id: { $in: unusedIds } });
      }

      menu.meals = Array.from(mealMap.values());
    }

    await menu.save();

    console.log('After save - menu.enableCompletionMessage:', menu.enableCompletionMessage);
    console.log('After save - menu.completionMessage:', menu.completionMessage);

    // Clear the cache for this menu's share link
    if (menu.shareLink?.token) {
      const cacheKey = `menu:share:${menu.shareLink.token}`;
      await cacheDelete(cacheKey);
      console.log(`Cleared cache for menu share link: ${cacheKey}`);
    }

    res.json({
      success: true,
      message: 'Menu updated successfully',
      data: menu
    });
  } catch (error) {
    console.error('Error updating menu:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/:id/share-link
 * Get shareable link for menu
 */
router.get('/:id/share-link', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await WeeklyMenu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    const fallbackOrigin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${process.env.FRONTEND_URL || fallbackOrigin}/menu-select/${menu.shareLink.token}`;

    res.json({
      success: true,
      data: {
        shareLink: menu.shareLink.token,
        shareUrl,
        expiresAt: menu.shareLink.expiresAt
      }
    });
  } catch (error) {
    console.error('Error getting share link:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/menus/:id
 * Delete weekly menu (admin only)
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const menu = await WeeklyMenu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found'
      });
    }

    const itemIds = (menu.meals || [])
      .flatMap((meal) => meal.items || [])
      .filter(Boolean);

    await WeeklyMenu.findByIdAndDelete(id);

    if (itemIds.length > 0) {
      await MenuItem.deleteMany({ _id: { $in: itemIds } });
    }

    return res.json({
      success: true,
      message: 'Menu deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting menu:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/menus/:id/selections
 * Get customers who selected this menu (admin only).
 * Merges MenuSelectionRecord (new, historical) with Customer.selectedMeals (legacy).
 * Backfill filters meals to only those belonging to this menu's items,
 * preventing meals from other menus leaking into this record.
 */
router.get('/:id/selections', protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Opt-in gap-fill: when the kitchen pages load selections for a specific
    // date, silently create/fill in placeholder selections for any Matter
    // subscriber with a delivery that day who never submitted one
    // themselves (Stage 3 — see runAutoPopulateMissing), before the rest of
    // this handler reads MenuSelectionRecord below. Errors here must never
    // break the actual selections read — the page still needs to load.
    const autoPopulateDateKey = req.query.autoPopulateDate ? toDateKey(req.query.autoPopulateDate) : null;
    if (autoPopulateDateKey) {
      try {
        await runAutoPopulateMissing(id, autoPopulateDateKey);
      } catch (autoPopulateError) {
        console.error('Auto-populate-missing failed for menu', id, 'date', autoPopulateDateKey, '-', autoPopulateError.message);
      }
    }

    // Fetch the menu so we can build a whitelist of valid item IDs for backfill filtering
    const menuDoc = await WeeklyMenu.findById(id).lean();
    const menuItemIdSet = new Set(
      (menuDoc?.meals || []).flatMap(m => (m.items || []).map(i => String(i)))
    );
    // Fallback date range from the menu for meals that have no menuItemId
    const menuStart = menuDoc?.startDate ? new Date(menuDoc.startDate) : null;
    const menuEnd = menuDoc?.endDate ? new Date(menuDoc.endDate) : null;
    if (menuEnd) menuEnd.setHours(23, 59, 59, 999);

    const mealBelongsToMenu = (m) => {
      const rawId = m.menuItemId?._id || m.menuItemId;
      if (rawId) {
        // If we have a whitelist, use it; otherwise trust the ID
        return menuItemIdSet.size === 0 || menuItemIdSet.has(String(rawId));
      }
      // No menuItemId — fall back to date range check
      if (m.date && menuStart && menuEnd) {
        const d = new Date(m.date);
        return d >= menuStart && d <= menuEnd;
      }
      // Can't determine — include conservatively
      return true;
    };

    // -- Source 1: MenuSelectionRecord (new, historical) --
    const records = await MenuSelectionRecord.find({ weeklyMenuId: id })
      .populate('selectedMeals.menuItemId', '_id mealName mealType itemDate')
      .sort({ submittedAt: -1 });

    const recordEmails = new Set(records.map(r => String(r.email || '').toLowerCase()));

    // -- Source 2: Customer.selectedMeals (legacy, only currentWeekMenu matches) --
    const legacyCustomers = await Customer.find({
      currentWeekMenu: id,
      selectedMeals: { $exists: true, $not: { $size: 0 } }
    })
      .select('customerId email firstName lastName mealExclusion selectedMeals lastMenuSelectionDate')
      .populate('selectedMeals.menuItemId', '_id mealName mealType itemDate');

    // Backfill legacy customers — filter meals to only those belonging to THIS menu
    const toBackfill = legacyCustomers.filter(
      c => !recordEmails.has(String(c.email || '').toLowerCase())
    );
    if (toBackfill.length > 0) {
      console.log(`Backfilling ${toBackfill.length} legacy customers into MenuSelectionRecord for menu ${id}`);
      await Promise.all(toBackfill.map(c => {
        const filteredMeals = (c.selectedMeals || [])
          .filter(mealBelongsToMenu)
          .map(m => ({
            date: m.date,
            mealType: m.mealType,
            menuItemId: m.menuItemId?._id || m.menuItemId,
            mealName: m.mealName,
            description: m.description,
            slotNumber: m.slotNumber,
            proteinChoice: m.proteinChoice,
            vegChoice: m.vegChoice,
            carbChoice: m.carbChoice,
            sauceChoice: m.sauceChoice,
            quantity: m.quantity || 1
          }));
        if (filteredMeals.length === 0) return Promise.resolve();
        return MenuSelectionRecord.findOneAndUpdate(
          { weeklyMenuId: id, email: c.email },
          {
            $set: {
              weeklyMenuId: id,
              email: c.email,
              customerId: c.customerId,
              firstName: c.firstName,
              lastName: c.lastName,
              mealExclusion: c.mealExclusion,
              selectedMeals: filteredMeals,
              submittedAt: c.lastMenuSelectionDate || new Date()
            }
          },
          { upsert: true, new: true }
        );
      }));
    }

    // Fix any already-corrupted MenuSelectionRecords that contain meals from other menus.
    // Only run this pass when the menu has a known item whitelist.
    if (menuItemIdSet.size > 0) {
      const corruptedRecords = records.filter(r =>
        (r.selectedMeals || []).some(m => !mealBelongsToMenu(m))
      );
      if (corruptedRecords.length > 0) {
        console.log(`Cleaning ${corruptedRecords.length} MenuSelectionRecord(s) with cross-menu meals`);
        await Promise.all(corruptedRecords.map(r =>
          MenuSelectionRecord.findByIdAndUpdate(r._id, {
            $set: {
              selectedMeals: (r.selectedMeals || [])
                .filter(mealBelongsToMenu)
                .map(m => {
                  const obj = m.toObject ? m.toObject() : { ...m };
                  return { ...obj, menuItemId: m.menuItemId?._id || m.menuItemId };
                })
            }
          })
        ));
      }
    }

    // Re-fetch all records after backfill/cleanup
    const allRecords = await MenuSelectionRecord.find({ weeklyMenuId: id })
      .populate('selectedMeals.menuItemId', '_id mealName mealType itemDate')
      .sort({ submittedAt: -1 });

    const customerEmails = Array.from(new Set(
      allRecords.map((rec) => String(rec.email || '').trim().toLowerCase()).filter(Boolean)
    ));
    // One combined case-insensitive regex instead of an `$or` with one regex
    // clause per customer — functionally identical (matches any of the given
    // emails), but a menu with hundreds of selections used to build a query
    // with hundreds of `$or` branches here on every single page load.
    const customerDocs = customerEmails.length > 0
      ? await Customer.find({
          email: new RegExp(`^(${customerEmails.map(escapeRegex).join('|')})$`, 'i')
        })
          .select('customerId email firstName lastName cpf macros mealPerDay breakfastInclude mealSnack mealPlan mealExclusion weekend matterSubscriptionId')
      : [];
    const customerByEmail = new Map(
      customerDocs.map((customer) => [String(customer.email || '').trim().toLowerCase(), customer])
    );

    console.log('=== GET /menus/:id/selections debug ===');
    console.log('MenuSelectionRecord count:', allRecords.length);

    const sanitized = allRecords.map((rec) => {
      const exclusionStr = String(rec.mealExclusion || '');
      const exclusions = exclusionStr
        ? exclusionStr.split(/[,;|]/).map(e => e.trim().toLowerCase()).filter(Boolean)
        : [];

      // Consolidate duplicate meals (guard against any legacy duplicates).
      // mealType is part of the key — without it, two distinct auto-assigned
      // slots (e.g. lunch + dinner) that happen to land on the same dish
      // (common when a customer's exclusions leave only one eligible main
      // meal option) collapse into a single quantity:2 entry. Since quantity
      // is never factored into the macro/weight calculation, that silently
      // hid one whole meal's worth of macros from the kitchen list, AND
      // shrank dayMealCount from 2 to 1 — dumping the customer's entire
      // daily macro budget onto the one remaining "meal" instead of splitting
      // it, which is also what was tripping the per-meal protein/carb cap.
      const consolidatedMap = new Map();
      (rec.selectedMeals || []).forEach((m) => {
        const dateKey = m.date ? m.date.toISOString().split('T')[0] : '';
        const itemId = m.menuItemId
          ? String(m.menuItemId._id || m.menuItemId)
          : String(m.mealName || '');
        const slotKey = Number(m.slotNumber || 0);
        const mealTypeKey = String(m.mealType || '').trim().toLowerCase();
        const key = `${dateKey}||${itemId}||${slotKey}||${mealTypeKey}`;

        if (consolidatedMap.has(key)) {
          const existing = consolidatedMap.get(key);
          existing.quantity = (existing.quantity || 1) + (m.quantity || 1);
        } else {
          const mealObj = m.toObject ? m.toObject() : { ...m };
          consolidatedMap.set(key, { ...mealObj, quantity: m.quantity || 1 });
        }
      });

      const consolidatedMeals = Array.from(consolidatedMap.values()).map((m) => {
        const menuItem = m.menuItemId && typeof m.menuItemId === 'object' ? m.menuItemId : null;
        let mealName = '';
        if (menuItem && menuItem.mealName) mealName = menuItem.mealName;
        else if (m.mealName) mealName = m.mealName;
        const mealType = String(m.mealType || menuItem?.mealType || '').trim().toLowerCase() || 'meal';
        const lower = String(mealName).toLowerCase();
        const conflict = exclusions.some(ex => lower.includes(ex));
        return {
          ...m,
          mealName,
          mealType,
          menuItemName: menuItem?.mealName || mealName,
          menuItemMealType: menuItem?.mealType || mealType,
          quantity: m.quantity || 1,
          conflict
        };
      });

      const recObj = rec.toObject ? rec.toObject() : rec;
      const customer = customerByEmail.get(String(rec.email || '').trim().toLowerCase()) || null;
      // Macros come from the menu selection record itself or (client-side) the
      // customer's website subscription — never from the internal Customer page.
      const activeMacros = normalizeKitchenMacros(recObj.macros);
      return {
        ...recObj,
        targetMacros: activeMacros,
        customerMacros: activeMacros,
        mealPerDay: customer?.mealPerDay,
        breakfastInclude: customer?.breakfastInclude,
        mealSnack: customer?.mealSnack,
        mealPlan: customer?.mealPlan,
        weekend: customer?.weekend,
        // Set only when Customer Management's "Internal Customer Match" panel
        // has manually linked this customer to a Matter subscription whose
        // email doesn't match theirs — the client uses it to fetch nutrition
        // by subscription id instead of guessing by email.
        matterSubscriptionId: customer?.matterSubscriptionId || null,
        cpf: customer?.cpf || null,
        lastMenuSelectionDate: rec.submittedAt,
        selectedMeals: consolidatedMeals
      };
    });

    // Recalculate and persist the live count so the menu card stays accurate
    const liveCount = sanitized.length;
    await WeeklyMenu.findByIdAndUpdate(id, { $set: { selectionCount: liveCount } });

    res.json({
      success: true,
      data: sanitized
    });
  } catch (error) {
    console.error('Error fetching menu selections:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// MENU ITEM ROUTES
// ============================================

/**
 * GET /api/menu-items
 * Get menu items with filters
 */
router.get('/items', async (req, res) => {
  try {
    const { date, mealType, mealPlan, isAvailable = true } = req.query;

    const query = {};
    if (isAvailable) query.isAvailable = true;
    if (date) query.itemDate = new Date(date);
    if (mealType) query.mealType = mealType;
    if (mealPlan) query.mealPlan = mealPlan;

    const items = await MenuItem.find(query).sort({ itemDate: 1, mealType: 1 });

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/menu-items
 * Create menu item (admin only)
 */
router.post('/items', protect, async (req, res) => {
  try {
    const {
      itemDate,
      mealType,
      mealName,
      mealPlan,
      description,
      ingredients,
      category,
      intolerances,
      garnish,
        veg,
        sauce,
      calories,
      protein,
      carbs,
      fat,
      allergens,
      isVegan,
      isGlutenFree
    } = req.body;

    const item = new MenuItem({
      itemDate: new Date(itemDate),
      mealType,
      mealName,
      mealPlan,
      description,
      ingredients,
      category,
      intolerances,
      garnish,
      veg,
      sauce,
      calories,
      protein,
      carbs,
      fat,
      allergens,
      isVegan,
      isGlutenFree
    });

    await item.save();

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: item
    });
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/customers/:email/select-meals
 * Customer selects meals from weekly menu
 */
router.post('/customers/:email/select-meals', async (req, res) => {
  try {
    const { email } = req.params;
    const { weeklyMenuId, selections, macros, skippedDates } = req.body;
    const cleanEmail = String(email || '').trim();

    // Days the customer explicitly skipped in the selection flow (deduped, normalized)
    const skippedDateKeys = Array.from(new Set(
      (Array.isArray(skippedDates) ? skippedDates : [])
        .map(toDayKey)
        .filter(Boolean)
    ));

    console.log('=== POST /select-meals ===');
    console.log('Email:', cleanEmail);
    console.log('Selections received:', selections?.length || 0);
    if (selections && selections.length > 0) {
      console.log('First selection sample:', JSON.stringify(selections[0], null, 2));
      const totalWithQty = selections.reduce((sum, m) => sum + (m.quantity || 1), 0);
      console.log('Total meals (with quantity):', totalWithQty);
    }

    // Cross-reference against the full match cascade (manual link -> email ->
    // phone -> name), not just an exact email lookup, so a customer who
    // already exists internally under a different address (e.g. imported
    // from FileMaker/Athleat) is reused instead of creating a duplicate.
    let { customer } = await resolveCustomerMatch({ email: cleanEmail });

    if (!customer) {
      customer = new Customer({ email: cleanEmail, customerId: cleanEmail.split('@')[0] });
    }

    // Capture previous menu id AND selections before overwriting them.
    // We'll upsert them into the old menu's MenuSelectionRecord below.
    const previousMenuId = customer.currentWeekMenu
      ? String(customer.currentWeekMenu)
      : null;
    const previousMeals = (customer.selectedMeals || []).map(m => ({
      date: m.date,
      mealType: m.mealType,
      menuItemId: toMenuItemId(m.menuItemId),
      mealName: m.mealName,
      description: m.description,
      slotNumber: m.slotNumber,
      proteinChoice: m.proteinChoice,
      vegChoice: m.vegChoice,
      carbChoice: m.carbChoice,
      sauceChoice: m.sauceChoice,
      manualProteinType: m.manualProteinType || '',
      quantity: m.quantity || 1,
      carbVegAction: m.carbVegAction || undefined,
      carbVegConflict: m.carbVegConflict?.length ? m.carbVegConflict : undefined,
      carbConflict: m.carbConflict?.length ? m.carbConflict : undefined,
      vegConflict: m.vegConflict?.length ? m.vegConflict : undefined
    }));

    // Explicitly map selections to ensure quantity is preserved
    const mappedSelections = (selections || []).map(sel => ({
      date: sel.date,
      mealType: sel.mealType,
      menuItemId: toMenuItemId(sel.menuItemId),
      mealName: sel.mealName,
      description: sel.description,
      slotNumber: sel.slotNumber,
      proteinChoice: sel.proteinChoice,
      vegChoice: sel.vegChoice,
      carbChoice: sel.carbChoice,
      sauceChoice: sel.sauceChoice,
      manualProteinType: String(sel.manualProteinType || '').trim().toLowerCase(),
      quantity: Number(sel.quantity) || 1,  // Explicitly convert to number
      carbVegAction: sel.carbVegAction || undefined,
      carbVegConflict: sel.carbVegConflict?.length ? sel.carbVegConflict : undefined,
      carbConflict: sel.carbConflict?.length ? sel.carbConflict : undefined,
      vegConflict: sel.vegConflict?.length ? sel.vegConflict : undefined
    }));

    console.log('Mapped selections with quantity:', mappedSelections.map(s => ({ 
      mealName: s.mealName, 
      quantity: s.quantity,
      quantityType: typeof s.quantity
    })));

    // Update selected meals on the customer (for the customer-facing "load my selections" feature)
    customer.selectedMeals = mappedSelections;
    customer.currentWeekMenu = weeklyMenuId;
    customer.lastMenuSelectionDate = new Date();

    console.log('BEFORE save - customer.selectedMeals[0]:', customer.selectedMeals[0]);
    console.log('BEFORE save - quantity value:', customer.selectedMeals[0]?.quantity);
    console.log('BEFORE save - quantity type:', typeof customer.selectedMeals[0]?.quantity);

    const saveResult = await customer.save();
    
    console.log('AFTER save (return value) - selectedMeals[0]:', saveResult.selectedMeals[0]);
    console.log('AFTER save (return value) - quantity:', saveResult.selectedMeals[0]?.quantity);

    console.log('Saved to DB. Checking what was saved...');
    const savedCustomer = await Customer.findById(customer._id);
    console.log('Saved selectedMeals count:', savedCustomer.selectedMeals.length);
    if (savedCustomer.selectedMeals.length > 0) {
      console.log('First saved meal:', {
        mealName: savedCustomer.selectedMeals[0].mealName,
        quantity: savedCustomer.selectedMeals[0].quantity
      });
    }

    // Upsert a MenuSelectionRecord so historical selections per menu are preserved
    // even after the customer moves on to a newer menu week.
    if (weeklyMenuId) {
      // Merge skipped days: keep a prior successful/already-paused outcome for a
      // date that's still skipped (so a re-submit never double-pauses), mark
      // everything else pending for the background processor to (re)try.
      const prior = await MenuSelectionRecord.findOne({ weeklyMenuId, email: customer.email })
        .select('skippedDays').lean();
      const priorByDate = new Map((prior?.skippedDays || []).map((s) => [toDayKey(s.date), s]));
      const skippedDays = skippedDateKeys.map((date) => {
        const p = priorByDate.get(date);
        if (p && (p.pauseStatus === 'success' || p.pauseStatus === 'already_paused')) {
          return {
            date,
            pauseStatus: p.pauseStatus,
            resumeDate: p.resumeDate,
            subscriptionId: p.subscriptionId,
            processedAt: p.processedAt
          };
        }
        return { date, pauseStatus: 'pending' };
      });

      await MenuSelectionRecord.findOneAndUpdate(
        { weeklyMenuId, email: customer.email },
        {
          $set: {
            weeklyMenuId,
            customer: customer._id,
            email: customer.email,
            customerId: customer.customerId,
            firstName: customer.firstName,
            lastName: customer.lastName,
            mealExclusion: customer.mealExclusion,
            selectedMeals: mappedSelections,
            skippedDays,
            submittedAt: new Date(),
            macros: macros ? macros : undefined
          }
        },
        { upsert: true, new: true }
      );
      console.log('MenuSelectionRecord upserted for', customer.email, 'menu', weeklyMenuId, '- skipped days:', skippedDateKeys.length);
    }

    // Refresh selection count from MenuSelectionRecord (authoritative, never decrements on menu switch)
    if (weeklyMenuId) {
      const selectionTotal = await MenuSelectionRecord.countDocuments({ weeklyMenuId });
      await WeeklyMenu.findByIdAndUpdate(weeklyMenuId, { $set: { selectionCount: selectionTotal } });
    }

    // If the customer switched from a different menu, preserve their old selections
    // in that menu's MenuSelectionRecord before they are lost, then update its count.
    if (previousMenuId && previousMenuId !== String(weeklyMenuId) && previousMeals.length > 0) {
      // Only upsert if no record exists yet — don't overwrite a record the customer
      // already submitted directly (which would be more accurate).
      const existingOldRecord = await MenuSelectionRecord.findOne({
        weeklyMenuId: previousMenuId,
        email: customer.email
      });
      if (!existingOldRecord) {
        await MenuSelectionRecord.findOneAndUpdate(
          { weeklyMenuId: previousMenuId, email: customer.email },
          {
            $set: {
              weeklyMenuId: previousMenuId,
              customer: customer._id,
              email: customer.email,
              customerId: customer.customerId,
              firstName: customer.firstName,
              lastName: customer.lastName,
              mealExclusion: customer.mealExclusion,
              selectedMeals: previousMeals,
              submittedAt: customer.lastMenuSelectionDate || new Date()
            }
          },
          { upsert: true, new: true }
        );
        console.log(`Preserved old selections for ${customer.email} in menu ${previousMenuId}`);
      }
      const oldSelectionTotal = await MenuSelectionRecord.countDocuments({ weeklyMenuId: previousMenuId });
      await WeeklyMenu.findByIdAndUpdate(previousMenuId, { $set: { selectionCount: oldSelectionTotal } });
      console.log(`Updated old menu ${previousMenuId} selectionCount to ${oldSelectionTotal}`);
    }

    res.json({
      success: true,
      message: 'Meals selected successfully',
      data: customer
    });

    // Fire-and-forget: pause each skipped day on the customer's Matter
    // subscription and place the resume day after the cycle end. The customer
    // has already been responded to and sees nothing about this — outcomes are
    // recorded on MenuSelectionRecord.skippedDays for the admin view.
    if (weeklyMenuId && skippedDateKeys.length > 0) {
      processSkippedDayPauses({
        weeklyMenuId,
        email: customer.email,
        weekendEnabled: !!customer.weekend,
        matterSubscriptionId: resolveMatterSubscriptionId(customer)
      }).catch((err) => {
        console.error('processSkippedDayPauses failed for', customer.email, 'menu', weeklyMenuId, '-', err.message);
      });
    }
  } catch (error) {
    console.error('Error selecting meals:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/menus/:menuId/selections/:email
 * Admin deletes a customer's selection record for a specific menu.
 */
router.delete('/:menuId/selections/:email', protect, async (req, res) => {
  try {
    const { menuId, email } = req.params;
    const cleanEmail = decodeURIComponent(String(email || '')).trim().toLowerCase();

    const deleted = await MenuSelectionRecord.findOneAndDelete({
      weeklyMenuId: menuId,
      email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') }
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Selection record not found' });
    }

    // Also clear the Customer document's cached selection fields so the
    // customer-facing share link no longer shows the deleted selections.
    const customer = await Customer.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
    if (customer) {
      const updateFields = { selectedMeals: [] };
      // Only clear currentWeekMenu if it points to this specific menu
      if (customer.currentWeekMenu && String(customer.currentWeekMenu) === String(menuId)) {
        updateFields.currentWeekMenu = null;
        updateFields.lastMenuSelectionDate = null;
      }
      await Customer.findByIdAndUpdate(customer._id, { $set: updateFields });

      // Invalidate the meal-profile cache for this customer
      const cacheKeysToDelete = [
        `customer:profile:${customer.customerId}:${cleanEmail}:${menuId}`,
        `customer:profile:${customer.email}:${customer.email}:${menuId}`,
        `customer:profile:${cleanEmail}:${cleanEmail}:${menuId}`,
        `customer:profile:${customer.customerId}:${cleanEmail}:`,
        `customer:profile:${customer.customerId}::`,
      ];
      await Promise.all(cacheKeysToDelete.map(k => cacheDelete(k).catch(() => {})));
    }

    // Update the menu's selectionCount
    const selectionTotal = await MenuSelectionRecord.countDocuments({ weeklyMenuId: menuId });
    await WeeklyMenu.findByIdAndUpdate(menuId, { $set: { selectionCount: selectionTotal } });

    return res.json({ success: true, message: 'Selection deleted successfully' });
  } catch (error) {
    console.error('Error deleting selection:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: update macro presets (breakfast / snack) for a customer's selection record
router.patch('/:menuId/selections/:email/macros-presets', protect, async (req, res) => {
  try {
    const { menuId } = req.params;
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    const { breakfast, snack } = req.body;

    const update = {};
    if (breakfast) update['macros.presets.breakfast'] = breakfast;
    if (snack)     update['macros.presets.snack']     = snack;

    const record = await MenuSelectionRecord.findOneAndUpdate(
      { weeklyMenuId: menuId, email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      { $set: update },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Selection record not found' });
    }

    return res.json({ success: true, data: record.macros });
  } catch (error) {
    console.error('Error updating macro presets:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin override: update a customer's meal selections for a given menu
router.put('/:menuId/selections/:email', protect, async (req, res) => {
  try {
    const { menuId } = req.params;
    const email = decodeURIComponent(req.params.email).trim();
    const { selections } = req.body;

    if (!Array.isArray(selections)) {
      return res.status(400).json({ success: false, message: 'selections must be an array' });
    }

    const menu = await WeeklyMenu.findById(menuId);
    if (!menu) return res.status(404).json({ success: false, message: 'Menu not found' });

    const safeEmailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const customer = await Customer.findOne({ email: safeEmailRegex });

    const normalizedSelections = selections.map((sel) => ({
      date: sel.date,
      mealType: sel.mealType,
      menuItemId: toMenuItemId(sel.menuItemId),
      mealName: sel.mealName,
      description: sel.description,
      slotNumber: sel.slotNumber,
      proteinChoice: sel.proteinChoice,
      vegChoice: sel.vegChoice,
      carbChoice: sel.carbChoice,
      sauceChoice: sel.sauceChoice,
      manualProteinType: String(sel.manualProteinType || '').trim().toLowerCase(),
      quantity: Number(sel.quantity) || 1,
      carbVegAction: sel.carbVegAction,
      carbVegConflict: sel.carbVegConflict,
      carbConflict: sel.carbConflict,
      vegConflict: sel.vegConflict,
      isAutoAssigned: !!sel.isAutoAssigned
    }));

    const record = await MenuSelectionRecord.findOneAndUpdate(
      { weeklyMenuId: menuId, email: safeEmailRegex },
      {
        $set: {
          selectedMeals: normalizedSelections,
          submittedAt: new Date(),
          email: customer?.email || email,
          customerId: customer?.customerId,
          firstName: customer?.firstName,
          lastName: customer?.lastName,
          mealExclusion: customer?.mealExclusion
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Sync to customer document when available (legacy records may not have a Customer row yet).
    if (customer) {
      customer.selectedMeals = normalizedSelections;
      customer.currentWeekMenu = menuId;
      await customer.save();

      // Invalidate caches
      cacheDelete(`meal-profile-${customer.customerId}`);
    }
    cacheDeletePattern(`weekly-menu`);

    return res.json({ success: true, message: 'Selection updated successfully', record });
  } catch (error) {
    console.error('Error updating selection (admin override):', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
