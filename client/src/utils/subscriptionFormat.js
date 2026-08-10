export const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

export const formatMoney = (amount, currency) => {
  if (amount === undefined || amount === null) return '—';
  return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
};

// API dates are plain "YYYY-MM-DD" strings — parse the parts directly instead
// of `new Date()` so a user's local timezone can't shift the day.
export const formatDateMDY = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = String(isoDate).slice(0, 10).split('-');
  if (!year || !month || !day) return String(isoDate);
  return `${Number(month)}/${Number(day)}/${year}`;
};

export const isCycleEnded = (isoDate) => {
  if (!isoDate) return false;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return String(isoDate).slice(0, 10) < todayStr;
};
