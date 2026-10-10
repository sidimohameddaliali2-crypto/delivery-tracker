import React, { useState } from 'react';
import { TIMING_LABELS, bucketLabel, shortDayLabel } from '../../../utils/deliveryTimingModel';

const fmt = (n) => Number(n).toLocaleString('en-GB');
const TIMINGS = ['early', 'on', 'late'];
// Top to bottom. Missing timing only stacks in the single-day (hourly) view.
const STACK_ORDER = ['unknown', 'late', 'on', 'early'];

// Axis labels are thinned so a long range stays readable: about 15 labels on wide screens,
// about 6 on phones (every bucket keeps its own hover, focus and select target).
export const labelSteps = (count) => ({ wide: Math.max(1, Math.ceil(count / 15)), narrow: Math.max(1, Math.ceil(count / 6)) });

export const Dot = ({ timing }) => <i className={`mo-dot mo-${timing}`} aria-hidden="true" />;

function axisLabel(bucket, grouping) {
  if (grouping === 'hour') return bucket.hourStart;
  if (grouping === 'month') return bucket.start.slice(0, 7);
  return shortDayLabel(bucket.start);
}

function BucketTooltip({ bucket, style }) {
  return (
    <div className="mo-tooltip" role="tooltip" style={style}>
      <strong>{bucketLabel(bucket)}</strong>
      {TIMINGS.map((t) => (
        <span key={t}><Dot timing={t} />{TIMING_LABELS[t]}<b>{fmt(bucket[t])}</b></span>
      ))}
      <span>Recorded timing<b>{fmt(bucket.recorded)}</b></span>
      <span>Without timing<b>{fmt(bucket.unknown)}</b></span>
      <span>Total deliveries<b>{fmt(bucket.total)}</b></span>
    </div>
  );
}

// Stacked counts chart. Hover/focus only shows a tooltip; activating a segment or a
// label selects it (the owner narrows the table with it, never the overview totals).
function WorkspaceChart({ grouped, selectedKey, selectedTiming, onSelect }) {
  const [tip, setTip] = useState(null);
  const hourly = grouped.grouping === 'hour';
  const valueOf = (b) => (hourly ? b.total : b.recorded);
  const max = Math.max(...grouped.buckets.map(valueOf), 0);
  const ceiling = Math.max(5, Math.ceil(max / 5) * 5);
  const tipBucket = tip && grouped.buckets.find((b) => b.key === tip.key);
  const steps = labelSteps(grouped.buckets.length);
  const stack = hourly ? STACK_ORDER : STACK_ORDER.filter((t) => t !== 'unknown');

  // Fixed-position tooltip anchored to the column and clamped to the viewport, so the
  // chart's horizontal scroll container never clips it.
  const show = (bucket, el) => {
    const rect = el.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110);
    setTip({ key: bucket.key, left, top: rect.top + 28 });
  };

  return (
    <div
      className={`mo-count-chart${hourly ? ' mo-hour-chart' : ''}`}
      aria-label={hourly ? 'Stacked chart of deliveries by scheduled hour' : 'Stacked chart of early, on-time and late deliveries'}
    >
      {tipBucket && <BucketTooltip bucket={tipBucket} style={{ left: tip.left, top: tip.top }} />}
      <div className="mo-y-axis" aria-hidden="true">
        {[4, 3, 2, 1, 0].map((i) => <span key={i}>{fmt(Math.round((ceiling * i) / 4))}</span>)}
      </div>
      <div className="mo-chart-scroll" onScroll={() => setTip(null)}>
        <div
          className="mo-count-columns"
          role="group"
          aria-label="Focus a period for exact counts, select one to filter the table"
          onPointerLeave={() => setTip(null)}
        >
          {grouped.buckets.map((bucket, index) => {
            const selected = selectedKey === bucket.key;
            const value = valueOf(bucket);
            return (
              <div
                key={bucket.key}
                className={`mo-chart-column${selected ? ' mo-selected' : ''}`}
                onPointerEnter={(e) => show(bucket, e.currentTarget)}
              >
                <div className="mo-bar-track">
                  <div className="mo-stack" style={{ height: `${(value / ceiling) * 100}%` }}>
                    {stack.filter((t) => bucket[t] > 0).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`mo-segment mo-${t}`}
                        style={{ height: `${(bucket[t] / value) * 100}%` }}
                        aria-label={`${bucketLabel(bucket)}: ${fmt(bucket[t])} ${TIMING_LABELS[t]} deliveries`}
                        aria-pressed={selected && selectedTiming === t}
                        onFocus={(e) => show(bucket, e.currentTarget)}
                        onBlur={() => setTip(null)}
                        onClick={(e) => { show(bucket, e.currentTarget); onSelect(t, bucket); }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className={`mo-period-label${index % steps.wide ? ' mo-skip' : ''}${index % steps.narrow ? ' mo-skip-p' : ''}`}
                  aria-label={`${bucketLabel(bucket)}: ${fmt(bucket.recorded)} recorded, ${fmt(bucket.unknown)} without timing`}
                  aria-pressed={selected && selectedTiming === 'all'}
                  onFocus={(e) => show(bucket, e.currentTarget)}
                  onBlur={() => setTip(null)}
                  onClick={(e) => { show(bucket, e.currentTarget); onSelect('all', bucket); }}
                >
                  {axisLabel(bucket, grouped.grouping)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default WorkspaceChart;
