import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Upload, Download, RefreshCw, Search, Loader, UtensilsCrossed, ChefHat, Trash2, Shuffle, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../utils/api';
import { calculateKitchenListEntry } from '../utils/kitchenListCalculations';
import {
  emptyBreakfast,
  normalizeBreakfastKey,
  saveBreakfastPresetToStorage,
  fetchBreakfastPresets,
  fetchSnackPresets,
  isRouteNotFound,
  getCustomerName,
  getDateKey,
  formatDateLabel,
  enrichSelectionsWithNutrition,
  deriveDateKeys
} from '../lib/kitchenData';

const getMealLabel = (meal) => {
  const mealType = String(meal?.mealType || meal?.menuItemMealType || meal?.menuItemId?.mealType || '').trim().toLowerCase();
  const mealName = String(meal?.mealName || meal?.menuItemName || meal?.menuItemId?.mealName || '').trim();
  const displayType = mealType === 'breakfast' ? 'Breakfast' : mealType === 'snack' ? 'Snack' : 'Meal';
  return {
    mealType: displayType,
    mealName: mealName || 'Unnamed meal'
  };
};

const detectProteinType = (meal) => {
  const text = String(
    meal?.proteinChoice
    || meal?.mealName
    || meal?.menuItemName
    || meal?.menuItemId?.mealName
    || meal?.description
    || ''
  ).toLowerCase();

  if (text.includes('chicken')) return 'Chicken';
  if (text.includes('beef')) return 'Beef';
  if (text.includes('fish') || text.includes('shrimp') || text.includes('salmon') || text.includes('seafood')) return 'Fish';
  return 'Unknown';
};

const groupMealsByDay = (meals = []) => {
  const grouped = meals.reduce((acc, meal) => {
    const key = getDateKey(meal?.date);
    if (!acc[key]) {
      acc[key] = {
        dateKey: key,
        dateLabel: formatDateLabel(meal?.date),
        meals: []
      };
    }
    acc[key].meals.push(meal);
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

const buildMealOverrideKey = (entry, meal, index) => {
  const email = String(entry?.email || '').trim().toLowerCase();
  const date = getDateKey(meal?.date);
  const menuItemId = String(meal?.menuItemId?._id || meal?.menuItemId || meal?.mealName || index);
  const slotNumber = Number(meal?.slotNumber || 0);
  return `${email}::${date}::${menuItemId}::${slotNumber}::${index}`;
};

const attachStableMealKeys = (entry) => {
  const selectedMeals = Array.isArray(entry?.selectedMeals) ? entry.selectedMeals : [];
  const keyedMeals = selectedMeals.map((meal, index) => {
    const stableKey = meal?._overrideKey || buildMealOverrideKey(entry, meal, index);
    return {
      ...meal,
      _overrideKey: stableKey
    };
  });

  return {
    ...entry,
    selectedMeals: keyedMeals
  };
};

// A sheet's declared "used range" (sheet['!ref']) can massively overstate
// where the real data ends — e.g. background color or borders applied to
// whole columns in Excel makes it report data out to row 1,048,576. Left
// uncapped, sheet_to_json synchronously builds an array with hundreds of
// thousands of blank row objects, which is exactly the kind of unbroken
// main-thread work that trips Chrome's hang detector (RESULT_CODE_HUNG) and
// can crash the tab. Any upload on this page is realistically dozens of
// rows, so cap it generously and skip fully-blank rows outright.
const MAX_UPLOAD_ROWS = 5000;
const readSheetRowsSafely = (sheet) => {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  if (range && (range.e.r - range.s.r) > MAX_UPLOAD_ROWS) {
    range.e.r = range.s.r + MAX_UPLOAD_ROWS;
    console.warn(`Upload: sheet reported far more rows than expected; only the first ${MAX_UPLOAD_ROWS} were read.`);
  }
  return XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    blankrows: false,
    ...(range ? { range } : {})
  });
};

const parseBreakfastRow = (row) => {
  const breakfastName = String(
    row.BreakfastName
    ?? row.Breakfast
    ?? row.MealName
    ?? row.Name
    ?? row.breakfastName
    ?? row.breakfast
    ?? row.mealName
    ?? row.name
    ?? ''
  ).trim();

  const C = Number(row.C ?? row.Carbs ?? row.carbs ?? 0) || 0;
  const P = Number(row.P ?? row.Protein ?? row.protein ?? 0) || 0;
  const F = Number(row.F ?? row.Fats ?? row.fats ?? 0) || 0;
  const rawV = row.V ?? row.Veg ?? row.VegWeight ?? row.veg;
  const hasExplicitV = rawV !== undefined && rawV !== null && String(rawV).trim() !== '';

  return {
    breakfastName,
    C,
    P,
    F,
    V: hasExplicitV ? (Number(rawV) || 80) : 80,
    isLargeBreakfast: String(row.LargeBreakfast ?? row.isLargeBreakfast ?? '').toLowerCase() === 'true'
  };
};

const normalizeSelectionForSave = (meal) => ({
  date: meal?.date,
  mealType: meal?.mealType,
  menuItemId: meal?.menuItemId?._id || meal?.menuItemId,
  mealName: meal?.mealName,
  description: meal?.description,
  slotNumber: meal?.slotNumber,
  proteinChoice: meal?.proteinChoice,
  vegChoice: meal?.vegChoice,
  carbChoice: meal?.carbChoice,
  sauceChoice: meal?.sauceChoice,
  manualProteinType: String(meal?.manualProteinType || '').trim().toLowerCase(),
  quantity: Number(meal?.quantity) || 1,
  carbVegAction: meal?.carbVegAction,
  carbVegConflict: meal?.carbVegConflict,
  carbConflict: meal?.carbConflict,
  vegConflict: meal?.vegConflict,
  isAutoAssigned: !!meal?.isAutoAssigned
});

const KitchenList = () => {
  const [menus, setMenus] = useState([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [menuSelections, setMenuSelections] = useState([]);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [loadingSelections, setLoadingSelections] = useState(false);
  // searchInput updates on every keystroke; `search` (used by the heavy
  // customerRows calculation below) only updates 250ms after typing stops,
  // so typing doesn't re-run macro math for every visible customer on every
  // keystroke — a major source of the page freezing up while typing.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);
  const [error, setError] = useState('');
  const [breakfastPreset, setBreakfastPreset] = useState(emptyBreakfast);
  const [snackPreset, setSnackPreset] = useState({ presetsByName: {} });
  const [snackPresetForm, setSnackPresetForm] = useState({ name: '', C: '', P: '', F: '' });
  const [savingSnackPreset, setSavingSnackPreset] = useState(false);
  const [importName, setImportName] = useState('');
  const [mealTypeOverrides, setMealTypeOverrides] = useState({});
  const [savingOverrideKey, setSavingOverrideKey] = useState('');
  const [snackOptionsByDate, setSnackOptionsByDate] = useState({});
  const [pdfDate, setPdfDate] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [missingSelectionEntries, setMissingSelectionEntries] = useState([]);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [missingCheckDate, setMissingCheckDate] = useState('');
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [mainMealOptionsByDate, setMainMealOptionsByDate] = useState({});
  const [savingMainMealOptions, setSavingMainMealOptions] = useState(false);
  const [breakfastOptionsByDate, setBreakfastOptionsByDate] = useState({});
  const [savingBreakfastOptions, setSavingBreakfastOptions] = useState(false);
  const [matterCoreMealOptionsByDate, setMatterCoreMealOptionsByDate] = useState({});
  const [savingMatterCoreMealOptions, setSavingMatterCoreMealOptions] = useState(false);
  const [matterCoreMealInput, setMatterCoreMealInput] = useState('');
  const [uploadingWeeklyMenu, setUploadingWeeklyMenu] = useState(false);
  const [weeklyMenuUploadName, setWeeklyMenuUploadName] = useState('');
  const [weeklyMenuUploadResult, setWeeklyMenuUploadResult] = useState(null);
  // Caches each customer's Matter website nutrition lookup for the life of
  // the page, so switching menus, re-running auto-assign, or reloading
  // selections doesn't re-fire a network call for every customer again —
  // only for ones not seen yet. Cleared by the menu refresh button.
  const nutritionCacheRef = useRef(new Map());
  const [savingSnackOptions, setSavingSnackOptions] = useState(false);
  const [assigningAll, setAssigningAll] = useState(false);
  const [autoAssignResult, setAutoAssignResult] = useState(null);

  useEffect(() => {
    const loadMenus = async () => {
      try {
        setLoadingMenus(true);
        const response = await api.get('/menus?isActive=all&limit=100');
        if (response.data?.success) {
          const menuRows = response.data.data || [];
          setMenus(menuRows);
          // No auto-select — nothing loads (nutrition lookups, selections,
          // menu-specific options) until the kitchen explicitly picks a menu.
        }
        if (!response.data?.data?.length) {
          setError('No menus were found. Create or activate a menu first.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load menus');
      } finally {
        setLoadingMenus(false);
      }
    };

    loadMenus();
  }, []);

  // A date choice belongs to one menu — switching menus must not carry over
  // the previous menu's date and silently start loading data for it again
  // (defeating "don't load until a date is chosen"), and must not leave the
  // previous menu's customers/options on screen while a new date is picked.
  useEffect(() => {
    setMissingCheckDate('');
    setPdfDate('');
    setMenuSelections([]);
    setMissingSelectionEntries([]);
    setMainMealOptionsByDate({});
    setSnackOptionsByDate({});
    setBreakfastOptionsByDate({});
    setMatterCoreMealOptionsByDate({});
    setMatterCoreMealInput('');
  }, [selectedMenuId]);

  const loadSelections = useCallback(async () => {
    // Selecting a menu alone must not trigger the nutrition-lookup-per-customer
    // fetch below — that only happens once a date is picked too.
    if (!selectedMenuId || !missingCheckDate) return [];

    try {
        setLoadingSelections(true);
        setError('');
        setMissingSelectionEntries([]);
        // autoPopulateDate (Stage 3): silently fills in placeholder selections
        // for any Matter subscriber with a delivery this date who never
        // submitted one themselves, before the server returns this list — so
        // Kitchen List/Counting never miss them without a manual "Check
        // Missing Selections" click.
        const response = await api.get(`/menus/${selectedMenuId}/selections`, {
          params: { autoPopulateDate: missingCheckDate }
        });

        const breakfastState = await fetchBreakfastPresets(api, selectedMenuId);
        setBreakfastPreset(breakfastState);
        if (Object.keys(breakfastState.presetsByName || {}).length > 0) {
          saveBreakfastPresetToStorage(breakfastState);
        }
        setImportName(Object.keys(breakfastState.presetsByName || {}).length > 0 ? 'Loaded from server' : '');

        try {
          setSnackPreset(await fetchSnackPresets(api));
        } catch (err) {
          setSnackPreset({ presetsByName: {} });
        }

        if (response.data?.success) {
          const rawSelections = response.data.data || [];

          // Macros, snacks/day, and plan name always come from the customer's website
          // subscription (Matter API), never from the internal Customer page — even
          // when the Customer page already has values. Cached per email (see
          // nutritionCacheRef) and fetched at most 8 at a time — firing all of
          // these at once for hundreds of customers is what was freezing the page.
          //
          // Some internal customers were set up with a different email than
          // their Matter website subscription — for those, email lookup would
          // silently match nothing (or the wrong person). Customer
          // Management's "Internal Customer Match" panel links such a
          // customer to their real subscription via matterSubscriptionId;
          // when that's set, look up by that id directly instead of email.
          const enrichedSelections = await enrichSelectionsWithNutrition(api, rawSelections, nutritionCacheRef, { extended: true });

          const keyedSelections = enrichedSelections.map((entry) => attachStableMealKeys(entry));
          setMenuSelections(keyedSelections);
          return keyedSelections;
        }
        return [];
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load menu selections');
      return [];
    } finally {
      setLoadingSelections(false);
    }
  }, [selectedMenuId, missingCheckDate]);

  useEffect(() => { loadSelections(); }, [loadSelections]);

  // All four loaders below wait for BOTH a menu and a date to be picked —
  // selecting a menu alone (e.g. while still deciding which date to work on)
  // must not trigger any fetch. menuDateKeys populates the Date dropdown
  // itself from the menu's own start/end range without needing any of this
  // data first, so there's no chicken-and-egg problem in gating it this way.
  const loadSnackOptions = useCallback(async () => {
    if (!selectedMenuId || !missingCheckDate) {
      setSnackOptionsByDate({});
      return;
    }
    try {
      const res = await api.get(`/menus/${selectedMenuId}/snack-options`);
      setSnackOptionsByDate(res.data?.data || {});
    } catch (err) {
      setSnackOptionsByDate({});
    }
  }, [selectedMenuId, missingCheckDate]);

  useEffect(() => { loadSnackOptions(); }, [loadSnackOptions]);

  const loadMainMealOptions = useCallback(async () => {
    if (!selectedMenuId || !missingCheckDate) {
      setMainMealOptionsByDate({});
      return;
    }
    try {
      const res = await api.get(`/menus/${selectedMenuId}/main-meal-options`);
      setMainMealOptionsByDate(res.data?.data || {});
    } catch (err) {
      setMainMealOptionsByDate({});
    }
  }, [selectedMenuId, missingCheckDate]);

  useEffect(() => { loadMainMealOptions(); }, [loadMainMealOptions]);

  const loadBreakfastOptions = useCallback(async () => {
    if (!selectedMenuId || !missingCheckDate) {
      setBreakfastOptionsByDate({});
      return;
    }
    try {
      const res = await api.get(`/menus/${selectedMenuId}/breakfast-options`);
      setBreakfastOptionsByDate(res.data?.data || {});
    } catch (err) {
      setBreakfastOptionsByDate({});
    }
  }, [selectedMenuId, missingCheckDate]);

  useEffect(() => { loadBreakfastOptions(); }, [loadBreakfastOptions]);

  const loadMatterCoreMealOptions = useCallback(async () => {
    if (!selectedMenuId || !missingCheckDate) {
      setMatterCoreMealOptionsByDate({});
      return;
    }
    try {
      const res = await api.get(`/menus/${selectedMenuId}/matter-core-meal-options`);
      setMatterCoreMealOptionsByDate(res.data?.data || {});
    } catch (err) {
      setMatterCoreMealOptionsByDate({});
    }
  }, [selectedMenuId, missingCheckDate]);

  useEffect(() => { loadMatterCoreMealOptions(); }, [loadMatterCoreMealOptions]);

  const selectedMenu = useMemo(
    () => menus.find((m) => m._id === selectedMenuId) || null,
    [menus, selectedMenuId]
  );

  // Includes dates from customer selections, from whatever the kitchen has
  // already uploaded (main/sub/breakfast/snack options), and — when neither
  // of those exist yet — every day in the menu's own date range. Without that
  // last fallback, a brand-new menu with zero customer selections and zero
  // uploads would hide the entire rotation-setup card (Upload Weekly Menu
  // included), so kitchen could never get a date to upload against in the
  // first place.
  const menuDateKeys = useMemo(
    () => deriveDateKeys({ menuSelections, mainMealOptionsByDate, breakfastOptionsByDate, snackOptionsByDate, selectedMenu }),
    [menuSelections, mainMealOptionsByDate, breakfastOptionsByDate, snackOptionsByDate, selectedMenu]
  );

  // On-demand only: checking delivery_schedule means a full-detail fetch per
  // active subscription (hundreds of Matter API calls), so this never runs
  // automatically — only when the user clicks "Check Missing Selections".
  const checkMissingSelections = async (dateKey, selectionsOverride) => {
    if (!dateKey) return;
    setCheckingMissing(true);
    setError('');
    try {
      const res = await api.get('/matter/subscriptions/delivery-on-date', {
        params: { date: dateKey }
      });
      const subs = res.data?.data || [];

      // Use freshly-fetched selections when passed in (e.g. right after an
      // assignment) instead of `menuSelections`, which won't reflect a
      // same-tick loadSelections() call until the next render.
      const activeSelections = selectionsOverride || menuSelections;

      // Some internal customers are linked to a Matter subscription whose
      // email differs from theirs (Customer.matterSubscriptionId, set via
      // Customer Management's "Internal Customer Match" panel). Resolve each
      // Matter row back to that internal identity by subscription id first —
      // otherwise a customer already covered for this date under their real
      // (internal) email gets wrongly flagged missing under their Matter
      // email, and assigning meals for them would create a stray duplicate
      // MenuSelectionRecord keyed by the wrong email instead of updating
      // their real one.
      const internalBySubscriptionId = new Map();
      activeSelections.forEach((entry) => {
        const subId = String(entry?.matterSubscriptionId || '').trim();
        if (subId) internalBySubscriptionId.set(subId, entry);
      });

      const coveredEmails = new Set();
      activeSelections.forEach((entry) => {
        const hasSelectionThatDay = (entry.selectedMeals || []).some((m) => getDateKey(m?.date) === dateKey);
        if (hasSelectionThatDay) coveredEmails.add(String(entry.email || '').trim().toLowerCase());
      });

      const missing = subs
        .map((sub) => {
          const matched = internalBySubscriptionId.get(String(sub.subscription_id || '').trim());
          return {
            sub,
            resolvedEmail: matched?.email || sub.email || '',
            resolvedCustomerId: matched?.customerId || String(sub.customer_id ?? sub.subscription_id),
            resolvedName: matched ? getCustomerName(matched) : sub.name
          };
        })
        .filter(({ resolvedEmail }) => !coveredEmails.has(String(resolvedEmail).trim().toLowerCase()))
        .map(({ sub, resolvedEmail, resolvedCustomerId, resolvedName }) => ({
          customerId: resolvedCustomerId,
          customerName: resolvedName,
          firstName: resolvedName,
          lastName: '',
          email: resolvedEmail,
          selectedMeals: [],
          _missingSelection: true,
          _missingSelectionDate: dateKey,
          _mealFrequency: sub.meal_frequency,
          _exclusions: sub.exclusions || [],
          dietaryRestrictions: sub.exclusions || []
        }));

      setMissingSelectionEntries(missing);
      setAutoAssignResult(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to check missing selections');
    } finally {
      setCheckingMissing(false);
    }
  };

  const saveMainMealOptionsForDate = async (date, mainMeals, subMeals) => {
    if (!selectedMenuId || !date) return;
    setSavingMainMealOptions(true);
    try {
      const res = await api.put(`/menus/${selectedMenuId}/main-meal-options`, { date, mainMeals, subMeals });
      setMainMealOptionsByDate(res.data?.data || {});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save main meal options');
    } finally {
      setSavingMainMealOptions(false);
    }
  };

  // Shared by the standalone breakfast importer and the weekly menu upload's
  // "breakfast" rows. Breakfast presets are global (keyed by name), not
  // per-date, unlike main/sub meals and snacks. Tries the dedicated endpoint
  // first, then falls back to older per-menu routes for backward compatibility.
  const persistBreakfastPresets = async (parsedRows, firstRow, presetsByName) => {
    let savedPreset = firstRow;
    let savedPresetsByName = presetsByName;

    try {
      const saveResponse = await api.put('/menus/kitchen-breakfast-presets', {
        presets: parsedRows,
        defaultPreset: firstRow
      });
      savedPreset = saveResponse.data?.data?.breakfastPreset || firstRow;
      savedPresetsByName = saveResponse.data?.data?.presetsByName || presetsByName;
    } catch (saveError) {
      if (!isRouteNotFound(saveError)) throw saveError;

      try {
        await api.put(`/menus/${selectedMenuId}/breakfast-presets`, {
          presets: parsedRows,
          defaultPreset: firstRow
        });
      } catch (menuSaveError) {
        if (!isRouteNotFound(menuSaveError)) throw menuSaveError;

        await api.put(`/menus/${selectedMenuId}`, {
          breakfastPreset: firstRow,
          breakfastPresetsByName: presetsByName
        });
      }
    }

    const nextState = {
      breakfastName: savedPreset.breakfastName || '',
      C: savedPreset.C ?? '',
      P: savedPreset.P ?? '',
      F: savedPreset.F ?? '',
      V: savedPreset.V ?? 80,
      isLargeBreakfast: !!savedPreset.isLargeBreakfast,
      presetsByName: savedPresetsByName
    };
    setBreakfastPreset(nextState);
    saveBreakfastPresetToStorage(nextState);
    return nextState;
  };

  // Bulk-import the whole week's menu from one spreadsheet instead of adding
  // items one at a time. Expected columns (case-insensitive), every row scoped
  // to its Date (required for all slots — breakfast now rotates per-date too):
  // Date, Slot (main/sub/snack1/snack2/breakfast, defaults to main),
  // MealName, Type (chicken/beef/fish — main/sub only), Exclusions (comma-separated,
  // matched against each customer's exclusion list for every slot type),
  // C, P, F (snack/breakfast macros), V + LargeBreakfast (breakfast only —
  // also updates the shared global breakfast preset used for weight calc).
  // Reuses the existing single-date PUT endpoints, one date at a time
  // (sequential, so concurrent saves to the same menu document's Map fields never race).
  const downloadWeeklyMenuTemplate = () => {
    const sampleDate = menuDateKeys[0] || getDateKey(new Date());
    const rows = [
      { Date: sampleDate, Slot: 'main', MealName: 'Grilled Chicken Breast', Type: 'chicken', Exclusions: '', C: '', P: '', F: '', V: '', LargeBreakfast: '' },
      { Date: sampleDate, Slot: 'main', MealName: 'Beef Stir Fry', Type: 'beef', Exclusions: 'Dairy', C: '', P: '', F: '', V: '', LargeBreakfast: '' },
      { Date: sampleDate, Slot: 'main', MealName: 'Baked Salmon', Type: 'fish', Exclusions: 'Shellfish', C: '', P: '', F: '', V: '', LargeBreakfast: '' },
      { Date: sampleDate, Slot: 'sub', MealName: 'Chicken Fallback', Type: 'chicken', Exclusions: '', C: '', P: '', F: '', V: '', LargeBreakfast: '' },
      { Date: sampleDate, Slot: 'snack1', MealName: 'Greek Yogurt', Type: '', Exclusions: 'Dairy', C: 15, P: 10, F: 3, V: '', LargeBreakfast: '' },
      { Date: sampleDate, Slot: 'snack2', MealName: 'Almonds', Type: '', Exclusions: 'Nuts', C: 6, P: 6, F: 14, V: '', LargeBreakfast: '' },
      { Date: sampleDate, Slot: 'breakfast', MealName: 'Egg White Wrap', Type: '', Exclusions: 'Eggs', C: 30, P: 30, F: 10, V: 80, LargeBreakfast: false }
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Weekly Menu');
    XLSX.writeFile(workbook, 'weekly-menu-upload-template.xlsx');
  };

  const handleWeeklyMenuUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedMenuId) {
      setError('Select a menu first');
      event.target.value = '';
      return;
    }

    try {
      setUploadingWeeklyMenu(true);
      setError('');
      setWeeklyMenuUploadResult(null);

      const buffer = await file.arrayBuffer();
      // Deliberately NOT using cellDates: true. It sounds like the right fix
      // (real Date objects instead of raw serial numbers) but SheetJS builds
      // those Date objects using the LOCAL machine's timezone constructor —
      // so they only round-trip correctly when read back with local getters,
      // on a UTC machine. getDateKey reads Date objects with UTC getters
      // (correct for ISO date strings, which really are UTC-based per spec),
      // so combining the two silently shifted every uploaded date back a day
      // on any server/browser not running in UTC. Leaving cellDates off keeps
      // date cells as plain Excel serial numbers, which getDateKey converts
      // with its own pure UTC arithmetic below — no timezone involved at all,
      // verified correct regardless of the machine's local timezone.
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = readSheetRowsSafely(sheet);

      const mainByDate = {};
      const snackByDate = {};
      const breakfastByDate = {};
      const breakfastPresetRows = [];
      let skipped = 0;

      rows.forEach((row) => {
        const slot = String(row.Slot ?? row.slot ?? 'main').trim().toLowerCase();
        const dateKey = getDateKey(row.Date ?? row.date);
        const name = String(
          row.MealName ?? row.Name ?? row.mealName ?? row.name ?? row.BreakfastName ?? row.breakfastName ?? ''
        ).trim();
        const exclusions = String(row.Exclusions ?? row.exclusions ?? '')
          .split(',').map((e) => e.trim()).filter(Boolean);

        if (!dateKey || dateKey === 'unknown-date' || !name) {
          skipped += 1;
          return;
        }

        if (slot === 'breakfast') {
          const parsed = parseBreakfastRow(row);
          if (!parsed.breakfastName) {
            skipped += 1;
            return;
          }
          if (!breakfastByDate[dateKey]) breakfastByDate[dateKey] = [];
          breakfastByDate[dateKey].push({ name: parsed.breakfastName, exclusions });
          breakfastPresetRows.push(parsed);
          return;
        }

        if (slot === 'snack1' || slot === 'snack2' || slot === 'snack') {
          const C = Number(row.C ?? row.Carbs ?? row.carbs ?? 0) || 0;
          const P = Number(row.P ?? row.Protein ?? row.protein ?? 0) || 0;
          const F = Number(row.F ?? row.Fats ?? row.fats ?? 0) || 0;
          if (!snackByDate[dateKey]) snackByDate[dateKey] = { first: [], second: [] };
          const pool = slot === 'snack2' ? 'second' : 'first';
          snackByDate[dateKey][pool].push({ name, exclusions, C, P, F });
          return;
        }

        const type = String(row.Type ?? row.type ?? '').trim().toLowerCase();
        if (!['chicken', 'beef', 'fish'].includes(type)) {
          skipped += 1;
          return;
        }

        if (!mainByDate[dateKey]) mainByDate[dateKey] = { mainMeals: [], subMeals: [] };
        if (slot === 'sub' || mainByDate[dateKey].mainMeals.length >= 3) {
          mainByDate[dateKey].subMeals.push({ name, type, exclusions });
        } else {
          mainByDate[dateKey].mainMeals.push({ name, type, exclusions });
        }
      });

      const mainDateKeys = Object.keys(mainByDate).sort();
      const snackDateKeys = Object.keys(snackByDate).sort();
      const breakfastDateKeys = Object.keys(breakfastByDate).sort();

      if (mainDateKeys.length === 0 && snackDateKeys.length === 0 && breakfastDateKeys.length === 0) {
        setError('No valid rows found. Expected columns: Date, Slot (main/sub/snack1/snack2/breakfast), MealName, Type (chicken/beef/fish for main/sub), Exclusions, C, P, F.');
        return;
      }

      // One bulk PUT per type (main/sub, snack, breakfast) instead of one PUT
      // per date — a full week used to mean 7+ sequential round trips per
      // type (20+ total), each followed by a state update and a full page
      // re-render, which is what made large uploads feel like the page had
      // frozen. The server applies every date's entry in one document save.
      if (mainDateKeys.length > 0) {
        const res = await api.put(`/menus/${selectedMenuId}/main-meal-options`, {
          entries: mainDateKeys.map((dateKey) => ({
            date: dateKey,
            mainMeals: mainByDate[dateKey].mainMeals,
            subMeals: mainByDate[dateKey].subMeals
          }))
        });
        setMainMealOptionsByDate(res.data?.data || {});
      }
      if (snackDateKeys.length > 0) {
        const res = await api.put(`/menus/${selectedMenuId}/snack-options`, {
          entries: snackDateKeys.map((dateKey) => ({
            date: dateKey,
            first: snackByDate[dateKey].first,
            second: snackByDate[dateKey].second
          }))
        });
        setSnackOptionsByDate(res.data?.data || {});
      }
      if (breakfastDateKeys.length > 0) {
        const res = await api.put(`/menus/${selectedMenuId}/breakfast-options`, {
          entries: breakfastDateKeys.map((dateKey) => ({
            date: dateKey,
            options: breakfastByDate[dateKey]
          }))
        });
        setBreakfastOptionsByDate(res.data?.data || {});
      }

      if (breakfastPresetRows.length > 0) {
        const firstRow = breakfastPresetRows[0];
        const presetsByName = breakfastPresetRows.reduce((acc, row) => {
          const key = normalizeBreakfastKey(row.breakfastName);
          if (!key) return acc;
          acc[key] = { C: row.C, P: row.P, F: row.F, V: row.V, isLargeBreakfast: !!row.isLargeBreakfast };
          return acc;
        }, {});
        await persistBreakfastPresets(breakfastPresetRows, firstRow, presetsByName);
        setImportName(file.name);
      }

      // Jump the "Date" selector to whatever was just uploaded so the new
      // main/sub/breakfast/snack items are immediately visible instead of
      // silently landing on a date the kitchen isn't currently looking at.
      const uploadedDateKeys = Array.from(new Set([...mainDateKeys, ...snackDateKeys, ...breakfastDateKeys])).sort();
      if (uploadedDateKeys.length > 0) {
        setMissingCheckDate(uploadedDateKeys[0]);
      }

      setWeeklyMenuUploadName(file.name);
      setWeeklyMenuUploadResult({
        mainDays: mainDateKeys.length,
        snackDays: snackDateKeys.length,
        breakfastDays: breakfastDateKeys.length,
        uploadedDates: uploadedDateKeys,
        skipped
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload weekly menu');
    } finally {
      setUploadingWeeklyMenu(false);
      event.target.value = '';
    }
  };

  const removeMainMeal = (index) => {
    const current = mainMealOptionsByDate[missingCheckDate] || { mainMeals: [], subMeals: [] };
    const updatedMainMeals = (current.mainMeals || []).filter((_, i) => i !== index);
    saveMainMealOptionsForDate(missingCheckDate, updatedMainMeals, current.subMeals || []);
  };

  const removeSubMeal = (index) => {
    const current = mainMealOptionsByDate[missingCheckDate] || { mainMeals: [], subMeals: [] };
    const updatedSubMeals = (current.subMeals || []).filter((_, i) => i !== index);
    saveMainMealOptionsForDate(missingCheckDate, current.mainMeals || [], updatedSubMeals);
  };

  const saveBreakfastOptionsForDate = async (date, options) => {
    if (!selectedMenuId || !date) return;
    setSavingBreakfastOptions(true);
    try {
      const res = await api.put(`/menus/${selectedMenuId}/breakfast-options`, { date, options });
      setBreakfastOptionsByDate(res.data?.data || {});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save breakfast options');
    } finally {
      setSavingBreakfastOptions(false);
    }
  };

  const removeBreakfastOption = (index) => {
    const current = breakfastOptionsByDate[missingCheckDate] || [];
    const updated = current.filter((_, i) => i !== index);
    saveBreakfastOptionsForDate(missingCheckDate, updated);
  };

  // Matter Core customers (see auto-populate-missing on the server) get a
  // plain ordered list, no type/exclusions — a customer needing 2 meals just
  // gets list[0] and list[1]. Unlike the other rotation editors, this one has
  // no spreadsheet upload path, since it's a much simpler shape — meals are
  // just typed in one at a time.
  const saveMatterCoreMealOptionsForDate = async (date, meals) => {
    if (!selectedMenuId || !date) return;
    setSavingMatterCoreMealOptions(true);
    try {
      const res = await api.put(`/menus/${selectedMenuId}/matter-core-meal-options`, { date, meals });
      setMatterCoreMealOptionsByDate(res.data?.data || {});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save Matter Core meal options');
    } finally {
      setSavingMatterCoreMealOptions(false);
    }
  };

  const addMatterCoreMeal = () => {
    const name = matterCoreMealInput.trim();
    if (!name || !missingCheckDate) return;
    const current = matterCoreMealOptionsByDate[missingCheckDate] || [];
    saveMatterCoreMealOptionsForDate(missingCheckDate, [...current, { name }]);
    setMatterCoreMealInput('');
  };

  const removeMatterCoreMeal = (index) => {
    const current = matterCoreMealOptionsByDate[missingCheckDate] || [];
    const updated = current.filter((_, i) => i !== index);
    saveMatterCoreMealOptionsForDate(missingCheckDate, updated);
  };

  // Global snack macro table (not per-date, not per-menu) — a snack's own
  // fixed C/P/F, looked up by name at calc time whenever that name is
  // assigned to a customer, whether picked randomly by Auto-Assign Snacks or
  // (if ever) chosen by the customer. Used directly, never divided by
  // snacksPerDay, and falls back to the per-date Snack Rotation option's own
  // C/P/F when no name here matches (see resolveSnackPresetForMeal).
  const saveSnackPresets = async (presetsByName) => {
    setSavingSnackPreset(true);
    try {
      const presets = Object.values(presetsByName).map((p) => ({
        snackName: p.snackName,
        C: p.C,
        P: p.P,
        F: p.F
      }));
      const res = await api.put('/menus/kitchen-snack-presets', { presets });
      if (res.data?.success) {
        setSnackPreset({ presetsByName: res.data.data?.presetsByName || {} });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save snack macros');
    } finally {
      setSavingSnackPreset(false);
    }
  };

  const addSnackPreset = () => {
    const name = snackPresetForm.name.trim();
    if (!name) return;
    const key = normalizeBreakfastKey(name);
    const updated = {
      ...snackPreset.presetsByName,
      [key]: {
        snackName: name,
        C: Number(snackPresetForm.C) || 0,
        P: Number(snackPresetForm.P) || 0,
        F: Number(snackPresetForm.F) || 0
      }
    };
    saveSnackPresets(updated);
    setSnackPresetForm({ name: '', C: '', P: '', F: '' });
  };

  const removeSnackPreset = (key) => {
    const updated = { ...snackPreset.presetsByName };
    delete updated[key];
    saveSnackPresets(updated);
  };

  // One action instead of two: for every customer missing a selection on the
  // checked date, fills their main meals (plus breakfast, if their profile
  // has breakfastInclude on) via assign-main-meals, then fills their full
  // snack count for that same date via assign-snacks scoped to just this
  // date + these customers (not the old menu-wide, every-date behavior).
  // Order doesn't affect the resulting macro math — that's recalculated from
  // the final saved meals whenever the kitchen list weights are displayed —
  // it just means one click covers everything a missing customer needs.
  const runAutoAssign = async () => {
    if (!selectedMenuId || !missingCheckDate) return;
    if (missingSelectionEntries.length === 0) {
      setError('Run "Check Missing Selections" for this date first.');
      return;
    }
    setAssigningAll(true);
    setError('');
    try {
      const customers = missingSelectionEntries.map((entry) => ({
        email: entry.email,
        name: entry.customerName,
        customerId: entry.customerId,
        mealFrequency: entry._mealFrequency,
        exclusions: entry._exclusions
      }));

      const mainMealsRes = await api.post(`/menus/${selectedMenuId}/assign-main-meals`, {
        date: missingCheckDate,
        customers
      });
      const snacksRes = await api.post(`/menus/${selectedMenuId}/assign-snacks`, {
        date: missingCheckDate,
        customers
      });

      setAutoAssignResult({
        mainMeals: mainMealsRes.data?.data || null,
        snacks: snacksRes.data?.data || null
      });

      const freshSelections = await loadSelections();
      await checkMissingSelections(missingCheckDate, freshSelections);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to auto-assign');
    } finally {
      setAssigningAll(false);
    }
  };

  // No auto-select for the date pickers either — the kitchen chooses a date
  // explicitly (upload still jumps the "Date" selector to whatever was just
  // uploaded, via setMissingCheckDate in handleWeeklyMenuUpload — that's an
  // explicit result of the kitchen's own action, not a silent default).

  const saveSnackOptionsForDate = async (date, first, second) => {
    if (!selectedMenuId || !date) return;
    setSavingSnackOptions(true);
    try {
      const res = await api.put(`/menus/${selectedMenuId}/snack-options`, { date, first, second });
      setSnackOptionsByDate(res.data?.data || {});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save snack options');
    } finally {
      setSavingSnackOptions(false);
    }
  };

  const removeSnackOption = (pool, index) => {
    const current = snackOptionsByDate[missingCheckDate] || { first: [], second: [] };
    const updatedFirst = pool === 'first' ? (current.first || []).filter((_, i) => i !== index) : (current.first || []);
    const updatedSecond = pool === 'second' ? (current.second || []).filter((_, i) => i !== index) : (current.second || []);
    saveSnackOptionsForDate(missingCheckDate, updatedFirst, updatedSecond);
  };

  const customerRows = useMemo(() => {
    // A customer can have selections for some dates but still be missing one
    // for the specific date "Check Missing Selections" was run for — that
    // customer then shows up in BOTH menuSelections (their real entry, with
    // real meals) and missingSelectionEntries (a synthetic placeholder just
    // flagging the missing date). Concatenating the two arrays used to give
    // that customer two rows with the same email — a React duplicate-key
    // warning, and the actual cause of "Show only missing" seeming broken
    // (React's reconciliation gets confused by the key collision when the
    // filtered list changes size). Merge by email instead: keep the real
    // entry's meals, just flag it as missing that date.
    const byKey = new Map();
    const keyFor = (entry) => {
      const email = String(entry?.email || '').trim().toLowerCase();
      return email || `id:${entry?.customerId || ''}`;
    };

    menuSelections.forEach((entry) => {
      byKey.set(keyFor(entry), entry);
    });

    missingSelectionEntries.forEach((entry) => {
      const key = keyFor(entry);
      const existing = byKey.get(key);
      byKey.set(key, existing
        ? { ...existing, _missingSelection: true, _missingSelectionDate: entry._missingSelectionDate }
        : entry);
    });

    const combinedEntries = Array.from(byKey.values());
    return combinedEntries
      .filter((entry) => `${getCustomerName(entry)} ${entry.email || ''}`.toLowerCase().includes(search.toLowerCase()))
      .filter((entry) => !showOnlyMissing || entry._missingSelection)
      .map((entry) => {
        const enrichedMeals = (entry.selectedMeals || []).map((meal, index) => {
          const key = meal?._overrideKey || buildMealOverrideKey(entry, meal, index);
          const override = mealTypeOverrides[key];
          return {
            ...meal,
            manualProteinType: override || meal.manualProteinType || ''
          };
        });
        const mealCount = Array.isArray(entry.selectedMeals)
          ? entry.selectedMeals.filter((meal) => String(meal.mealType || '').toLowerCase() !== 'breakfast').length
          : 0;
        const calculated = calculateKitchenListEntry({
          customer: {
            ...entry,
            mealCount,
            customerName: getCustomerName(entry),
            missingSelection: !!entry._missingSelection,
            missingSelectionDate: entry._missingSelectionDate || null
          },
          selectedMeals: enrichedMeals,
          breakfastPreset,
          snackPreset
        });

        // Grouped here (once, when the memo recomputes) instead of inline in
        // JSX — the render body used to call groupMealsByDay for every
        // customer on every render, including renders triggered by state
        // changes that have nothing to do with this list (e.g. a date picker
        // elsewhere on the page), which added up fast with a large customer count.
        //
        // missingSelection alone isn't enough to decide "show the empty-state
        // card instead of their meals" — after the email-merge above, a
        // customer can be missingSelection: true (flagged for one date) while
        // still having real meals for other dates. Only show the placeholder
        // when they truly have nothing at all.
        const hasNoMealsAtAll = !calculated.selectedMeals || calculated.selectedMeals.length === 0;
        return {
          ...calculated,
          mealsByDay: groupMealsByDay(calculated.selectedMeals),
          showMissingPlaceholder: calculated.missingSelection && hasNoMealsAtAll
        };
      });
  }, [menuSelections, missingSelectionEntries, search, showOnlyMissing, breakfastPreset, snackPreset, mealTypeOverrides]);

  const persistMealTypeOverride = async ({ entry, meal, index, value }) => {
    const key = meal?._overrideKey || buildMealOverrideKey(entry, meal, index);
    const normalizedValue = String(value || '').trim().toLowerCase();

    setMealTypeOverrides((prev) => ({ ...prev, [key]: normalizedValue }));

    let updatedSelections = null;
    setMenuSelections((prev) => prev.map((row) => {
      const sameEmail = String(row?.email || '').trim().toLowerCase() === String(entry?.email || '').trim().toLowerCase();
      if (!sameEmail) return row;

      const nextMeals = (row.selectedMeals || []).map((rowMeal, rowIndex) => {
        const rowKey = rowMeal?._overrideKey || buildMealOverrideKey(row, rowMeal, rowIndex);
        if (rowKey !== key) return rowMeal;
        return { ...rowMeal, manualProteinType: normalizedValue };
      });

      updatedSelections = nextMeals;
      return { ...row, selectedMeals: nextMeals };
    }));

    if (!updatedSelections || !selectedMenuId) return;

    try {
      setSavingOverrideKey(key);
      await api.put(`/menus/${selectedMenuId}/selections/${encodeURIComponent(entry.email)}`, {
        selections: updatedSelections.map(normalizeSelectionForSave)
      });
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Failed to save meal type override');
    } finally {
      setSavingOverrideKey('');
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return 'No address on file';
    const parts = [
      addr.building,
      addr.unit ? `Unit ${addr.unit}` : null,
      addr.floor,
      addr.area,
      addr.emirate
    ].filter(Boolean);
    return parts.join(', ') || 'No address on file';
  };

  // Extracts a sortable 24h hour from labels like "By 6 AM" / "By 12:30 PM".
  // Windows that can't be parsed sort to the end.
  const parseDeliveryHour = (label) => {
    if (!label) return 999;
    const match = String(label).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!match) return 999;
    let hour = parseInt(match[1], 10);
    const meridiem = (match[3] || '').toUpperCase();
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return hour + (parseInt(match[2], 10) || 0) / 60;
  };

  // One row per MEAL (not per customer) across everyone currently loaded for
  // this menu — a customer with several meals across several days gets one
  // row each. Columns: Customer ID, Name, CPF, Date, Meal Name, then that
  // specific meal's own C/P/F/calories (the per-meal breakdown shown on its
  // card — e.g. "C 60 / P 64 / F 19" — NOT the customer's overall daily
  // target macros, and NOT the physical prep weight Kitchen Counting exports).
  // A customer with no cpf on file exports blank, not "null" — cpf is
  // sparse/optional on Customer.
  const exportCustomerMacrosToExcel = () => {
    if (customerRows.length === 0) return;
    const rows = customerRows.flatMap((entry) =>
      (entry.selectedMeals || []).map((meal) => ({
        'Customer ID': entry.customerId || '',
        Name: entry.customerName || entry.email || 'Unknown',
        CPF: entry.cpf || '',
        Date: formatDateLabel(meal?.date),
        'Meal Name': meal.mealName || meal.menuItemName || 'Unnamed meal',
        C: Math.round(Number(meal.macros?.C) || 0),
        P: Math.round(Number(meal.macros?.P) || 0),
        F: Math.round(Number(meal.macros?.F) || 0),
        Calories: Math.round(Number(meal.macros?.calories) || 0)
      }))
    );
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Macros');
    XLSX.writeFile(workbook, `kitchen-list-customer-macros-${selectedMenuId || 'export'}.xlsx`);
  };

  // Builds one jsPDF table per customer synchronously — for a date with
  // hundreds of deliveries, that used to run as one unbroken block with zero
  // feedback (no loading state at all) and no chance for the browser to
  // paint or process input in between, which is exactly the kind of
  // main-thread block that trips Chrome's hang detector on a busy day. Now
  // async: yields to the browser between each delivery-window group so a
  // large PDF builds without freezing the tab, and the button reflects
  // "Generating..." the whole time instead of the page just looking stuck.
  const downloadDayKitchenPaper = async (dateKey) => {
    if (!dateKey || generatingPdf) return;
    setGeneratingPdf(true);
    // Let React actually paint the "Generating..." button state before the
    // heavy work starts — calling straight into jsPDF from the same tick as
    // setGeneratingPdf(true) would block before that state ever reaches the screen.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const dayLabel = formatDateLabel(dateKey);
      const doc = new jsPDF();
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.text(`Kitchen Prep Sheet — ${dayLabel}`, 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
      doc.setTextColor(0);

      let cursorY = 32;

      // Group by delivery window, then sort groups early -> late and
      // customers within each group alphabetically.
      const entriesWithMeals = customerRows
        .map((entry) => ({
          entry,
          dayMeals: (entry.selectedMeals || []).filter((meal) => getDateKey(meal?.date) === dateKey)
        }))
        .filter((row) => row.dayMeals.length > 0);

      const groups = new Map();
      entriesWithMeals.forEach((row) => {
        const windowLabel = row.entry.deliveryWindow?.label || 'No delivery window';
        if (!groups.has(windowLabel)) groups.set(windowLabel, []);
        groups.get(windowLabel).push(row);
      });

      const sortedGroups = Array.from(groups.entries()).sort(
        (a, b) => parseDeliveryHour(a[0]) - parseDeliveryHour(b[0])
      );
      sortedGroups.forEach(([, rows]) => {
        rows.sort((a, b) => (a.entry.customerName || a.entry.email || '')
          .localeCompare(b.entry.customerName || b.entry.email || ''));
      });

      for (const [windowLabel, rows] of sortedGroups) {
        if (cursorY > pageHeight - 40) {
          doc.addPage();
          cursorY = 20;
        }

        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, cursorY - 5, pageWidth - 28, 8, 'F');
        doc.text(windowLabel, 16, cursorY);
        doc.setFont(undefined, 'normal');
        cursorY += 10;

        for (const { entry, dayMeals } of rows) {
          if (cursorY > pageHeight - 50) {
            doc.addPage();
            cursorY = 20;
          }

          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text(entry.customerName || entry.email || 'Unknown customer', 14, cursorY);
          doc.setFont(undefined, 'normal');
          cursorY += 6;

          doc.setFontSize(9);
          doc.text(`Address: ${formatAddress(entry.deliveryAddress)}`, 14, cursorY, { maxWidth: pageWidth - 28 });
          cursorY += 5;

          const tableRows = dayMeals.map((meal) => {
            const label = getMealLabel(meal);
            return [
              label.mealType,
              label.mealName,
              `${meal.proteinWeight || 0}g`,
              `${meal.carbWeight || 0}g`,
              `${meal.vegWeight || 0}g`
            ];
          });

          autoTable(doc, {
            startY: cursorY,
            head: [['Type', 'Meal', 'P', 'C', 'V']],
            body: tableRows,
            theme: 'grid',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [30, 41, 59] },
            margin: { left: 14, right: 14 }
          });

          cursorY = doc.lastAutoTable.finalY + 6;
          if (cursorY > pageHeight - 20) {
            doc.addPage();
            cursorY = 20;
          }

          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.text(
            `Total Macros: C ${entry.macros?.C || 0} / P ${entry.macros?.P || 0} / F ${entry.macros?.F || 0}`,
            14,
            cursorY
          );
          doc.setFont(undefined, 'normal');
          cursorY += 10;
        }

        // Yield between delivery-window groups so a busy day (many
        // customers) never blocks the main thread in one unbroken stretch.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (entriesWithMeals.length === 0) {
        doc.setFontSize(11);
        doc.text('No customers have meals selected for this date.', 14, cursorY);
      }

      doc.save(`kitchen-paper-${dateKey}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-amber-200">
                <ChefHat size={16} /> Kitchen List
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight">Breakfast and meal weights</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Select a menu below, then a date, to manage that day's meal rotation and calculate weights for each customer. Breakfast, main/sub meals, and snacks are all set up via the weekly menu upload.
              </p>
            </div>
          </div>

          {menuDateKeys.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">Day kitchen paper</label>
                <select
                  value={pdfDate}
                  onChange={(e) => setPdfDate(e.target.value)}
                  className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white [&>option]:text-slate-900"
                >
                  <option value="">Select a date...</option>
                  {menuDateKeys.map((key) => (
                    <option key={key} value={key}>{formatDateLabel(key)}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => downloadDayKitchenPaper(pdfDate)}
                disabled={!pdfDate || generatingPdf}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
              >
                <FileText size={16} className={generatingPdf ? 'animate-pulse' : ''} /> {generatingPdf ? 'Generating...' : 'Download Day PDF'}
              </button>
              <button
                type="button"
                onClick={exportCustomerMacrosToExcel}
                disabled={customerRows.length === 0}
                title="Export customer ID, name, CPF, and macros (C/P/F) for every customer currently loaded"
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
              >
                <Download size={16} /> Export Customer List (Excel)
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Menu</label>
            <div className="flex gap-3">
              <select value={selectedMenuId} onChange={(e) => setSelectedMenuId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm focus:border-slate-900 focus:outline-none">
                <option value="">Select a menu...</option>
                {menus.map((menu) => (
                  <option key={menu._id} value={menu._id}>{menu.title || menu.name || 'Untitled menu'}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  nutritionCacheRef.current.clear();
                  loadSelections();
                }}
                title="Reload selections and re-fetch nutrition data from the website"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={16} className={loadingSelections ? 'animate-spin' : ''} />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{importName ? `Breakfast import: ${importName}` : 'No breakfast import loaded yet'}</p>
            <p className="mt-1 text-xs text-slate-500">
              Breakfast presets are saved once and shared across all menus. You do not need to reupload for each menu.
            </p>
            {Object.keys(breakfastPreset?.presetsByName || {}).length > 0 && (
              <p className="mt-1 text-xs text-emerald-700">
                Loaded breakfast names: {Object.keys(breakfastPreset.presetsByName).length}
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Customer or email" className="w-full rounded-xl border border-slate-300 py-3 pl-9 pr-3 text-sm" />
            </div>
          </div>
        </div>

        {menuDateKeys.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Missing Meal Selections</h3>
            <p className="text-xs text-slate-400 mb-3">
              Checks every active, non-cycle-ended website subscription's delivery schedule for the chosen date —
              this fetches full subscription details for hundreds of customers, so it can take 10–30 seconds.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
                <select
                  value={missingCheckDate}
                  onChange={(e) => setMissingCheckDate(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a date...</option>
                  {menuDateKeys.map((key) => (
                    <option key={key} value={key}>{formatDateLabel(key)}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => checkMissingSelections(missingCheckDate)}
                disabled={checkingMissing || !missingCheckDate}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <Search size={14} className={checkingMissing ? 'animate-pulse' : ''} />
                {checkingMissing ? 'Checking...' : 'Check Missing Selections'}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOnlyMissing}
                  onChange={(e) => setShowOnlyMissing(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                Show only missing
              </label>
            </div>
            {missingSelectionEntries.length > 0 && (
              <p className="mt-2 text-xs text-amber-600">
                {missingSelectionEntries.length} customer(s) have a delivery scheduled on {formatDateLabel(missingCheckDate)} but no meal selection yet.
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Main Meal Rotation — {formatDateLabel(missingCheckDate)}
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadWeeklyMenuTemplate}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Download size={12} /> Template
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    <Upload size={12} className={uploadingWeeklyMenu ? 'animate-pulse' : ''} />
                    {uploadingWeeklyMenu ? 'Uploading...' : 'Upload Weekly Menu'}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleWeeklyMenuUpload}
                      disabled={uploadingWeeklyMenu}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mb-1">
                Up to 3 main meals per date, cycled in order (not random) as customers are assigned. If a customer's exclusions rule out all 3, a sub meal is used instead.
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Upload sets the whole week at once from a spreadsheet with columns: Date, Slot (main/sub/snack/breakfast), MealName, Type (chicken/beef/fish — main/sub only), Exclusions, C, P, F (snack/breakfast macros) — download the template for the exact format. This replaces each uploaded date's existing main/sub and snack options, and updates the shared breakfast presets by name.
              </p>
              {weeklyMenuUploadName && weeklyMenuUploadResult && (
                <p className="text-[11px] text-emerald-700 mb-3">
                  Loaded {weeklyMenuUploadResult.mainDays} main/sub day(s), {weeklyMenuUploadResult.snackDays} snack day(s), and {weeklyMenuUploadResult.breakfastDays} breakfast day(s) from {weeklyMenuUploadName}
                  {weeklyMenuUploadResult.uploadedDates?.length > 0 && ` — showing ${formatDateLabel(weeklyMenuUploadResult.uploadedDates[0])} below (switch the Date above to see the other uploaded day(s): ${weeklyMenuUploadResult.uploadedDates.map(formatDateLabel).join(', ')})`}.
                  {weeklyMenuUploadResult.skipped > 0 && ` ${weeklyMenuUploadResult.skipped} row(s) skipped — missing date/name, or an invalid type (chicken/beef/fish) for a main/sub row.`}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Main Meals ({(mainMealOptionsByDate[missingCheckDate]?.mainMeals || []).length}/3)
                  </p>
                  <div className="space-y-2 mb-2">
                    {(mainMealOptionsByDate[missingCheckDate]?.mainMeals || []).map((meal, index) => (
                      <div key={`main-${meal.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-800">{index + 1}. {meal.name}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 capitalize">{meal.type}</span>
                          {meal.exclusions?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {meal.exclusions.map((ex) => (
                                <span key={ex} className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{ex}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => removeMainMeal(index)} className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Sub Meals (fallback)</p>
                  <div className="space-y-2 mb-2">
                    {(mainMealOptionsByDate[missingCheckDate]?.subMeals || []).map((meal, index) => (
                      <div key={`sub-${meal.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-800">{meal.name}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 capitalize">{meal.type}</span>
                          {meal.exclusions?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {meal.exclusions.map((ex) => (
                                <span key={ex} className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{ex}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => removeSubMeal(index)} className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Breakfast — {formatDateLabel(missingCheckDate)}
                  </p>
                  <p className="text-[10px] text-slate-400 mb-2">
                    Only assigned to customers whose profile has "Breakfast Include" on — it replaces one of their main meal slots.
                  </p>
                  <div className="space-y-2 mb-2">
                    {(breakfastOptionsByDate[missingCheckDate] || []).length === 0 && (
                      <p className="text-sm text-slate-400">No breakfast options uploaded for this date.</p>
                    )}
                    {(breakfastOptionsByDate[missingCheckDate] || []).map((item, index) => (
                      <div key={`breakfast-${item.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-800">{item.name}</span>
                          {item.exclusions?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.exclusions.map((ex) => (
                                <span key={ex} className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{ex}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => removeBreakfastOption(index)} className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Matter Core Meals — {formatDateLabel(missingCheckDate)}
                  </p>
                  <p className="text-[10px] text-slate-400 mb-2">
                    For customers on the "Matter Core" plan only. No type or exclusion filtering — a customer needing
                    2 meals gets the 1st and 2nd meal below, in order. Their breakfast/snacks still use the 1st
                    breakfast option and 1st snack in each pool (never random) instead of these.
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={matterCoreMealInput}
                      onChange={(e) => setMatterCoreMealInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMatterCoreMeal(); } }}
                      placeholder="Meal name"
                      disabled={!missingCheckDate || savingMatterCoreMealOptions}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={addMatterCoreMeal}
                      disabled={!missingCheckDate || !matterCoreMealInput.trim() || savingMatterCoreMealOptions}
                      className="flex-shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-2 mb-2">
                    {(matterCoreMealOptionsByDate[missingCheckDate] || []).length === 0 && (
                      <p className="text-sm text-slate-400">No Matter Core meals added for this date.</p>
                    )}
                    {(matterCoreMealOptionsByDate[missingCheckDate] || []).map((meal, index) => (
                      <div key={`matter-core-${meal.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <span className="font-medium text-slate-800">{index + 1}. {meal.name}</span>
                        <button type="button" onClick={() => removeMatterCoreMeal(index)} className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Snack Rotation — {formatDateLabel(missingCheckDate)}
              </h4>
              <p className="text-[11px] text-slate-400 mb-3">
                The lists below are for the date selected above — add snack ingredients for any date via the weekly menu upload (Slot = snack1/snack2).
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                {['first', 'second'].map((pool) => (
                  <div key={pool}>
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      {pool === 'first' ? 'First Snack' : 'Second Snack'}
                    </p>
                    <div className="space-y-2 mb-2">
                      {(snackOptionsByDate[missingCheckDate]?.[pool] || []).length === 0 ? (
                        <p className="text-sm text-slate-400">No {pool === 'first' ? 'first' : 'second'} snack options uploaded for this date.</p>
                      ) : (
                        (snackOptionsByDate[missingCheckDate]?.[pool] || []).map((opt, index) => (
                          <div key={`${pool}-${opt.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <span className="font-medium text-slate-800">{opt.name}</span>
                              {opt.exclusions?.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {opt.exclusions.map((ex) => (
                                    <span key={ex} className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{ex}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                              <span>C {opt.C}</span>
                              <span>P {opt.P}</span>
                              <span>F {opt.F}</span>
                              <button type="button" onClick={() => removeSnackOption(pool, index)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Snack Macros (PCF)
              </h4>
              <p className="text-[11px] text-slate-400 mb-3">
                Global, not tied to a date or menu — each snack's own fixed macros, used directly (never divided by
                snacksPerDay) whenever that name is assigned to a customer. Falls back to the per-date Snack Rotation
                option's own C/P/F above when a name here doesn't match.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <input
                  type="text"
                  value={snackPresetForm.name}
                  onChange={(e) => setSnackPresetForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Snack name"
                  className="flex-1 min-w-[140px] rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <input
                  type="number"
                  value={snackPresetForm.C}
                  onChange={(e) => setSnackPresetForm((f) => ({ ...f, C: e.target.value }))}
                  placeholder="C"
                  className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <input
                  type="number"
                  value={snackPresetForm.P}
                  onChange={(e) => setSnackPresetForm((f) => ({ ...f, P: e.target.value }))}
                  placeholder="P"
                  className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <input
                  type="number"
                  value={snackPresetForm.F}
                  onChange={(e) => setSnackPresetForm((f) => ({ ...f, F: e.target.value }))}
                  placeholder="F"
                  className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addSnackPreset}
                  disabled={!snackPresetForm.name.trim() || savingSnackPreset}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {Object.keys(snackPreset.presetsByName || {}).length === 0 && (
                  <p className="text-sm text-slate-400">No snack macros uploaded yet.</p>
                )}
                {Object.entries(snackPreset.presetsByName || {}).map(([key, preset]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-800">{preset.snackName}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                      <span>C {preset.C}</span>
                      <span>P {preset.P}</span>
                      <span>F {preset.F}</span>
                      <button type="button" onClick={() => removeSnackPreset(key)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={runAutoAssign}
                disabled={assigningAll || missingSelectionEntries.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <Shuffle size={14} className={assigningAll ? 'animate-spin' : ''} />
                {assigningAll ? 'Assigning...' : 'Auto-Assign'}
              </button>
              <p className="mt-1 text-[11px] text-slate-400">
                Fills main meals, breakfast (if the customer's profile has Breakfast Include on), and their full snack count — for every customer flagged missing on {formatDateLabel(missingCheckDate)} above. Everything stays within each option's own exclusion list.
              </p>
              {missingSelectionEntries.length === 0 && (
                <p className="mt-1 text-[11px] text-slate-400">Run "Check Missing Selections" above first to load the customer list to assign.</p>
              )}

              {autoAssignResult && (
                <div className="mt-2 text-xs space-y-1">
                  {autoAssignResult.mainMeals && (
                    <p className="text-emerald-700">
                      Meals: assigned {autoAssignResult.mainMeals.assigned} main meal slot(s) and {autoAssignResult.mainMeals.assignedBreakfast || 0} breakfast(s) across {autoAssignResult.mainMeals.customersProcessed} customer(s).
                      {autoAssignResult.mainMeals.skippedNoOption > 0 && ` ${autoAssignResult.mainMeals.skippedNoOption} slot(s) skipped — no eligible meal found (check main + sub meal exclusions).`}
                      {autoAssignResult.mainMeals.skippedBreakfastNoOption > 0 && ` ${autoAssignResult.mainMeals.skippedBreakfastNoOption} breakfast(s) skipped — no eligible breakfast option (check exclusions).`}
                      {autoAssignResult.mainMeals.skippedAlreadyAssigned > 0 && ` ${autoAssignResult.mainMeals.skippedAlreadyAssigned} customer(s) already had enough main meals.`}
                    </p>
                  )}
                  {autoAssignResult.snacks && (
                    <p className={autoAssignResult.snacks.assigned > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                      Snacks: assigned {autoAssignResult.snacks.assigned} snack slot(s) across {autoAssignResult.snacks.customersProcessed} customer(s) checked.
                      {autoAssignResult.snacks.skippedNoSnacksNeeded > 0 && ` ${autoAssignResult.snacks.skippedNoSnacksNeeded} customer(s) skipped — no snacks in their website subscription.`}
                      {autoAssignResult.snacks.skippedNoOptions > 0 && ` ${autoAssignResult.snacks.skippedNoOptions} slot(s) skipped — no eligible snack options for this date.`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {(loadingMenus || loadingSelections) && (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-6 text-slate-600 shadow-sm ring-1 ring-slate-200">
            <Loader className="animate-spin" size={18} /> Loading kitchen list...
          </div>
        )}

        <div className="space-y-4">
          {customerRows.map((entry) => (
            <div
              key={`${entry.email || entry.customerId}`}
              className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ${entry.missingSelection ? 'ring-amber-300' : 'ring-slate-200'}`}
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">{entry.customerName || entry.email || 'Unknown customer'}</h2>
                    {entry.planName && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {entry.planName}
                      </span>
                    )}
                    {entry.missingSelection && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        No Meal Selection — {formatDateLabel(entry.missingSelectionDate)}
                      </span>
                    )}
                    {entry.hasMacroShortfall && (
                      <span
                        title="Even with a large breakfast, at least one day's meals hit the 65g protein / 75g carb per-meal cap and couldn't reach this customer's full daily macro target."
                        className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700"
                      >
                        Macro Shortfall
                      </span>
                    )}
                    {entry.hasMatterCoreLookupIssue && (
                      <span
                        title="This customer's per-meal carb/protein weight (total weight ÷ meals that day) doesn't match a known Matter Core weight-to-macro combination — at least one meal was left at 0 macros and needs a manual fix."
                        className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700"
                      >
                        Matter Core Lookup Missing
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{entry.email || 'No email'} • {entry.mealCount} meal(s)</p>
                  {entry.dietaryRestrictions?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dietary:</span>
                      {entry.dietaryRestrictions.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                {!entry.showMissingPlaceholder && (
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                    <Stat label="Total weight" value={`${entry.totalWeight || 0} g`} />
                    <Stat label="Breakfast" value={`${entry.breakfastPreset?.V || 0} g`} />
                    <Stat label="Macros" value={`C ${entry.macros?.C || 0} / P ${entry.macros?.P || 0} / F ${entry.macros?.F || 0}`} />
                    <Stat label="Calories" value={`${entry.totalCalories || 0}`} />
                    <Stat label="Snacks/Day" value={entry.snacksPerDay ?? '—'} />
                  </div>
                )}
              </div>
              {entry.showMissingPlaceholder ? (
                <div className="p-5">
                  <p className="text-sm text-amber-700">
                    This customer has a delivery scheduled on {formatDateLabel(entry.missingSelectionDate)} but hasn't selected any meals yet.
                  </p>
                </div>
              ) : (
              <div className="space-y-5 p-5">
                {entry.missingSelection && (
                  <p className="text-sm text-amber-700">
                    Also has a delivery scheduled on {formatDateLabel(entry.missingSelectionDate)} with no meal selected yet.
                  </p>
                )}
                {(entry.mealsByDay || []).map((dayGroup) => (
                  <div key={`${entry.email || entry.customerId}-${dayGroup.dateKey}`} className="space-y-3">
                    <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {dayGroup.dateLabel}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {dayGroup.meals.map((meal, index) => (
                        <div key={`${entry.email}-${dayGroup.dateKey}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <UtensilsCrossed size={16} className="text-amber-600" />
                              <span className="text-sm font-semibold text-slate-900">{getMealLabel(meal).mealType}</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">#{index + 1}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                            <span className="truncate">{getMealLabel(meal).mealName}</span>
                            {meal?.isAutoAssigned && (
                              <span
                                title="Filled in by kitchen auto-assign — not chosen by the customer, and never shown in their menu selection preview"
                                className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                              >
                                Auto
                              </span>
                            )}
                            {meal?.flags?.macroCapped && (
                              <span
                                title="This meal's protein/carbs hit the 65g protein / 75g carb per-meal cap and was held there instead of following its full proportional share"
                                className="flex-shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
                              >
                                Capped
                              </span>
                            )}
                            {meal?.flags?.autoUpgradedToLarge && (
                              <span
                                title="Auto-upgraded to a large breakfast (fixed at 150g protein / 200g carb / 0g fat) to make up for other meals hitting the per-meal cap"
                                className="flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700"
                              >
                                Large
                              </span>
                            )}
                          </div>
                          {String(meal?.mealType || '').toLowerCase() !== 'breakfast' && (
                            <div className="mt-2">
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Protein Type</label>
                              <select
                                value={meal.manualProteinType || ''}
                                onChange={(e) => persistMealTypeOverride({ entry, meal, index, value: e.target.value })}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                              >
                                <option value="">Auto detect (from meal name)</option>
                                <option value="chicken">Chicken</option>
                                <option value="beef">Beef</option>
                                <option value="fish">Fish</option>
                              </select>
                              <p className="mt-1 text-[11px] text-slate-500">
                                Auto detect looks for keywords in meal name/protein choice: chicken, beef, fish.
                              </p>
                              {(!meal.manualProteinType || meal.manualProteinType === '') && (
                                <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                  Detected type: {detectProteinType(meal)}
                                </p>
                              )}
                              {savingOverrideKey === (meal?._overrideKey || buildMealOverrideKey(entry, meal, index)) && (
                                <p className="mt-1 text-xs text-slate-500">Saving...</p>
                              )}
                            </div>
                          )}
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <Tiny label="C" value={meal.macros?.C ?? 0} />
                            <Tiny label="P" value={meal.macros?.P ?? 0} />
                            <Tiny label="F" value={meal.macros?.F ?? 0} />
                          </div>
                          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                            <span>Weight</span>
                            <span className="font-semibold text-slate-900">{meal.weight || 0} g</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <Tiny label="P" value={`${meal.proteinWeight || 0}g`} />
                            <Tiny label="C" value={`${meal.carbWeight || 0}g`} />
                            <Tiny label="V" value={`${meal.vegWeight || 0}g`} />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-sm text-slate-600">
                            <span>Calories</span>
                            <span className="font-semibold text-slate-900">{meal.macros?.calories || 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          ))}
        </div>

        {!loadingMenus && !loadingSelections && customerRows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">
            No customer selections found for this menu.
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-2xl bg-slate-50 px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
  </div>
);

const Tiny = ({ label, value }) => (
  <div className="rounded-xl bg-white px-2 py-2 text-center ring-1 ring-slate-200">
    <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    <div className="text-sm font-semibold text-slate-800">{value}</div>
  </div>
);

export default KitchenList;
