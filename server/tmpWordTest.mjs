import './loadEnv.js';
import fs from 'fs';
import mongoose from 'mongoose';
import matterApiService from './services/matterApiService.js';
const SCR = 'C:/Users/sidim/AppData/Local/Temp/claude/c--Users-sidim-Desktop-matter-delivery-tracker/7be4381c-4785-4a7a-8f90-b2fd31212407/scratchpad';
const DATE = process.argv[2] || '2026-10-12';
const MENU_ID = process.argv[3] || '6ac4d4fc67e769b0561e67cc';
const dk = (d) => new Date(d).toISOString().slice(0, 10);

// ---- the REAL client calculation + the REAL Word-export code lifted out of KitchenList.js
fs.writeFileSync(SCR + '/klc_word.mjs', fs.readFileSync('../client/src/utils/kitchenListCalculations.js', 'utf8'));
const { calculateKitchenListEntry } = await import('file:///' + SCR + '/klc_word.mjs?' + Date.now());
const KL = fs.readFileSync('../client/src/pages/KitchenList.js', 'utf8');
const grab = (re) => { const m = KL.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
const getMealLabelSrc = grab(/const getMealLabel = [\s\S]*?\n};\n/);
const mealRemarkTextSrc = grab(/const mealRemarkText = [\s\S]*?\.join\(' \| '\);\n/);
const hasDeliverySrc = grab(/const hasDeliveryOnCheckedDate = [\s\S]*?\n};\n/);
const start = KL.indexOf('  const formatAddress = (addr) => {');
const end = KL.indexOf('  const downloadDayKitchenPaper = async (dateKey) => {');
if (start < 0 || end < 0) throw new Error('chunk markers not found');
const chunk = KL.slice(start, end);
// helpers from kitchenData the component imports
const kd = await import('file:///C:/Users/sidim/Desktop/matter-delivery-tracker/client/src/lib/kitchenData.js').catch(() => null);
const getDateKey = (v) => { if (!v) return 'unknown-date'; if (typeof v === 'string') { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; } const d = new Date(v); return d.toISOString().slice(0, 10); };
const formatDateLabel = (v) => new Date(v).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const bk = await db.collection('kitchenbreakfastpresets').findOne({ key: 'global' });
const sn = await db.collection('kitchensnackpresets').findOne({ key: 'global' });
const breakfastPreset = { ...bk.breakfastPreset, presetsByName: bk.presetsByName };
const snackPreset = { presetsByName: sn.presetsByName };
const recs = await db.collection('menuselectionrecords').find({ weeklyMenuId: new mongoose.Types.ObjectId(MENU_ID) }).toArray();
const onDay = recs.filter((r) => (r.selectedMeals || []).some((m) => dk(m.date) === DATE));
const emails = [...new Set(recs.map((r) => String(r.email || '').toLowerCase()).filter(Boolean))];
const custs = await db.collection('customers').find({ email: { $in: emails } }).toArray();
const cBy = new Map(custs.map((c) => [String(c.email).toLowerCase(), c]));
const subs = await matterApiService.findSubscriptionsWithDeliveryOnDate(DATE);

const rows = []; let idx = 0;
async function work() {
  while (idx < onDay.length) {
    const rec = onDay[idx++]; const c = cBy.get(String(rec.email || '').toLowerCase());
    const e = { email: rec.email, customerId: c?.customerId, firstName: c?.firstName || rec.firstName, lastName: c?.lastName || rec.lastName, matterSubscriptionId: c?.matterSubscriptionId || rec.matterSubscriptionId || null, matterCustomerId: c?.matterCustomerId || null, partner: c?.partner ? { businessName: 'Test Partner' } : null, dayNotes: rec.dayNotes || [], selectedMeals: (rec.selectedMeals || []).map((m) => ({ ...m, date: dk(m.date) })) };
    let nut = null; try { if (e.matterCustomerId) nut = await matterApiService.getSubscriptionNutritionByCustomerId(e.matterCustomerId); if (!nut && e.matterSubscriptionId) nut = await matterApiService.getSubscriptionNutritionBySubscriptionId(String(e.matterSubscriptionId)); if (!nut) nut = await matterApiService.getSubscriptionNutritionByEmail(e.email); } catch { /* none */ }
    if (nut) { const w = nut.macros ? { C: nut.macros.carbohydrates || 0, P: nut.macros.protein || 0, F: nut.macros.fat || 0 } : null; Object.assign(e, { targetMacros: w, customerMacros: w, snacksPerDay: nut.snacks_per_day ?? null, planName: nut.plan_name ?? null, mealsPerDay: nut.meal_frequency ?? null, breakfastIncluded: typeof nut.breakfast_included === 'boolean' ? nut.breakfast_included : null, deliveryAddress: nut.customer_addresses?.[0] || null, deliveryWindow: nut.delivery_window || null, matterName: nut.customer_name || null }); }
    const name = e.matterName || [e.firstName, e.lastName].filter(Boolean).join(' ') || e.email;
    const calc = calculateKitchenListEntry({ customer: { ...e, customerName: name }, selectedMeals: e.selectedMeals, breakfastPreset, snackPreset });
    rows.push({ ...calc, customerName: name, dayNotes: e.dayNotes });
  }
}
await Promise.all(Array.from({ length: 8 }, work));
// inject nasty-but-real-world strings to test escaping: apostrophe, ampersand, quotes, angle brackets, accents, Arabic, emoji, very long name, remark + day note with markup
const probe = JSON.parse(JSON.stringify(rows[0]));
probe.customerName = `ZZ Test "Quote" & <b>Tag</b> O'Neil Ça va أحمد 😀 ${'LongName'.repeat(12)}`;
probe.email = 'probe@example.com'; probe.dayNotes = [{ date: DATE, note: 'Note with <script>alert(1)</script> & "quotes" — dash' }];
probe.selectedMeals = probe.selectedMeals.map((m) => ({ ...m, remark: m.mealType === 'main' ? 'carb + sauce' : '' }));
probe.deliveryAddress = { ...(probe.deliveryAddress || {}), building: 'Tower <1> & "Plaza"', area: 'Dubai South', emirate: 'Dubai' };
rows.push(probe);
console.log(`W customers built: ${rows.length}`);

// ---- run the real Word function
let captured = null; let fileName = null;
globalThis.URL.createObjectURL = (b) => { captured = b; return 'blob:test'; };
globalThis.URL.revokeObjectURL = () => {};
globalThis.document = { createElement: () => ({ set href(v) {}, set download(v) { fileName = v; }, click() {} }), body: { appendChild() {}, removeChild() {} } };
const errors = [];
const deps = {
  customerRows: rows, paperPlan: '', api: { get: async () => ({ data: { data: subs } }) }, deliveryCheck: null,
  setError: (m) => errors.push(m), useRef: (v) => ({ current: v }), useState: (v) => [v, () => {}], loadXLSX: async () => ({}),
  getDateKey, formatDateLabel, getMealLabel: null, mealRemarkText: null, hasDeliveryOnCheckedDate: null, setGeneratingPdf: () => {}, setPaperExcluded: () => {}
};
const factory = new Function('deps', `
  const { customerRows, paperPlan, api, deliveryCheck, setError, useRef, useState, loadXLSX, getDateKey, formatDateLabel, setGeneratingPdf } = deps;
  ${getMealLabelSrc}
  ${mealRemarkTextSrc}
  ${hasDeliverySrc}
  const [paperExcludedState, setPaperExcludedFake] = [null, () => {}];
  ${chunk.replace('const [paperExcluded, setPaperExcluded] = useState(null);', 'const setPaperExcluded = () => {};')}
  return { downloadDayKitchenPaperWord, getDeliverableRows };
`);
const fns = factory(deps);
const deliverable = await fns.getDeliverableRows(DATE);
console.log(`W customers after the Matter-delivery filter: ${deliverable.length} (removed ${rows.length - deliverable.length})`);
await fns.downloadDayKitchenPaperWord(DATE);
if (!captured) { console.log('W FAILED: no file produced', errors); process.exit(1); }
const text = await captured.text();
fs.writeFileSync(SCR + '/test_word.doc', text, 'utf8');
fs.writeFileSync(SCR + '/test_word_expected.json', JSON.stringify({ file: fileName, rows: deliverable.map((r) => ({ name: r.customerName, plan: r.planName, meals: (r.selectedMeals || []).filter((m) => dk(m.date) === DATE).length, partner: !!r.partner })) }));
console.log(`W file ${fileName} | ${text.length} chars | errors: ${JSON.stringify(errors)}`);
await mongoose.disconnect(); process.exit(0);
