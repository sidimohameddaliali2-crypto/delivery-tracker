const normalizeText = (value) => String(value || '').trim().toLowerCase();

const calculateCalories = ({ C = 0, P = 0, F = 0 }) => {
  const carbs = Number(C) || 0;
  const protein = Number(P) || 0;
  const fat = Number(F) || 0;
  return Math.round((protein * 4) + (carbs * 4) + (fat * 9));
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

const getProteinMealWeight = (grams) => {
  const rounded = Math.round(Number(grams) || 0);
  if (rounded < 25) return 100;
  if (rounded <= 29) return 100;
  if (rounded <= 35) return 120;
  if (rounded <= 40) return 140;
  if (rounded <= 45) return 160;
  if (rounded <= 50) return 180;
  if (rounded <= 55) return 200;
  if (rounded <= 60) return 220;
  return 240;
};

const getCarbMealWeight = (grams) => {
  const rounded = Math.round(Number(grams) || 0);
  if (rounded <= 10) return 20;
  if (rounded <= 15) return 50;
  if (rounded <= 20) return 70;
  if (rounded <= 24) return 85;
  if (rounded <= 30) return 100;
  if (rounded <= 35) return 115;
  if (rounded <= 40) return 135;
  if (rounded <= 45) return 150;
  if (rounded <= 50) return 155;
  if (rounded <= 55) return 160;
  if (rounded <= 60) return 165;
  if (rounded <= 65) return 180;
  if (rounded <= 70) return 200;
  if (rounded <= 75) return 210;
  return 225;
};

const getBreakfastVegWeight = (preset = {}) => {
  const isLargeBreakfast = !!preset?.isLargeBreakfast;
  const customVeg = Number(preset?.V);
  if (isLargeBreakfast && Number.isFinite(customVeg) && customVeg > 0) {
    return customVeg;
  }
  return 80;
};

const normalizeBreakfastName = (value) => normalizeText(String(value || '').replace(/\s+/g, ' ').trim());

const simplifyBreakfastName = (value) => normalizeText(
  String(value || '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

  const compactBreakfastName = (value) => simplifyBreakfastName(value).replace(/\s+/g, '');

const getDefaultBreakfastPreset = (preset = {}) => {
  return {
    name: String(preset.breakfastName || '').trim(),
    C: Number(preset.C) || 0,
    P: Number(preset.P) || 0,
    F: Number(preset.F) || 0,
    V: Number(preset.V) || 80,
    isLargeBreakfast: !!preset.isLargeBreakfast
  };
};

const resolveBreakfastPresetForMeal = (meal, preset = {}) => {
  const defaultPreset = getDefaultBreakfastPreset(preset);
  const map = preset?.presetsByName || {};
  const mealBreakfastName = String(
    meal?.breakfastName
    || meal?.mealName
    || meal?.menuItemName
    || meal?.menuItemId?.mealName
    || ''
  ).trim();
  const exactKey = normalizeBreakfastName(mealBreakfastName);
  const simplifiedMealKey = simplifyBreakfastName(mealBreakfastName);
  const compactMealKey = compactBreakfastName(mealBreakfastName);

  let match = exactKey ? map[exactKey] : null;

  if (!match && simplifiedMealKey) {
    const mapEntries = Object.entries(map || {});

    const exactSimplifiedEntry = mapEntries.find(([rawKey, rawValue]) => {
      const candidateName = rawValue?.breakfastName || rawKey;
      return simplifyBreakfastName(candidateName) === simplifiedMealKey;
    });
    if (exactSimplifiedEntry) {
      match = exactSimplifiedEntry[1];
    }

    if (!match && compactMealKey) {
      const compactEntry = mapEntries.find(([rawKey, rawValue]) => {
        const candidateName = rawValue?.breakfastName || rawKey;
        return compactBreakfastName(candidateName) === compactMealKey;
      });
      if (compactEntry) {
        match = compactEntry[1];
      }
    }

    if (!match) {
      const partialEntry = mapEntries.find(([rawKey, rawValue]) => {
        const candidateName = rawValue?.breakfastName || rawKey;
        const simplifiedCandidateKey = simplifyBreakfastName(candidateName);
        const compactCandidateKey = compactBreakfastName(candidateName);
        if (!simplifiedCandidateKey) return false;
        return (
          simplifiedMealKey.includes(simplifiedCandidateKey)
          || simplifiedCandidateKey.includes(simplifiedMealKey)
          || (compactMealKey && compactCandidateKey && (
            compactMealKey.includes(compactCandidateKey)
            || compactCandidateKey.includes(compactMealKey)
          ))
        );
      });
      if (partialEntry) {
        match = partialEntry[1];
      }
    }
  }

  if (!match) return defaultPreset;
  return {
    name: mealBreakfastName,
    C: Number(match.C) || 0,
    P: Number(match.P) || 0,
    F: Number(match.F) || 0,
    V: Number(match.V) || 80,
    isLargeBreakfast: !!match.isLargeBreakfast
  };
};

const getMacroAdjustment = (deliveryNumber) => {
  const pattern = [0.01, -0.01, 0.02, -0.02];
  const index = Math.max(0, Number(deliveryNumber || 1) - 1) % pattern.length;
  return pattern[index];
};

const resolveProteinType = (meal) => {
  const manualProteinType = normalizeText(meal?.manualProteinType || meal?.proteinType || meal?.proteinSourceType);
  if (manualProteinType === 'chicken' || manualProteinType === 'beef' || manualProteinType === 'fish') {
    return manualProteinType;
  }
  const mealName = normalizeText(meal?.proteinChoice || meal?.mealName || meal?.description);
  if (mealName.includes('chicken')) return 'chicken';
  if (mealName.includes('beef')) return 'beef';
  if (mealName.includes('fish')) return 'fish';
  return 'other';
};

const applySequenceMultiplier = (value, positionIndex) => {
  const multiplier = Math.max(0, Number(positionIndex) || 0);
  return value - (value * 0.05 * multiplier);
};

const buildDayMealMeta = (dayMeals) => {
  const nonBreakfastMeals = dayMeals.filter((meal) => {
    const t = normalizeText(meal?.mealType);
    return t !== 'breakfast' && t !== 'snack';
  });
  const typed = nonBreakfastMeals.map((meal) => ({
    meal,
    type: resolveProteinType(meal)
  }));

  const chickenMeals = typed.filter((item) => item.type === 'chicken');
  const beefMeals = typed.filter((item) => item.type === 'beef');
  const fishMeals = typed.filter((item) => item.type === 'fish');
  const beefOrFishMeals = typed.filter((item) => item.type === 'beef' || item.type === 'fish');
  const typedCount = typed.length;
  const hasChicken = chickenMeals.length > 0;
  const hasBeef = beefMeals.length > 0;
  const hasFish = fishMeals.length > 0;
  const onlyBeefDay = hasBeef && !hasFish && !hasChicken && beefMeals.length === typedCount;
  const onlyFishDay = hasFish && !hasBeef && !hasChicken && fishMeals.length === typedCount;
  const allBeefOrFishSingleTypeDay = onlyBeefDay || onlyFishDay;

  const positionMap = new Map();
  chickenMeals.forEach((item, index) => positionMap.set(item.meal, { group: 'chicken', index }));
  beefMeals.forEach((item, index) => positionMap.set(item.meal, { group: 'beef', index }));
  fishMeals.forEach((item, index) => positionMap.set(item.meal, { group: 'fish', index }));
  beefOrFishMeals.forEach((item, index) => {
    const existing = positionMap.get(item.meal) || {};
    positionMap.set(item.meal, { ...existing, beefFishIndex: index });
  });

  return {
    nonBreakfastCount: nonBreakfastMeals.length,
    hasBreakfast: dayMeals.some((meal) => normalizeText(meal?.mealType) === 'breakfast'),
    allBeefOrFishSingleTypeDay,
    hasChicken,
    hasBeef,
    hasFish,
    positionMap
  };
};

const calculateByProteinRule = ({
  type,
  carbsBase,
  proteinBase,
  fatsBase,
  meta,
  meal
}) => {
  const pos = meta.positionMap.get(meal) || {};

  // Carbs
  let carbsValue = carbsBase;
  if (type === 'chicken') {
    carbsValue = carbsBase + (carbsBase * 0.0713);
    carbsValue = applySequenceMultiplier(carbsValue, pos.index);
  } else if (type === 'beef') {
    if (meta.allBeefOrFishSingleTypeDay) {
      carbsValue = carbsBase - (carbsBase * 0.0798);
      carbsValue = applySequenceMultiplier(carbsValue, pos.beefFishIndex);
    } else {
      carbsValue = carbsBase - (carbsBase * 0.0798);
      carbsValue = applySequenceMultiplier(carbsValue, pos.index);
    }
  } else if (type === 'fish') {
    if (meta.allBeefOrFishSingleTypeDay) {
      carbsValue = carbsBase - (carbsBase * 0.0798);
      carbsValue = applySequenceMultiplier(carbsValue, pos.beefFishIndex);
    } else {
      carbsValue = carbsBase - (carbsBase * 0.1098);
      carbsValue = applySequenceMultiplier(carbsValue, pos.index);
    }
  }

  // Protein
  let proteinValue = proteinBase;
  if (type === 'chicken') {
    proteinValue = proteinBase + (proteinBase * 0.05234);
    proteinValue = applySequenceMultiplier(proteinValue, pos.index);
  } else if (type === 'beef') {
    if (meta.allBeefOrFishSingleTypeDay) {
      proteinValue = proteinBase - (proteinBase * 0.05234);
      proteinValue = applySequenceMultiplier(proteinValue, pos.beefFishIndex);
    } else {
      proteinValue = proteinBase + (proteinBase * 0.06);
      proteinValue = applySequenceMultiplier(proteinValue, pos.index);
    }
  } else if (type === 'fish') {
    if (meta.allBeefOrFishSingleTypeDay) {
      proteinValue = proteinBase - (proteinBase * 0.05234);
      proteinValue = applySequenceMultiplier(proteinValue, pos.beefFishIndex);
    } else {
      proteinValue = proteinBase - (proteinBase * 0.06);
      proteinValue = applySequenceMultiplier(proteinValue, pos.index);
    }
  }

  // Fats
  let fatsValue = fatsBase;
  if (type === 'chicken') {
    fatsValue = fatsBase - (fatsBase * 0.103);
    fatsValue = applySequenceMultiplier(fatsValue, pos.index);
  } else if (type === 'beef') {
    if (meta.allBeefOrFishSingleTypeDay) {
      fatsValue = fatsBase + (fatsBase * 0.103);
      fatsValue = applySequenceMultiplier(fatsValue, pos.beefFishIndex);
    } else {
      fatsValue = fatsBase + (fatsBase * 0.103);
      fatsValue = applySequenceMultiplier(fatsValue, pos.index);
    }
  } else if (type === 'fish') {
    if (meta.allBeefOrFishSingleTypeDay) {
      fatsValue = fatsBase + (fatsBase * 0.103);
      fatsValue = applySequenceMultiplier(fatsValue, pos.beefFishIndex);
    } else {
      fatsValue = fatsBase + (fatsBase * 0.133);
      fatsValue = applySequenceMultiplier(fatsValue, pos.index);
    }
  }

  return {
    C: carbsValue,
    P: proteinValue,
    F: fatsValue
  };
};

const pickSnackPreset = (preset = {}) => ({
  C: Number(preset.snackC ?? preset.SnackC ?? preset.sc ?? 0) || 0,
  P: Number(preset.snackP ?? preset.SnackP ?? preset.sp ?? 0) || 0,
  F: Number(preset.snackF ?? preset.SnackF ?? preset.sf ?? 0) || 0
});

export const calculateKitchenListEntry = ({ customer, selectedMeals = [], breakfastPreset = {} }) => {
  const customerMacros = customer?.targetMacros
    || customer?.customerMacros
    || customer?.macros
    || customer?.mealMacros
    || {
      C: customer?.C,
      P: customer?.P,
      F: customer?.F
    };
  const normalizedMacros = customerMacros.total
    ? {
        C: Number(customerMacros.total.C) || 0,
        P: Number(customerMacros.total.P) || 0,
        F: Number(customerMacros.total.F) || 0
      }
    : {
        C: Number(customerMacros.C) || 0,
        P: Number(customerMacros.P) || 0,
        F: Number(customerMacros.F) || 0
      };
  const defaultBreakfast = getDefaultBreakfastPreset(breakfastPreset);
  const breakfastCarbs = Number(defaultBreakfast.C) || 0;
  const breakfastProteinRaw = Number(defaultBreakfast.P) || 0;
  const breakfastProtein = breakfastProteinRaw <= 30 ? 30 : breakfastProteinRaw;
  const breakfastFats = Number(defaultBreakfast.F) || 0;
  const snackPreset = pickSnackPreset(breakfastPreset);

  const sortedDayKeys = Array.from(new Set(selectedMeals.map((m) => getDateKey(m?.date)))).sort();
  const deliveryNumberByDay = new Map(sortedDayKeys.map((key, idx) => [key, idx + 1]));

  const mealsByDay = selectedMeals.reduce((acc, meal) => {
    const key = getDateKey(meal?.date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(meal);
    return acc;
  }, {});

  const normalizedMeals = selectedMeals.map((meal, index) => {
    const mealType = normalizeText(meal.mealType);
    const isBreakfast = mealType === 'breakfast';
    const isSnack = mealType === 'snack';
    const type = resolveProteinType(meal);

    if (isBreakfast) {
      const mealBreakfastPreset = resolveBreakfastPresetForMeal(meal, breakfastPreset);
      const mealBreakfastProtein = (Number(mealBreakfastPreset.P) || 0) <= 30 ? 30 : (Number(mealBreakfastPreset.P) || 0);
      const proteinWeight = Number(mealBreakfastPreset?.isLargeBreakfast) ? 150 : 100;
      const carbWeight = Number(mealBreakfastPreset?.isLargeBreakfast) ? 200 : 100;
      const vegWeight = getBreakfastVegWeight(mealBreakfastPreset);
      const totalWeight = proteinWeight + carbWeight + vegWeight;
      const breakfastMacros = {
        C: Number(mealBreakfastPreset.C) || 0,
        P: mealBreakfastProtein,
        F: Number(mealBreakfastPreset.F) || 0
      };
      return {
        ...meal,
        category: 'breakfast',
        macros: {
          ...breakfastMacros,
          calories: calculateCalories(breakfastMacros)
        },
        weight: totalWeight,
        proteinWeight,
        carbWeight,
        vegWeight,
        position: index + 1
      };
    }

    if (isSnack) {
      const proteinWeight = 50;
      const carbWeight = 50;
      const vegWeight = 0;
      const totalWeight = proteinWeight + carbWeight + vegWeight;
      const snackMacros = {
        C: snackPreset.C,
        P: snackPreset.P,
        F: snackPreset.F
      };
      return {
        ...meal,
        category: 'snack',
        macros: {
          ...snackMacros,
          calories: calculateCalories(snackMacros)
        },
        weight: totalWeight,
        proteinWeight,
        carbWeight,
        vegWeight,
        position: index + 1
      };
    }

    const dayMeals = mealsByDay[getDateKey(meal?.date)] || [];
    const dayMeta = buildDayMealMeta(dayMeals);
    const dayMealCount = Math.max(1, dayMeta.nonBreakfastCount || Number(customer?.mealPerDay) || 1);
    const deliveryNumber = deliveryNumberByDay.get(getDateKey(meal?.date)) || 1;
    const macroAdjustment = getMacroAdjustment(deliveryNumber);

    const dayBreakfastMeal = dayMeals.find((m) => normalizeText(m?.mealType) === 'breakfast') || null;
    const dayBreakfastPreset = dayBreakfastMeal
      ? resolveBreakfastPresetForMeal(dayBreakfastMeal, breakfastPreset)
      : defaultBreakfast;
    const dayBreakfastProteinRaw = Number(dayBreakfastPreset.P) || 0;
    const dayBreakfastProtein = dayBreakfastProteinRaw <= 30 ? 30 : dayBreakfastProteinRaw;

    // Apply breakfast deductions only when breakfast exists on this specific day.
    const breakfastCarbsForDefault = dayMeta.hasBreakfast ? (Number(dayBreakfastPreset.C) || 0) : 0;
    const breakfastProteinForDefault = dayMeta.hasBreakfast ? dayBreakfastProtein : 0;
    const breakfastFatsForDefault = dayMeta.hasBreakfast ? (Number(dayBreakfastPreset.F) || 0) : 0;

    const carbsDefault = Math.max(0, normalizedMacros.C - breakfastCarbsForDefault - snackPreset.C);
    const proteinDefault = Math.max(0, normalizedMacros.P - breakfastProteinForDefault - snackPreset.P);
    const fatsDefault = Math.max(0, normalizedMacros.F - breakfastFatsForDefault - snackPreset.F);

    const carbsBase = (carbsDefault / dayMealCount) + (carbsDefault * macroAdjustment);
    const proteinBase = (proteinDefault / dayMealCount) + (proteinDefault * macroAdjustment);
    const fatsBase = (fatsDefault / dayMealCount) + (fatsDefault * macroAdjustment);

    const computed = calculateByProteinRule({
      type,
      carbsBase,
      proteinBase,
      fatsBase,
      meta: dayMeta,
      meal
    });

    const carbsValue = computed.C;
    const proteinValue = computed.P;
    const fatValue = computed.F;

    const carbsRounded = Math.round(carbsValue);
    const proteinRounded = Math.round(proteinValue);
    const fatsRounded = Math.round(fatValue);

    const carbsWeight = getCarbMealWeight(carbsRounded);
    const proteinWeight = getProteinMealWeight(proteinRounded);
    const vegWeight = 80;
    const weight = proteinWeight + carbsWeight + vegWeight;

    const roundedMacros = {
      C: carbsRounded,
      P: proteinRounded,
      F: fatsRounded
    };

    return {
      ...meal,
      category: 'meal',
      macros: {
        ...roundedMacros,
        calories: calculateCalories(roundedMacros)
      },
      weight,
      proteinWeight,
      carbWeight: carbsWeight,
      vegWeight,
      position: index + 1,
      flags: {
        isChicken: type === 'chicken',
        isBeef: type === 'beef',
        isFish: type === 'fish',
        manualProteinType: normalizeText(meal.manualProteinType || '') || null,
        deliveryNumber,
        macroAdjustment
      }
    };
  });

  const totalWeight = normalizedMeals.reduce((sum, meal) => sum + (Number(meal.weight) || 0), 0);
  const totalCalories = normalizedMeals.reduce((sum, meal) => sum + (Number(meal?.macros?.calories) || 0), 0);

  return {
    customerId: customer?.customerId,
    customerName: [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim(),
    email: customer?.email,
    macros: normalizedMacros,
    breakfastPreset: {
      C: breakfastCarbs,
      P: breakfastProtein,
      F: breakfastFats,
      V: getBreakfastVegWeight(defaultBreakfast)
    },
    selectedMeals: normalizedMeals,
    totalWeight,
    totalCalories,
    mealCount: selectedMeals.filter((meal) => normalizeText(meal.mealType) !== 'breakfast').length
  };
};
