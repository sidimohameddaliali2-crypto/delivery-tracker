// Buckets delivered Delivery docs into 24 hour-of-day buckets within [rangeStart, rangeEnd).
// lateMinutes/earlyMinutes/deliveryType are only meaningful once status === 'delivered'
// (they sit at schema defaults otherwise), so undelivered records are skipped.
export function bucketDeliveriesByHour(deliveries, { rangeStart, rangeEnd }) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    early: 0,
    onTime: 0,
    late: 0,
  }));

  (deliveries || []).forEach((d) => {
    if (d.status !== 'delivered') return;
    if (!d.scheduledTime) return;
    const scheduled = new Date(d.scheduledTime);
    if (scheduled < rangeStart || scheduled >= rangeEnd) return;

    const bucket = buckets[scheduled.getHours()];

    const isLate = d.deliveryType === 'late' || Number(d.lateMinutes) > 0;
    const isEarly = d.deliveryType === 'early' || (!isLate && Number(d.earlyMinutes) > 0);

    if (isEarly) bucket.early += 1;
    else if (isLate) bucket.late += 1;
    else bucket.onTime += 1;
  });

  return buckets;
}
