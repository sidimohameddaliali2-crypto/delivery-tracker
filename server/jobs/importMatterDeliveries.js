import { importMatterDeliveriesForDate } from '../services/matterDeliveryImportService.js';

// Owner (2026-09-22, refined same day: "the Wednesday one [should import]
// on Tuesday at 6:00 AM"): pull tomorrow's delivery schedule from the real
// Matter subscription platform every morning, so dispatchers have the whole
// day to review/assign drivers (via Optimize Routes) before the very early
// (~1-2 AM) departure, instead of the schedule only existing on Matter's
// side. Runs once daily at RUN_HOUR local time (setTimeout-then-setInterval,
// same pattern as jobs/recalculateDriverKpis.js), PLUS once immediately on
// every server start — found the hard way (2026-09-22): the KPI job's
// "wait for the next occurrence" pattern means a server that starts (or
// restarts) any time after RUN_HOUR simply misses that whole day's import,
// with the next one importing the WRONG day (e.g. deploying at 1 PM Tuesday
// meant Wednesday's schedule never got imported at all, and the next run —
// Wednesday 6 AM — would have imported Thursday's, not backfilled
// Wednesday's). The import is idempotent (see matterDeliveryImportService's
// dedup checks), so an extra run on every restart is harmless — it just
// re-confirms nothing changed — while guaranteeing a missed 6 AM never
// leaves a day genuinely empty.

const RUN_HOUR = parseInt(process.env.MATTER_IMPORT_RUN_HOUR || '6', 10); // 6 AM local
const TIMEZONE_OFFSET_MINUTES = parseInt(process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || '240', 10); // Default: UAE

function tomorrowDateKey() {
  const nowLocal = new Date(Date.now() + TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const tomorrowLocal = new Date(nowLocal.getTime() + 24 * 60 * 60 * 1000);
  return tomorrowLocal.toISOString().slice(0, 10);
}

export async function runImportMatterDeliveriesOnce(dateKey = tomorrowDateKey()) {
  try {
    const summary = await importMatterDeliveriesForDate(dateKey);
    console.log(
      `[MatterImport] ${dateKey}: ${summary.created} created, ${summary.alreadyExisted} already imported, ` +
      `${summary.alreadyHadOtherDelivery} already had a delivery from elsewhere, ` +
      `${summary.customersCreated} new customer(s), ${summary.failed} failed (of ${summary.total} subscriptions).`
    );
    if (summary.failed > 0) {
      console.error('[MatterImport] Failures:', JSON.stringify(summary.errors.slice(0, 10)));
    }
    return summary;
  } catch (err) {
    console.error('[MatterImport] Error:', err.message);
    throw err;
  }
}

export function startImportMatterDeliveriesJob() {
  // Startup catch-up — see the comment above for why.
  runImportMatterDeliveriesOnce();

  const now = new Date();
  const nowLocal = new Date(now.getTime() + TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const nextRun = new Date(nowLocal);
  nextRun.setHours(RUN_HOUR, 0, 0, 0);
  if (nowLocal >= nextRun) nextRun.setDate(nextRun.getDate() + 1);
  const msUntilNextRun = nextRun - nowLocal;

  setTimeout(() => {
    runImportMatterDeliveriesOnce();
    setInterval(runImportMatterDeliveriesOnce, 24 * 60 * 60 * 1000);
  }, msUntilNextRun);
}
