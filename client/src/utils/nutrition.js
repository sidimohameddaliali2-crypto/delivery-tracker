// Nutrition helper functions: calories, distribution, and lookup tables
export const calculateCalories = ({ C = 0, P = 0, F = 0 }) => {
  const c = Number(C) || 0;
  const p = Number(P) || 0;
  const f = Number(F) || 0;
  return Math.round(c * 4 + p * 4 + f * 9);
};

const proteinRanges = [
  { min: 25, max: 29, val: 100 },
  { min: 30, max: 35, val: 130 },
  { min: 36, max: 40, val: 140 },
  { min: 41, max: 45, val: 160 },
  { min: 46, max: 50, val: 180 },
  { min: 51, max: 55, val: 200 },
  { min: 61, max: 65, val: 240 }
];

const carbRanges = [
  { min: 0, max: 10, val: 20 },
  { min: 11, max: 15, val: 50 },
  { min: 16, max: 20, val: 70 },
  { min: 21, max: 24, val: 85 },
  { min: 25, max: 30, val: 100 },
  { min: 31, max: 35, val: 115 },
  { min: 36, max: 40, val: 134 },
  { min: 41, max: 45, val: 150 },
  { min: 46, max: 50, val: 155 },
  { min: 51, max: 55, val: 160 },
  { min: 56, max: 60, val: 165 },
  { min: 61, max: 65, val: 180 },
  { min: 66, max: 70, val: 200 },
  { min: 71, max: 75, val: 210 },
  { min: 76, max: 80, val: 225 }
];

const lookupRange = (ranges, grams) => {
  const g = Math.round(Number(grams) || 0);
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (g >= r.min && g <= r.max) return r.val;
  }
  // If outside, choose nearest boundary
  if (g < ranges[0].min) return ranges[0].val;
  return ranges[ranges.length - 1].val;
};

export const lookupProteinWeight = (grams) => lookupRange(proteinRanges, grams);
export const lookupCarbWeight = (grams) => lookupRange(carbRanges, grams);

// Distribute macros across meals with optional presets
export const distributeMacros = ({ C = 0, P = 0, F = 0 }, mealCount = 1, presets = []) => {
  const totalC = Number(C) || 0;
  const totalP = Number(P) || 0;
  const totalF = Number(F) || 0;
  // presets: array of { type: 'breakfast'|'snack', C,P,F }
  let remainingC = totalC;
  let remainingP = totalP;
  let remainingF = totalF;

  const presetTotals = presets.reduce((acc, p) => {
    acc.C += Number(p.C) || 0;
    acc.P += Number(p.P) || 0;
    acc.F += Number(p.F) || 0;
    return acc;
  }, { C: 0, P: 0, F: 0 });

  remainingC = Math.max(0, remainingC - presetTotals.C);
  remainingP = Math.max(0, remainingP - presetTotals.P);
  remainingF = Math.max(0, remainingF - presetTotals.F);

  const distributeCount = Math.max(1, mealCount - presets.length);

  const cPer = distributeCount > 0 ? remainingC / distributeCount : 0;
  const pPer = distributeCount > 0 ? remainingP / distributeCount : 0;
  const fPer = distributeCount > 0 ? remainingF / distributeCount : 0;

  // Build per-meal array: first include presets as given, then distributed meals
  const perMeal = [];
  // include presets as they were provided
  presets.forEach((p) => {
    perMeal.push({ C: Number(p.C) || 0, P: Number(p.P) || 0, F: Number(p.F) || 0, V: 80 });
  });

  for (let i = 0; i < (mealCount - presets.length); i++) {
    perMeal.push({ C: Math.round(cPer), P: Math.round(pPer), F: Math.round(fPer), V: 80 });
  }

  return {
    total: { C: totalC, P: totalP, F: totalF },
    perMeal
  };
};
