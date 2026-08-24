export const ISSUE_TYPES = [
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'missing_item', label: 'Missing Item' },
  { value: 'late_delivery', label: 'Late Delivery' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'not_delivered', label: 'Not Delivered' },
  { value: 'other', label: 'Other' },
];

export const PRIORITY_CONFIG = {
  low: { label: 'Low', cls: 'bg-green-100 text-green-700' },
  medium: { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700' },
  high: { label: 'High', cls: 'bg-red-100 text-red-700' },
};

export const ISSUE_TYPE_LABELS = Object.fromEntries(ISSUE_TYPES.map(t => [t.value, t.label]));

export const FLAGGED_BAG_THRESHOLD = 3;

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatCompactRelativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
