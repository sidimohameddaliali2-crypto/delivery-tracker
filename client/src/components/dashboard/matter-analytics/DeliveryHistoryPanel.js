import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api';
import { InfoTip, CardMenu } from './DashboardBits';
import {
  PRESETS, TIMING_LABELS, dubaiToday, rangeFor, summarize, groupDays,
  periodLabel, shortDayLabel, dayLabel, recordsToCsv, downloadCsv,
} from '../../../utils/deliveryTimingModel';

const fmt = (n) => Number(n).toLocaleString('en-GB');
const TIMINGS = ['early', 'on', 'late'];
const PAGE_SIZE = 25;
const stampFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const stamp = (value) => (value ? stampFmt.format(new Date(value)) : '—');
const Dot = ({ timing }) => <i className={`mo-dot mo-${timing}`} aria-hidden="true" />;

function bucketAxisLabel(bucket, grouping) {
  if (grouping === 'month') return bucket.start.slice(0, 7);
  return shortDayLabel(bucket.start);
}

function BucketTooltip({ bucket, style }) {
  return (
    <div className="mo-tooltip" role="tooltip" style={style}>
      <strong>{periodLabel(bucket)}</strong>
      {TIMINGS.map((t) => (
        <span key={t}><Dot timing={t} />{TIMING_LABELS[t]}<b>{fmt(bucket[t])}</b></span>
      ))}
      <span>Recorded timing<b>{fmt(bucket.recorded)}</b></span>
      <span>Without timing<b>{fmt(bucket.unknown)}</b></span>
      <span>Total deliveries<b>{fmt(bucket.total)}</b></span>
    </div>
  );
}

const EXPORT_LIMIT = 10000;

function CountChart({ grouped, activeKey, onActivate, onOpen }) {
  const [tip, setTip] = useState(null);
  const armedKey = useRef(null);
  const previewOnly = useRef(false);
  const max = Math.max(...grouped.buckets.map((b) => b.recorded), 0);
  const ceiling = Math.max(5, Math.ceil(max / 5) * 5);
  const tipBucket = tip && grouped.buckets.find((b) => b.key === tip.key);

  // Fixed-position tooltip anchored to the hovered/focused column, clamped to the viewport,
  // so the chart's horizontal scroll container never clips it.
  const show = (bucket, el) => {
    onActivate(bucket.key);
    const rect = el.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110);
    setTip({ key: bucket.key, left, top: rect.top + 28 });
  };

  // Touch: the first tap on a bar previews it (tooltip + selection), a second tap opens its records.
  const press = (bucket, e) => {
    if (e.pointerType === 'touch') {
      previewOnly.current = armedKey.current !== bucket.key;
      armedKey.current = bucket.key;
    } else {
      previewOnly.current = false;
    }
  };
  const activate = (bucket, timing, e) => {
    if (previewOnly.current) {
      previewOnly.current = false;
      show(bucket, e.currentTarget);
      return;
    }
    onOpen(timing, bucket);
  };

  return (
    <div className="mo-count-chart" aria-label="Stacked chart of early, on-time and late deliveries">
      {tipBucket && <BucketTooltip bucket={tipBucket} style={{ left: tip.left, top: tip.top }} />}
      <div className="mo-y-axis" aria-hidden="true">
        {[4, 3, 2, 1, 0].map((i) => <span key={i}>{fmt(Math.round((ceiling * i) / 4))}</span>)}
      </div>
      <div className="mo-chart-scroll" onScroll={() => setTip(null)}>
        <div
          className="mo-count-columns"
          role="group"
          aria-label="Focus or select a period for exact counts"
          onPointerLeave={() => setTip(null)}
        >
          {grouped.buckets.map((bucket) => (
            <div
              key={bucket.key}
              className={`mo-chart-column${activeKey === bucket.key ? ' mo-active' : ''}`}
              onPointerEnter={(e) => show(bucket, e.currentTarget)}
            >
              <div className="mo-bar-track">
                <div className="mo-stack" style={{ height: `${(bucket.recorded / ceiling) * 100}%` }}>
                  {['late', 'on', 'early'].filter((t) => bucket[t] > 0).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`mo-segment mo-${t}`}
                      style={{ height: `${(bucket[t] / bucket.recorded) * 100}%` }}
                      aria-label={`${periodLabel(bucket)}: ${fmt(bucket[t])} ${TIMING_LABELS[t]} deliveries`}
                      onFocus={(e) => show(bucket, e.currentTarget)}
                      onBlur={() => setTip(null)}
                      onPointerDown={(e) => press(bucket, e)}
                      onClick={(e) => activate(bucket, t, e)}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="mo-period-label"
                aria-label={`${periodLabel(bucket)}: ${fmt(bucket.recorded)} recorded, ${fmt(bucket.unknown)} awaiting update`}
                aria-pressed={activeKey === bucket.key}
                onFocus={(e) => show(bucket, e.currentTarget)}
                onBlur={() => setTip(null)}
                onPointerDown={(e) => press(bucket, e)}
                onClick={(e) => activate(bucket, 'all', e)}
              >
                {bucketAxisLabel(bucket, grouped.grouping)}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecordsDialog({ scope, onClose }) {
  const [timing, setTiming] = useState(scope.timing);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const params = useMemo(() => ({
    start: scope.range.start, end: scope.range.end, timing, search: query,
  }), [scope.range.start, scope.range.end, timing, query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/deliveries/timing-records', { params: { ...params, page, limit: PAGE_SIZE } })
      .then((res) => { if (!cancelled) setData(res.data?.data || null); })
      .catch(() => { if (!cancelled) setError('Could not load delivery records.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params, page]);

  const exportMatching = async () => {
    setExporting(true);
    try {
      setNotice('');
      const res = await api.get('/deliveries/timing-records', { params: { ...params, page: 1, limit: EXPORT_LIMIT } });
      const records = res.data?.data?.records || [];
      const matching = res.data?.data?.total || 0;
      downloadCsv(`deliveries-${scope.range.start}_${scope.range.end}.csv`, recordsToCsv(records));
      if (matching > records.length) {
        setNotice(`Export limited to the first ${fmt(records.length)} of ${fmt(matching)} matching records. Narrow the dates or filters to export the rest.`);
      }
    } catch {
      setError('Could not export delivery records.');
    } finally {
      setExporting(false);
    }
  };

  const total = data?.total || 0;
  const records = data?.records || [];
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal" role="dialog" aria-modal="true" aria-label="Delivery records">
        <div className="mo-modal-head">
          <div>
            <h2>Delivery records</h2>
            <p>{periodLabel(scope.range)} · Dubai time</p>
          </div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        <div className="mo-record-tools">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or ID"
            aria-label="Search delivery records"
          />
          <label>
            Timing
            <select value={timing} onChange={(e) => { setTiming(e.target.value); setPage(1); }} aria-label="Record timing">
              <option value="all">All records</option>
              {Object.entries(TIMING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button type="button" className="mo-btn" disabled={!total || exporting} onClick={exportMatching}>
            {exporting ? 'Exporting…' : '↓ Export matching'}
          </button>
        </div>
        <p className="mo-record-count">{loading ? 'Loading…' : `${fmt(total)} matching records`}</p>
        {error && <p className="mo-error" role="alert">{error}</p>}
        {notice && <p className="mo-notice" role="status">{notice}</p>}
        {!error && !loading && !records.length && <div className="mo-context-empty">No records match this selection.</div>}
        {records.length > 0 && (
          <div className="mo-table-scroll mo-record-table">
            <table>
              <thead>
                <tr><th>Customer</th><th>Status</th><th>Timing</th><th>Scheduled</th><th>Delivered</th><th>Variance</th></tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.customerName || '—'}</strong><small>{r.customerId || ''}</small></td>
                    <td>{r.status || '—'}</td>
                    <td><span className={`mo-timing-pill mo-pill-${r.timing}`}>{TIMING_LABELS[r.timing]}</span></td>
                    <td>{stamp(r.scheduledTime)}</td>
                    <td>{stamp(r.deliveredTime)}</td>
                    <td>{r.varianceMinutes == null ? '—' : `${r.varianceMinutes > 0 ? '+' : ''}${r.varianceMinutes} min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mo-record-pagination">
          <span>{total ? `Showing ${fmt(first)}–${fmt(last)} of ${fmt(total)}` : 'No records to display'}</span>
          <div>
            <button type="button" className="mo-btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" className="mo-btn" disabled={!data || page >= data.pages || loading} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
        <p className="mo-record-note">
          Variance is delivered time minus scheduled time. Early means more than 180 minutes ahead of the scheduled time.
        </p>
      </div>
    </div>
  );
}

function DeliveryHistoryPanel({ panelRef, today, presetRequest }) {
  const [preset, setPreset] = useState('30');
  const [custom, setCustom] = useState({ start: today, end: today });
  const [appliedCustom, setAppliedCustom] = useState({ start: today, end: today });
  const [dateError, setDateError] = useState('');
  const [days, setDays] = useState([]);
  const [lateness, setLateness] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [threshold, setThreshold] = useState(30);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeKey, setActiveKey] = useState(null);
  const [scope, setScope] = useState(null);
  const lastRequest = useRef(presetRequest);

  // "View today" in the page header asks this panel to jump to today.
  useEffect(() => {
    if (presetRequest !== lastRequest.current) {
      lastRequest.current = presetRequest;
      setPreset('today');
      setActiveKey(null);
      setDateError('');
    }
  }, [presetRequest]);

  const range = useMemo(() => {
    try { return rangeFor(preset, today, appliedCustom); } catch { return rangeFor('30', today); }
  }, [preset, today, appliedCustom]);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/deliveries/timing-history', { params: { start: range.start, end: range.end } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data || {};
        setDays(data.days || []);
        setLateness(data.lateness || null);
        setUpdatedAt(data.updatedAt || null);
      })
      .catch(() => {
        if (cancelled) return;
        setDays([]);
        setLateness(null);
        setUpdatedAt(null);
        setError('Could not load delivery history.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  useEffect(() => load(), [load]);

  const summary = useMemo(() => summarize(days), [days]);
  const grouped = useMemo(() => groupDays(days, range), [days, range]);
  const focused = grouped.buckets.find((b) => b.key === activeKey);
  const exact = focused || summary;
  const exactRange = focused || range;

  const openRecords = (timing = 'all', target = range) => {
    setScope({ range: { start: target.start, end: target.end }, timing });
  };
  const closeRecords = useCallback(() => setScope(null), []);

  const exportPeriod = async () => {
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const res = await api.get('/deliveries/timing-records', {
        params: { start: range.start, end: range.end, timing: 'all', page: 1, limit: EXPORT_LIMIT },
      });
      const records = res.data?.data?.records || [];
      const matching = res.data?.data?.total || 0;
      downloadCsv(`deliveries-${range.start}_${range.end}.csv`, recordsToCsv(records));
      if (matching > records.length) {
        setNotice(`Export limited to the first ${fmt(records.length)} of ${fmt(matching)} deliveries. Choose a shorter date range to export the rest.`);
      }
    } catch {
      setError('Could not export delivery records.');
    } finally {
      setExporting(false);
    }
  };

  const firstDay = days[0]?.day;
  const lastDay = days[days.length - 1]?.day;
  const updatedLabel = updatedAt
    ? `${new Date(updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })} Dubai`
    : 'time unavailable';

  const choose = (next) => { setPreset(next); setActiveKey(null); setDateError(''); };
  const applyCustom = (event) => {
    event.preventDefault();
    try {
      rangeFor('custom', today, custom);
      setAppliedCustom({ ...custom });
      setActiveKey(null);
      setDateError('');
    } catch (e) {
      setDateError(e.message);
    }
  };

  return (
    <section ref={panelRef} className="mo-panel" aria-label="Delivery performance">
      <div className="mo-panel-head">
        <div>
          <h2>Delivery performance <InfoTip text="Early, on-time and late deliveries by scheduled day, from live delivery records. Deliveries without a recorded outcome are excluded from the chart and rate." /></h2>
          <p>Early, on-time and late deliveries by scheduled day · Asia/Dubai</p>
        </div>
        <CardMenu
          label="Delivery performance options"
          items={[
            { label: 'View records', disabled: !summary.total, onSelect: () => openRecords('all') },
            { label: 'Export CSV', disabled: !summary.total || exporting, onSelect: exportPeriod },
          ]}
        />
      </div>

      <div className="mo-range-toolbar">
        <div role="group" aria-label="Delivery history timeframe" className="mo-ranges">
          {PRESETS.map(([value, label]) => (
            <button type="button" key={value} aria-pressed={preset === value} onClick={() => choose(value)}>{label}</button>
          ))}
        </div>
        <button type="button" className="mo-btn" disabled={!summary.total || exporting} onClick={exportPeriod}>
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {preset === 'custom' && (
        <form className="mo-custom-range" onSubmit={applyCustom}>
          <label>From
            <input aria-label="History start date" type="date" required max={today} value={custom.start}
              onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
          </label>
          <label>To
            <input aria-label="History end date" type="date" required max={today} value={custom.end}
              onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
          </label>
          <button className="mo-btn mo-primary" type="submit">Apply dates</button>
          {dateError && <p className="mo-error" role="alert">{dateError}</p>}
        </form>
      )}

      {notice && <p className="mo-notice" role="status">{notice}</p>}

      {error && <p className="mo-error" role="alert">{error} <button type="button" className="mo-text-link" onClick={load}>Retry</button></p>}

      <div className={`mo-summary${loading ? ' mo-loading' : ''}`} aria-live="polite">
        <button className="mo-period-stat" type="button" onClick={() => openRecords('all')}>
          <span>Total deliveries</span>
          <strong>{summary.total ? fmt(summary.total) : '—'}</strong>
          <small>Includes deliveries awaiting an update</small>
          <span className="mo-text-link">View records →</span>
        </button>
        <button className="mo-period-stat" type="button" onClick={() => openRecords('on')}>
          <span><Dot timing="on" />On-time rate</span>
          <strong>{summary.onTimeRate == null ? '—' : `${summary.onTimeRate.toFixed(1)}%`}</strong>
          <small>{summary.recorded ? `Of ${fmt(summary.recorded)} recorded outcomes` : 'No recorded timing denominator'}</small>
          <span className="mo-text-link">View on-time records →</span>
        </button>
        <button className="mo-period-stat" type="button" onClick={() => openRecords('late')}>
          <span><Dot timing="late" />Late deliveries</span>
          <strong className="mo-late-value">{summary.recorded ? fmt(summary.late) : '—'}</strong>
          <small>Delivered after the scheduled time</small>
          <span className="mo-text-link">View late records →</span>
        </button>
        <button className="mo-coverage-stat" type="button" onClick={() => openRecords('unknown')}>
          <strong>{fmt(summary.unknown)} awaiting update</strong>
          <small>Excluded from the chart and rate</small>
          <span className="mo-text-link">View records without timing →</span>
        </button>
      </div>

      <div className="mo-impact">
        <span>Timing detail <strong>{fmt(summary.recorded)} / {fmt(summary.total)}</strong> records</span>
        <span>Median reported lateness <strong>{lateness?.median == null ? '—' : `${fmt(lateness.median)} min`}</strong></span>
        <label>
          Over
          <select aria-label="Lateness threshold" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
            {[15, 30, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
          : <strong>{lateness ? fmt(lateness.over?.[threshold] ?? 0) : '—'}</strong>
        </label>
      </div>

      <details className="mo-definitions">
        <summary>Timing definitions</summary>
        <p>
          Outcomes use each delivery's scheduled time and its actual delivered time (Dubai). A delivery is early when it arrived more than
          180 minutes before the scheduled time, late when it arrived after it, and on time otherwise. Deliveries that are not yet marked
          delivered have no outcome and are excluded from the chart, the on-time rate and the lateness measures. Lateness is delivered time
          minus scheduled time in whole minutes.
        </p>
      </details>

      <div className="mo-chart-heading">
        <div>
          <strong>{grouped.grouping === 'day' ? 'Daily' : grouped.grouping === 'week' ? 'Weekly' : 'Monthly'} recorded counts</strong>
          <p>{periodLabel(range)}</p>
        </div>
        <span>Number of deliveries</span>
      </div>
      <p className="mo-chart-note">
        {preset !== 'today' && preset !== 'all' && preset !== 'custom' && 'Complete days before today. '}
        {grouped.grouping === 'week' && 'Monday–Sunday buckets; edge weeks are clipped to the selected dates. '}
        {grouped.grouping === 'month' && 'Calendar-month totals; edge months are clipped to the selected dates. '}
        Only periods with deliveries appear. Bar height counts only deliveries with a recorded outcome. Hover a bar for counts, click a segment to open its records.
      </p>

      {summary.recorded ? (
        <CountChart grouped={grouped} activeKey={activeKey} onActivate={setActiveKey} onOpen={openRecords} />
      ) : (
        <div className="mo-empty-chart">
          <h3>{loading ? 'Loading delivery history…' : error ? 'Delivery history is unavailable' : summary.total ? 'Timing is not yet available' : 'No deliveries in this period'}</h3>
          <p>{error ? 'Use Retry above to try again.' : summary.total ? 'Deliveries without an outcome stay in the total; performance is unavailable.' : 'Pick a different date range.'}</p>
        </div>
      )}

      <div className="mo-chart-legend">
        {TIMINGS.map((t) => <span key={t}><Dot timing={t} />{TIMING_LABELS[t]}</span>)}
      </div>

      <div className="mo-exact" aria-live="polite">
        <strong>{focused ? 'Selected bucket' : 'Selected period'} · {periodLabel(exactRange)}</strong>
        <div>
          {TIMINGS.map((t) => (
            <button key={t} type="button" onClick={() => openRecords(t, exactRange)}>
              <Dot timing={t} />{TIMING_LABELS[t]} <b>{fmt(exact[t])}</b>
            </button>
          ))}
          <button type="button" onClick={() => openRecords('unknown', exactRange)}>
            Without timing <b>{fmt(exact.unknown)}</b>
          </button>
        </div>
        {focused && <button type="button" className="mo-text-link" onClick={() => setActiveKey(null)}>Show period totals</button>}
      </div>

      <details className="mo-exact-table">
        <summary>View exact data table</summary>
        <div className="mo-table-scroll">
          <table>
            <thead>
              <tr><th>Period</th><th>Early</th><th>On time</th><th>Late</th><th>Recorded</th><th>Without timing</th></tr>
            </thead>
            <tbody>
              {grouped.buckets.map((bucket) => (
                <tr key={bucket.key}>
                  <td><button type="button" className="mo-text-link" onClick={() => openRecords('all', bucket)}>{periodLabel(bucket)}</button></td>
                  <td>{fmt(bucket.early)}</td>
                  <td>{fmt(bucket.on)}</td>
                  <td>{fmt(bucket.late)}</td>
                  <td>{fmt(bucket.recorded)}</td>
                  <td>{fmt(bucket.unknown)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="mo-data-coverage">
        {firstDay ? `Available dates in range: ${dayLabel(firstDay)}${lastDay !== firstDay ? ` – ${dayLabel(lastDay)}` : ''}` : 'No dated records in range'}
        {' · '}Updated {updatedLabel}
      </p>

      {scope && <RecordsDialog scope={scope} onClose={closeRecords} />}
    </section>
  );
}

export default DeliveryHistoryPanel;
