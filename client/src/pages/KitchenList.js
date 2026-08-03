import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Download, RefreshCw, Search, Loader, UtensilsCrossed, ChefHat } from 'lucide-react';
import * as XLSX from 'xlsx';
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
  const displayType = mealType === 'breakfast' ? 'Breakfast' : 'Meal';
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
  if (text.includes('fish')) return 'Fish';
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

  useEffect(() => {
    if (!selectedMenuId) return;

    const loadSelections = async () => {
      try {
        setLoadingSelections(true);
        setError('');
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

          // Fallback: when joined selection payload has zero macros, pull from meal-profile.
          const enrichedSelections = await Promise.all(rawSelections.map(async (entry) => {
            const existingMacros = entry?.targetMacros || entry?.customerMacros || entry?.macros;
            if (hasNonZeroMacros(existingMacros)) {
              return entry;
            }

            const customerKey = String(entry?.customerId || entry?.email || '').trim();
            const email = String(entry?.email || '').trim();
            if (!customerKey || !email) {
              return entry;
            }

            try {
              const profileResponse = await api.get(
                `/menus/customers/${encodeURIComponent(customerKey)}/meal-profile?email=${encodeURIComponent(email)}&menuId=${encodeURIComponent(selectedMenuId)}`
              );
              const profileMacros = profileResponse.data?.data?.macros;
              if (!hasNonZeroMacros(profileMacros)) {
                return entry;
              }

              return {
                ...entry,
                targetMacros: profileMacros,
                customerMacros: profileMacros
              };
            } catch (profileError) {
              return entry;
            }
          }));

          const keyedSelections = enrichedSelections.map((entry) => attachStableMealKeys(entry));
          setMenuSelections(keyedSelections);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load menu selections');
      } finally {
        setLoadingSelections(false);
      }
    };

    loadSelections();
  }, [selectedMenuId]);

  const customerRows = useMemo(() => {
    return menuSelections
      .filter((entry) => `${getCustomerName(entry)} ${entry.email || ''}`.toLowerCase().includes(search.toLowerCase()))
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
          customer: { ...entry, mealCount, customerName: getCustomerName(entry) },
          selectedMeals: enrichedMeals,
          breakfastPreset
        });
      });
  }, [menuSelections, search, breakfastPreset, mealTypeOverrides]);

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

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {(loadingMenus || loadingSelections) && (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-6 text-slate-600 shadow-sm ring-1 ring-slate-200">
            <Loader className="animate-spin" size={18} /> Loading kitchen list...
          </div>
        )}

        <div className="space-y-4">
          {customerRows.map((entry) => (
            <div key={`${entry.email || entry.customerId}`} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{entry.customerName || entry.email || 'Unknown customer'}</h2>
                  <p className="text-sm text-slate-500">{entry.email || 'No email'} • {entry.mealCount} meal(s)</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <Stat label="Total weight" value={`${entry.totalWeight || 0} g`} />
                  <Stat label="Breakfast" value={`${entry.breakfastPreset?.V || 0} g`} />
                  <Stat label="Macros" value={`C ${entry.macros?.C || 0} / P ${entry.macros?.P || 0} / F ${entry.macros?.F || 0}`} />
                  <Stat label="Calories" value={`${entry.totalCalories || 0}`} />
                </div>
              </div>
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
