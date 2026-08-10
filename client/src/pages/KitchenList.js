import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Upload, Download, RefreshCw, Search, Loader, UtensilsCrossed, ChefHat, Plus, Trash2, Shuffle, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../utils/api';
import { calculateKitchenListEntry } from '../utils/kitchenListCalculations';

const emptyBreakfast = { breakfastName: '', C: '', P: '', F: '', V: '', isLargeBreakfast: false, presetsByName: {} };
const BREAKFAST_PRESET_STORAGE_KEY = 'kitchenBreakfastPresetsGlobal';

const normalizeBreakfastKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeBreakfastPresetEntry = (raw = {}) => ({
  breakfastName: String(raw.breakfastName || '').trim(),
  C: Number(raw.C ?? raw.carbs ?? 0) || 0,
  P: Number(raw.P ?? raw.protein ?? 0) || 0,
  F: Number(raw.F ?? raw.fats ?? 0) || 0,
  V: Number(raw.V ?? raw.vegWeight ?? 80) || 80,
  isLargeBreakfast: !!raw.isLargeBreakfast
});

const normalizeBreakfastMap = (rawMap) => {
  const entries = rawMap instanceof Map ? Array.from(rawMap.entries()) : Object.entries(rawMap || {});
  return entries.reduce((acc, [rawKey, rawValue]) => {
    const key = normalizeBreakfastKey(rawKey);
    if (!key) return acc;
    acc[key] = normalizeBreakfastPresetEntry(rawValue || {});
    return acc;
  }, {});
};

const toBreakfastPresetState = (payload = {}) => {
  const preset = normalizeBreakfastPresetEntry(payload?.breakfastPreset || payload?.breakfastMacros || {});
  const presetsByName = normalizeBreakfastMap(payload?.presetsByName || payload?.breakfastPresetsByName);
  return {
    breakfastName: preset.breakfastName || '',
    C: preset.C ?? '',
    P: preset.P ?? '',
    F: preset.F ?? '',
    V: preset.V ?? 80,
    isLargeBreakfast: !!preset.isLargeBreakfast,
    presetsByName
  };
};

const loadBreakfastPresetFromStorage = () => {
  if (typeof window === 'undefined') return emptyBreakfast;

  try {
    const raw = window.localStorage.getItem(BREAKFAST_PRESET_STORAGE_KEY);
    if (!raw) return emptyBreakfast;
    const parsed = JSON.parse(raw);
    return toBreakfastPresetState(parsed || {});
  } catch {
    return emptyBreakfast;
  }
};

const saveBreakfastPresetToStorage = (state) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(BREAKFAST_PRESET_STORAGE_KEY, JSON.stringify({
      breakfastPreset: {
        breakfastName: state?.breakfastName || '',
        C: Number(state?.C) || 0,
        P: Number(state?.P) || 0,
        F: Number(state?.F) || 0,
        V: Number(state?.V) || 80,
        isLargeBreakfast: !!state?.isLargeBreakfast
      },
      presetsByName: state?.presetsByName || {}
    }));
  } catch {
    // Ignore storage failures; server persistence still remains the primary path.
  }
};

const isRouteNotFound = (err) => {
  const status = err?.response?.status;
  const message = String(err?.response?.data?.message || '').toLowerCase();
  return (
    (status === 404 && message.includes('route') && message.includes('not found'))
    || (message.includes('cast to objectid failed') && message.includes('kitchen-breakfast-presets'))
  );
};

const getCustomerName = (entry) => {
  const first = String(entry?.firstName || '').trim();
  const last = String(entry?.lastName || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return combined || String(entry?.customerName || entry?.email || '').trim();
};

const hasNonZeroMacros = (raw) => {
  const source = raw?.total ? raw.total : raw;
  const c = Number(source?.C) || 0;
  const p = Number(source?.P) || 0;
  const f = Number(source?.F) || 0;
  return c > 0 || p > 0 || f > 0;
};

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

const getDateKey = (value) => {
  if (!value) return 'unknown-date';

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateLabel = (value) => {
  if (!value) return 'Unknown Day';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
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
  vegConflict: meal?.vegConflict
});

const KitchenList = () => {
  const [menus, setMenus] = useState([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [menuSelections, setMenuSelections] = useState([]);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [loadingSelections, setLoadingSelections] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [breakfastPreset, setBreakfastPreset] = useState(emptyBreakfast);
  const [importName, setImportName] = useState('');
  const [mealTypeOverrides, setMealTypeOverrides] = useState({});
  const [savingOverrideKey, setSavingOverrideKey] = useState('');
  const [savingBreakfastImport, setSavingBreakfastImport] = useState(false);
  const [snackOptionsByDate, setSnackOptionsByDate] = useState({});
  const [snackDate, setSnackDate] = useState('');
  const [pdfDate, setPdfDate] = useState('');
  const [missingSelectionEntries, setMissingSelectionEntries] = useState([]);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [missingCheckDate, setMissingCheckDate] = useState('');
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [mainMealOptionsByDate, setMainMealOptionsByDate] = useState({});
  const [newMainMealName, setNewMainMealName] = useState('');
  const [newMainMealType, setNewMainMealType] = useState('chicken');
  const [newMainMealExclusions, setNewMainMealExclusions] = useState('');
  const [newSubMealName, setNewSubMealName] = useState('');
  const [newSubMealType, setNewSubMealType] = useState('chicken');
  const [newSubMealExclusions, setNewSubMealExclusions] = useState('');
  const [savingMainMealOptions, setSavingMainMealOptions] = useState(false);
  const [assigningMainMeals, setAssigningMainMeals] = useState(false);
  const [mainMealAssignResult, setMainMealAssignResult] = useState(null);
  const [newSnackName, setNewSnackName] = useState('');
  const [newSnackExclusions, setNewSnackExclusions] = useState('');
  const [newSnackC, setNewSnackC] = useState('');
  const [newSnackP, setNewSnackP] = useState('');
  const [newSnackF, setNewSnackF] = useState('');
  const [savingSnackOptions, setSavingSnackOptions] = useState(false);
  const [assigningSnacks, setAssigningSnacks] = useState(false);
  const [snackAssignResult, setSnackAssignResult] = useState(null);

  useEffect(() => {
    const loadMenus = async () => {
      try {
        setLoadingMenus(true);
        const response = await api.get('/menus?isActive=all&limit=100');
        if (response.data?.success) {
          const menuRows = response.data.data || [];
          setMenus(menuRows);
          if (menuRows[0]?._id) setSelectedMenuId(menuRows[0]._id);
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

  const loadSelections = useCallback(async () => {
    if (!selectedMenuId) return [];

    try {
        setLoadingSelections(true);
        setError('');
        setMissingSelectionEntries([]);
        const response = await api.get(`/menus/${selectedMenuId}/selections`);

        let breakfastState = emptyBreakfast;
        try {
          const breakfastResponse = await api.get('/menus/kitchen-breakfast-presets');
          if (breakfastResponse.data?.success) {
            breakfastState = toBreakfastPresetState(breakfastResponse.data?.data || {});
          }
        } catch (presetError) {
          if (!isRouteNotFound(presetError)) {
            throw presetError;
          }

          try {
            const menuBreakfastResponse = await api.get(`/menus/${selectedMenuId}/breakfast-presets`);
            if (menuBreakfastResponse.data?.success) {
              breakfastState = toBreakfastPresetState(menuBreakfastResponse.data?.data || {});
            }
          } catch (menuPresetError) {
            if (!isRouteNotFound(menuPresetError)) {
              throw menuPresetError;
            }

            // Final backward compatibility: use the generic menu endpoint.
            const menuResponse = await api.get(`/menus/${selectedMenuId}`);
            if (menuResponse.data?.success) {
              breakfastState = toBreakfastPresetState(menuResponse.data?.data || {});
            }
          }
        }

        const storedBreakfastState = loadBreakfastPresetFromStorage();
        if (Object.keys(breakfastState.presetsByName || {}).length === 0 && Object.keys(storedBreakfastState.presetsByName || {}).length > 0) {
          breakfastState = storedBreakfastState;
        }

        setBreakfastPreset(breakfastState);
        if (Object.keys(breakfastState.presetsByName || {}).length > 0) {
          saveBreakfastPresetToStorage(breakfastState);
        }
        setImportName(Object.keys(breakfastState.presetsByName || {}).length > 0 ? 'Loaded from server' : '');

        if (response.data?.success) {
          const rawSelections = response.data.data || [];

          // Macros, snacks/day, and plan name always come from the customer's website
          // subscription (Matter API), never from the internal Customer page — even
          // when the Customer page already has values.
          const enrichedSelections = await Promise.all(rawSelections.map(async (entry) => {
            const email = String(entry?.email || '').trim();
            if (!email) {
              return entry;
            }

            try {
              const nutritionResponse = await api.get('/matter/subscriptions/nutrition-by-email', {
                params: { email }
              });
              const nutrition = nutritionResponse.data?.data;
              const websiteMacros = nutrition?.macros
                ? { C: nutrition.macros.carbohydrates || 0, P: nutrition.macros.protein || 0, F: nutrition.macros.fat || 0 }
                : null;

              return {
                ...entry,
                targetMacros: hasNonZeroMacros(websiteMacros) ? websiteMacros : entry?.targetMacros,
                customerMacros: hasNonZeroMacros(websiteMacros) ? websiteMacros : entry?.customerMacros,
                snacksPerDay: nutrition?.snacks_per_day ?? null,
                planName: nutrition?.plan_name ?? null,
                deliveryAddress: nutrition?.customer_addresses?.[0] || null,
                deliveryWindow: nutrition?.delivery_window || null
              };
            } catch (nutritionError) {
              return entry;
            }
          }));

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
  }, [selectedMenuId]);

  useEffect(() => { loadSelections(); }, [loadSelections]);

  const loadSnackOptions = useCallback(async () => {
    if (!selectedMenuId) {
      setSnackOptionsByDate({});
      return;
    }
    try {
      const res = await api.get(`/menus/${selectedMenuId}/snack-options`);
      setSnackOptionsByDate(res.data?.data || {});
    } catch (err) {
      setSnackOptionsByDate({});
    }
  }, [selectedMenuId]);

  useEffect(() => { loadSnackOptions(); }, [loadSnackOptions]);

  const loadMainMealOptions = useCallback(async () => {
    if (!selectedMenuId) {
      setMainMealOptionsByDate({});
      return;
    }
    try {
      const res = await api.get(`/menus/${selectedMenuId}/main-meal-options`);
      setMainMealOptionsByDate(res.data?.data || {});
    } catch (err) {
      setMainMealOptionsByDate({});
    }
  }, [selectedMenuId]);

  useEffect(() => { loadMainMealOptions(); }, [loadMainMealOptions]);

  const menuDateKeys = useMemo(() => {
    const keys = new Set();
    menuSelections.forEach((entry) => (entry.selectedMeals || []).forEach((m) => {
      const key = getDateKey(m?.date);
      if (key && key !== 'unknown-date') keys.add(key);
    }));
    return Array.from(keys).sort();
  }, [menuSelections]);

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
      const coveredEmails = new Set();
      (selectionsOverride || menuSelections).forEach((entry) => {
        const hasSelectionThatDay = (entry.selectedMeals || []).some((m) => getDateKey(m?.date) === dateKey);
        if (hasSelectionThatDay) coveredEmails.add(String(entry.email || '').trim().toLowerCase());
      });

      const missing = subs
        .filter((sub) => !coveredEmails.has(String(sub.email || '').trim().toLowerCase()))
        .map((sub) => ({
          customerId: String(sub.customer_id ?? sub.subscription_id),
          customerName: sub.name,
          firstName: sub.name,
          lastName: '',
          email: sub.email || '',
          selectedMeals: [],
          _missingSelection: true,
          _missingSelectionDate: dateKey,
          _mealFrequency: sub.meal_frequency,
          _exclusions: sub.exclusions || []
        }));

      setMissingSelectionEntries(missing);
      setMainMealAssignResult(null);
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

  const addMainMeal = () => {
    const name = newMainMealName.trim();
    if (!name || !missingCheckDate) return;
    const current = mainMealOptionsByDate[missingCheckDate] || { mainMeals: [], subMeals: [] };
    if ((current.mainMeals || []).length >= 3) {
      setError('Only 3 main meals are allowed per date — remove one first.');
      return;
    }
    const exclusions = newMainMealExclusions.split(',').map((e) => e.trim()).filter(Boolean);
    const updatedMainMeals = [...(current.mainMeals || []), { name, type: newMainMealType, exclusions }];
    saveMainMealOptionsForDate(missingCheckDate, updatedMainMeals, current.subMeals || []);
    setNewMainMealName('');
    setNewMainMealExclusions('');
  };

  const removeMainMeal = (index) => {
    const current = mainMealOptionsByDate[missingCheckDate] || { mainMeals: [], subMeals: [] };
    const updatedMainMeals = (current.mainMeals || []).filter((_, i) => i !== index);
    saveMainMealOptionsForDate(missingCheckDate, updatedMainMeals, current.subMeals || []);
  };

  const addSubMeal = () => {
    const name = newSubMealName.trim();
    if (!name || !missingCheckDate) return;
    const current = mainMealOptionsByDate[missingCheckDate] || { mainMeals: [], subMeals: [] };
    const exclusions = newSubMealExclusions.split(',').map((e) => e.trim()).filter(Boolean);
    const updatedSubMeals = [...(current.subMeals || []), { name, type: newSubMealType, exclusions }];
    saveMainMealOptionsForDate(missingCheckDate, current.mainMeals || [], updatedSubMeals);
    setNewSubMealName('');
    setNewSubMealExclusions('');
  };

  const removeSubMeal = (index) => {
    const current = mainMealOptionsByDate[missingCheckDate] || { mainMeals: [], subMeals: [] };
    const updatedSubMeals = (current.subMeals || []).filter((_, i) => i !== index);
    saveMainMealOptionsForDate(missingCheckDate, current.mainMeals || [], updatedSubMeals);
  };

  const runAssignMainMeals = async () => {
    if (!selectedMenuId || !missingCheckDate) return;
    if (missingSelectionEntries.length === 0) {
      setError('Run "Check Missing Selections" for this date first.');
      return;
    }
    setAssigningMainMeals(true);
    setError('');
    try {
      const res = await api.post(`/menus/${selectedMenuId}/assign-main-meals`, {
        date: missingCheckDate,
        customers: missingSelectionEntries.map((entry) => ({
          email: entry.email,
          name: entry.customerName,
          customerId: entry.customerId,
          mealFrequency: entry._mealFrequency,
          exclusions: entry._exclusions
        }))
      });
      setMainMealAssignResult(res.data?.data || null);
      const freshSelections = await loadSelections();
      await checkMissingSelections(missingCheckDate, freshSelections);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign main meals');
    } finally {
      setAssigningMainMeals(false);
    }
  };

  useEffect(() => {
    if (!snackDate && menuDateKeys.length > 0) {
      setSnackDate(menuDateKeys[0]);
    }
    if (!pdfDate && menuDateKeys.length > 0) {
      setPdfDate(menuDateKeys[0]);
    }
    if (!missingCheckDate && menuDateKeys.length > 0) {
      setMissingCheckDate(menuDateKeys[0]);
    }
  }, [menuDateKeys, snackDate, pdfDate, missingCheckDate]);

  const saveSnackOptionsForDate = async (date, options) => {
    if (!selectedMenuId || !date) return;
    setSavingSnackOptions(true);
    try {
      const res = await api.put(`/menus/${selectedMenuId}/snack-options`, { date, options });
      setSnackOptionsByDate(res.data?.data || {});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save snack options');
    } finally {
      setSavingSnackOptions(false);
    }
  };

  const addSnackOption = () => {
    const name = newSnackName.trim();
    if (!name || !snackDate) return;
    const exclusions = newSnackExclusions.split(',').map((e) => e.trim()).filter(Boolean);
    const current = snackOptionsByDate[snackDate] || [];
    const updated = [...current, {
      name,
      exclusions,
      C: Number(newSnackC) || 0,
      P: Number(newSnackP) || 0,
      F: Number(newSnackF) || 0
    }];
    saveSnackOptionsForDate(snackDate, updated);
    setNewSnackName('');
    setNewSnackExclusions('');
    setNewSnackC('');
    setNewSnackP('');
    setNewSnackF('');
  };

  const removeSnackOption = (index) => {
    const current = snackOptionsByDate[snackDate] || [];
    const updated = current.filter((_, i) => i !== index);
    saveSnackOptionsForDate(snackDate, updated);
  };

  const runAssignSnacks = async () => {
    if (!selectedMenuId) return;
    setAssigningSnacks(true);
    setSnackAssignResult(null);
    try {
      const res = await api.post(`/menus/${selectedMenuId}/assign-snacks`);
      setSnackAssignResult(res.data?.data || null);
      await loadSelections();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign snacks');
    } finally {
      setAssigningSnacks(false);
    }
  };

  const customerRows = useMemo(() => {
    const combinedEntries = [...menuSelections, ...missingSelectionEntries];
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
        return calculateKitchenListEntry({
          customer: {
            ...entry,
            mealCount,
            customerName: getCustomerName(entry),
            missingSelection: !!entry._missingSelection,
            missingSelectionDate: entry._missingSelectionDate || null
          },
          selectedMeals: enrichedMeals,
          breakfastPreset
        });
      });
  }, [menuSelections, missingSelectionEntries, search, showOnlyMissing, breakfastPreset, mealTypeOverrides]);

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

  const exportWorkbook = () => {
    const rows = customerRows.flatMap((entry) =>
      (entry.selectedMeals || []).map((meal) => ({
        customer: entry.customerName || entry.email || 'Unknown',
        email: entry.email || '',
        category: meal.category,
        mealName: meal.mealName || '',
        carbs: meal.macros?.C ?? '',
        protein: meal.macros?.P ?? '',
        fats: meal.macros?.F ?? '',
        weight: meal.weight ?? '',
        calories: meal.macros?.calories ?? ''
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kitchen List');
    XLSX.writeFile(workbook, 'kitchen-list.xlsx');
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

  const downloadDayKitchenPaper = (dateKey) => {
    if (!dateKey) return;
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

    sortedGroups.forEach(([windowLabel, rows]) => {
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

      rows.forEach(({ entry, dayMeals }) => {
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
      });
    });

    if (entriesWithMeals.length === 0) {
      doc.setFontSize(11);
      doc.text('No customers have meals selected for this date.', 14, cursorY);
    }

    doc.save(`kitchen-paper-${dateKey}.pdf`);
  };

  const downloadBreakfastTemplate = () => {
    const rows = [
      { BreakfastName: 'Egg White Wrap', C: 30, P: 30, F: 10, LargeBreakfast: false },
      { BreakfastName: 'Overnight Oats', C: 42, P: 28, F: 12, LargeBreakfast: false }
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Breakfast Preset');
    XLSX.writeFile(workbook, 'breakfast-import-template.xlsx');
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
                Import breakfast preset macros, then calculate the remaining meal weights for each customer on the selected menu.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
                <Upload size={16} /> Import breakfast CSV/Excel
                <input type="file" accept=".csv,.xlsx,.xls" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    setSavingBreakfastImport(true);
                    const buffer = await file.arrayBuffer();
                    const workbook = XLSX.read(buffer, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    const parsedRows = rows
                      .map((row) => {
                        const breakfastName = String(
                          row.BreakfastName
                          ?? row.Breakfast
                          ?? row.Name
                          ?? row.breakfastName
                          ?? row.breakfast
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
                      })
                      .filter((row) => row.breakfastName || row.C || row.P || row.F);

                    if (parsedRows.length === 0) {
                      setError('No valid breakfast rows found in the imported file');
                      return;
                    }

                    const firstRow = parsedRows[0] || {};
                    const presetsByName = parsedRows.reduce((acc, row) => {
                      const key = normalizeBreakfastKey(row.breakfastName);
                      if (!key) return acc;
                      acc[key] = {
                        C: row.C,
                        P: row.P,
                        F: row.F,
                        V: row.V,
                        isLargeBreakfast: !!row.isLargeBreakfast
                      };
                      return acc;
                    }, {});

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
                      if (!isRouteNotFound(saveError)) {
                        throw saveError;
                      }

                      try {
                        await api.put(`/menus/${selectedMenuId}/breakfast-presets`, {
                          presets: parsedRows,
                          defaultPreset: firstRow
                        });
                      } catch (menuSaveError) {
                        if (!isRouteNotFound(menuSaveError)) {
                          throw menuSaveError;
                        }

                        await api.put(`/menus/${selectedMenuId}`, {
                          breakfastPreset: firstRow,
                          breakfastPresetsByName: presetsByName
                        });
                      }
                    }

                    setBreakfastPreset({
                      breakfastName: savedPreset.breakfastName || '',
                      C: savedPreset.C ?? '',
                      P: savedPreset.P ?? '',
                      F: savedPreset.F ?? '',
                      V: savedPreset.V ?? 80,
                      isLargeBreakfast: !!savedPreset.isLargeBreakfast,
                      presetsByName: savedPresetsByName
                    });
                    saveBreakfastPresetToStorage({
                      breakfastName: savedPreset.breakfastName || '',
                      C: savedPreset.C ?? '',
                      P: savedPreset.P ?? '',
                      F: savedPreset.F ?? '',
                      V: savedPreset.V ?? 80,
                      isLargeBreakfast: !!savedPreset.isLargeBreakfast,
                      presetsByName: savedPresetsByName
                    });
                    setImportName(file.name);
                  } catch (err) {
                    setError(err.response?.data?.message || 'Failed to import breakfast file');
                  } finally {
                    setSavingBreakfastImport(false);
                    event.target.value = '';
                  }
                }} className="hidden" />
              </label>
              <button
                type="button"
                onClick={downloadBreakfastTemplate}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/20"
              >
                Download breakfast template
              </button>
              <button type="button" onClick={exportWorkbook} className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300">
                <Download size={16} /> Export
              </button>
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
                  {menuDateKeys.map((key) => (
                    <option key={key} value={key}>{formatDateLabel(key)}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => downloadDayKitchenPaper(pdfDate)}
                disabled={!pdfDate}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
              >
                <FileText size={16} /> Download Day PDF
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Menu</label>
            <div className="flex gap-3">
              <select value={selectedMenuId} onChange={(e) => setSelectedMenuId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm focus:border-slate-900 focus:outline-none">
                {menus.map((menu) => (
                  <option key={menu._id} value={menu._id}>{menu.title || menu.name || 'Untitled menu'}</option>
                ))}
              </select>
              <button type="button" onClick={() => setSelectedMenuId((prev) => prev)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <RefreshCw size={16} />
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
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer or email" className="w-full rounded-xl border border-slate-300 py-3 pl-9 pr-3 text-sm" />
            </div>
            {savingBreakfastImport && (
              <p className="mt-2 text-xs text-slate-500">Saving breakfast presets...</p>
            )}
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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Main Meal Rotation — {formatDateLabel(missingCheckDate)}
              </h4>
              <p className="text-[11px] text-slate-400 mb-3">
                Up to 3 meals, cycled in order (not random) as customers are assigned. If a customer's exclusions rule out all 3, a sub meal is used instead.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
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
                  {(mainMealOptionsByDate[missingCheckDate]?.mainMeals || []).length < 3 && (
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        value={newMainMealName}
                        onChange={(e) => setNewMainMealName(e.target.value)}
                        placeholder="Meal name"
                        className="flex-1 min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                      <select
                        value={newMainMealType}
                        onChange={(e) => setNewMainMealType(e.target.value)}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="chicken">Chicken</option>
                        <option value="beef">Beef</option>
                        <option value="fish">Fish</option>
                      </select>
                      <input
                        value={newMainMealExclusions}
                        onChange={(e) => setNewMainMealExclusions(e.target.value)}
                        placeholder="Exclusions e.g. Dairy"
                        className="flex-1 min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={addMainMeal}
                        disabled={savingMainMealOptions || !newMainMealName.trim()}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  )}
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
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      value={newSubMealName}
                      onChange={(e) => setNewSubMealName(e.target.value)}
                      placeholder="Meal name"
                      className="flex-1 min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={newSubMealType}
                      onChange={(e) => setNewSubMealType(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="chicken">Chicken</option>
                      <option value="beef">Beef</option>
                      <option value="fish">Fish</option>
                    </select>
                    <input
                      value={newSubMealExclusions}
                      onChange={(e) => setNewSubMealExclusions(e.target.value)}
                      placeholder="Exclusions e.g. Dairy"
                      className="flex-1 min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addSubMeal}
                      disabled={savingMainMealOptions || !newSubMealName.trim()}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={runAssignMainMeals}
                disabled={assigningMainMeals || missingSelectionEntries.length === 0}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <Shuffle size={14} className={assigningMainMeals ? 'animate-spin' : ''} />
                {assigningMainMeals ? 'Assigning...' : 'Auto-Assign Main Meals'}
              </button>
              {missingSelectionEntries.length === 0 && (
                <p className="mt-1 text-[11px] text-slate-400">Run "Check Missing Selections" above first to load the customer list to assign.</p>
              )}

              {mainMealAssignResult && (
                <p className="mt-2 text-xs text-emerald-700">
                  Assigned {mainMealAssignResult.assigned} main meal slot(s) across {mainMealAssignResult.customersProcessed} customer(s).
                  {mainMealAssignResult.skippedNoOption > 0 && ` ${mainMealAssignResult.skippedNoOption} slot(s) skipped — no eligible meal found (check main + sub meal exclusions).`}
                  {mainMealAssignResult.skippedAlreadyAssigned > 0 && ` ${mainMealAssignResult.skippedAlreadyAssigned} customer(s) already had enough main meals.`}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Snack Menu</h3>
            <button
              type="button"
              onClick={runAssignSnacks}
              disabled={assigningSnacks || !selectedMenuId}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Shuffle size={14} className={assigningSnacks ? 'animate-spin' : ''} />
              {assigningSnacks ? 'Assigning...' : 'Auto-Assign Snacks'}
            </button>
          </div>

          {snackAssignResult && (
            <div className="mb-3 text-xs space-y-1">
              <p className={snackAssignResult.assigned > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                Assigned {snackAssignResult.assigned} snack slot(s) across {snackAssignResult.customersProcessed} customer(s) checked.
              </p>
              {snackAssignResult.skippedNoSnacksNeeded > 0 && (
                <p className="text-slate-500">{snackAssignResult.skippedNoSnacksNeeded} customer(s) skipped — no snacks in their website subscription (snacks_per_day is 0 or unmatched).</p>
              )}
              {snackAssignResult.skippedNoOptions > 0 && (
                <p className="text-slate-500">
                  {snackAssignResult.skippedNoOptions} slot(s) skipped — no eligible snack options
                  {snackAssignResult.datesWithNoOptions?.length > 0 && ` for: ${snackAssignResult.datesWithNoOptions.map(formatDateLabel).join(', ')}`}
                </p>
              )}
            </div>
          )}

          {menuDateKeys.length === 0 ? (
            <p className="text-sm text-slate-400">Load a menu with customer selections to manage snack ingredients per date.</p>
          ) : (
            <>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
                <select
                  value={snackDate}
                  onChange={(e) => setSnackDate(e.target.value)}
                  className="w-full max-w-xs rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {menuDateKeys.map((key) => (
                    <option key={key} value={key}>{formatDateLabel(key)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 mb-3">
                {(snackOptionsByDate[snackDate] || []).length === 0 ? (
                  <p className="text-sm text-slate-400">No snack ingredients added for this date yet.</p>
                ) : (
                  (snackOptionsByDate[snackDate] || []).map((opt, index) => (
                    <div key={`${opt.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
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
                        <button type="button" onClick={() => removeSnackOption(index)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[140px]">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ingredient name</label>
                  <input
                    value={newSnackName}
                    onChange={(e) => setNewSnackName(e.target.value)}
                    placeholder="e.g. Greek Yogurt"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Exclusions</label>
                  <input
                    value={newSnackExclusions}
                    onChange={(e) => setNewSnackExclusions(e.target.value)}
                    placeholder="e.g. Dairy, Nuts"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">C</label>
                  <input type="number" value={newSnackC} onChange={(e) => setNewSnackC(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">P</label>
                  <input type="number" value={newSnackP} onChange={(e) => setNewSnackP(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">F</label>
                  <input type="number" value={newSnackF} onChange={(e) => setNewSnackF(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button
                  type="button"
                  onClick={addSnackOption}
                  disabled={savingSnackOptions || !newSnackName.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Customers don't choose snacks — Auto-Assign picks randomly (50/50 across eligible options) from this list per day, skipping any snack whose exclusion tags match the customer's exclusion list, and splits macros evenly across their snacks/day.
              </p>
            </>
          )}
        </div>

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
                  </div>
                  <p className="text-sm text-slate-500">{entry.email || 'No email'} • {entry.mealCount} meal(s)</p>
                </div>
                {!entry.missingSelection && (
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                    <Stat label="Total weight" value={`${entry.totalWeight || 0} g`} />
                    <Stat label="Breakfast" value={`${entry.breakfastPreset?.V || 0} g`} />
                    <Stat label="Macros" value={`C ${entry.macros?.C || 0} / P ${entry.macros?.P || 0} / F ${entry.macros?.F || 0}`} />
                    <Stat label="Calories" value={`${entry.totalCalories || 0}`} />
                    <Stat label="Snacks/Day" value={entry.snacksPerDay ?? '—'} />
                  </div>
                )}
              </div>
              {entry.missingSelection ? (
                <div className="p-5">
                  <p className="text-sm text-amber-700">
                    This customer has a delivery scheduled on {formatDateLabel(entry.missingSelectionDate)} but hasn't selected any meals yet.
                  </p>
                </div>
              ) : (
              <div className="space-y-5 p-5">
                {groupMealsByDay(entry.selectedMeals || []).map((dayGroup) => (
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
                          <div className="mt-2 text-sm font-medium text-slate-700 truncate">
                            {getMealLabel(meal).mealName}
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
