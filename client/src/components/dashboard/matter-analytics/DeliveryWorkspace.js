import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../../../utils/api';
import { InfoTip, CardMenu } from './DashboardBits';
import WorkspaceChart, { Dot } from './WorkspaceChart';
import { RecordPanel, RecordDialog, TimingPill } from './RecordDetail';
import {
  PRESETS, TIMING_LABELS, TIMING_TABS, MISSING_VALUE, rangeFor, shiftDay, summarize, groupDays,
  groupHours, periodLabel, bucketLabel, dayLabel, recordsToCsv, downloadCsv,
} from '../../../utils/deliveryTimingModel';

const fmt = (n) => Number(n).toLocaleString('en-GB');
const PAGE_SIZE = 6;
const EXPORT_LIMIT = 10000;
const DAY_MS = 86400000;
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const updatedFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const icon = (name) => <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
const EMPTY_FILTERS = { zone: '', driver: '', status: '' };
const spanDays = (range) => Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / DAY_MS) + 1;

function DateDialog({ range, today, onApply, onClose }) {
  const [custom, setCustom] = useState({ start: range.start, end: range.end });
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const apply = (event) => {
    event.preventDefault();
    try {
      onApply(rangeFor('custom', today, custom));
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mo-modal mo-modal-narrow" role="dialog" aria-modal="true" aria-label="Choose delivery dates" onSubmit={apply}>
        <div className="mo-modal-head">
          <div><h2>Choose delivery dates</h2><p>Select a day or an inclusive date range.</p></div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        <div className="mo-form">
          <div className="mo-form-grid">
            <label className="mo-field">From
              <input type="date" required max={today} value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
            </label>
            <label className="mo-field">To
              <input type="date" required max={today} value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
            </label>
          </div>
          {error && <p className="mo-error" role="alert">{error}</p>}
          <div className="mo-form-actions">
            <button type="button" className="mo-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="mo-btn mo-primary">Apply dates</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function DeliveryWorkspace({ today, children }) {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState({ start: today, end: today });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [timing, setTiming] = useState('all');
  const [selection, setSelection] = useState(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [threshold, setThreshold] = useState(30);
  const [editingDates, setEditingDates] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width:1199px)').matches);

  const [overview, setOverview] = useState({ days: [], hours: null, lateness: null, facets: { zones: [], drivers: [], statuses: [] }, updatedAt: null });
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');
  const [table, setTable] = useState(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState('');
  const tablePanel = useRef(null);
  // The app's top bar offers a slot for the date navigation (see Layout); without it the
  // controls render inside the page header instead.
  const [slot, setSlot] = useState(null);
  useEffect(() => { setSlot(document.getElementById('mo-header-slot')); }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width:1199px)');
    const onChange = (e) => setNarrow(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const range = useMemo(() => {
    try { return rangeFor(preset, today, custom); } catch { return rangeFor('today', today); }
  }, [preset, today, custom]);

  const apiFilters = useMemo(() => {
    const out = {};
    if (query) out.search = query;
    Object.entries(filters).forEach(([key, value]) => { if (value) out[key] = value; });
    return out;
  }, [query, filters]);
  const filtersKey = JSON.stringify(apiFilters);
  const hasFilters = Boolean(search || filters.zone || filters.driver || filters.status);

  // A new period or filter set starts a clean selection; the table returns to page 1.
  useEffect(() => { setSelection(null); setTiming('all'); }, [range.start, range.end]);
  useEffect(() => { setPage(1); setSelected(null); }, [range.start, range.end, filtersKey, timing, selection?.key]);

  const loadOverview = useCallback(() => {
    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError('');
    api.get('/deliveries/timing-history', { params: { start: range.start, end: range.end, ...apiFilters } })
      .then((res) => { if (!cancelled) setOverview(res.data?.data || {}); })
      .catch(() => {
        if (cancelled) return;
        setOverview((prev) => ({ ...prev, days: [], hours: null, lateness: null, updatedAt: null }));
        setOverviewError('Could not load delivery data.');
      })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [range.start, range.end, filtersKey]);
  useEffect(() => loadOverview(), [loadOverview]);

  const tableParams = useMemo(() => ({
    start: selection?.start || range.start,
    end: selection?.end || range.end,
    ...(selection?.hour != null ? { hour: selection.hour } : {}),
    timing,
    ...apiFilters,
  }), [selection, range.start, range.end, timing, apiFilters]);

  const loadTable = useCallback(() => {
    let cancelled = false;
    setTableLoading(true);
    setTableError('');
    api.get('/deliveries/timing-records', { params: { ...tableParams, page, limit: PAGE_SIZE } })
      .then((res) => { if (!cancelled) setTable(res.data?.data || null); })
      .catch(() => { if (!cancelled) { setTable(null); setTableError('Could not load delivery records.'); } })
      .finally(() => { if (!cancelled) setTableLoading(false); });
    return () => { cancelled = true; };
  }, [tableParams, page]);
  useEffect(() => loadTable(), [loadTable]);

  const days = overview.days || [];
  const summary = useMemo(() => summarize(days), [days]);
  const grouped = useMemo(
    () => (range.start === range.end && overview.hours ? groupHours(overview.hours, range.start) : groupDays(days, range)),
    [days, overview.hours, range]
  );
  const facets = overview.facets || { zones: [], drivers: [], statuses: [] };
  const updatedLabel = overview.updatedAt ? `${updatedFmt.format(new Date(overview.updatedAt))} Dubai` : 'time unavailable';
  const chartHasData = grouped.grouping === 'hour' ? summary.total : summary.recorded;

  const records = table?.records || [];
  const tableTotal = table?.total || 0;
  const tableCounts = table?.counts || { early: 0, on: 0, late: 0, unknown: 0, total: 0 };
  const tableRecorded = tableCounts.early + tableCounts.on + tableCounts.late;
  const tablePeriod = selection ? bucketLabel(selection) : periodLabel(range);
  const multiDay = !selection && range.start !== range.end;
  const singleRange = range.start === range.end;

  const showTable = () => {
    const node = tablePanel.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const selectRecords = (category = 'all', bucket = null, scroll = false) => {
    setSelection(bucket ? {
      key: bucket.key, start: bucket.start, end: bucket.end,
      ...(bucket.hourStart !== undefined ? { hour: bucket.hour, hourStart: bucket.hourStart, hourEnd: bucket.hourEnd } : {}),
    } : null);
    setTiming(category);
    setPage(1);
    setSelected(null);
    if (scroll) showTable();
  };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setSearch(''); setQuery(''); setTiming('all'); setSelection(null); };

  const choosePreset = (value) => { setPreset(value); };
  const applyDates = (dates) => {
    setEditingDates(false);
    if (dates.start === dates.end && dates.start === today) setPreset('today');
    else { setCustom(dates); setPreset('custom'); }
  };
  const nextRange = (direction) => {
    const length = spanDays(range);
    return { start: shiftDay(range.start, direction * length), end: shiftDay(range.end, direction * length) };
  };
  const step = (direction) => {
    const shifted = nextRange(direction);
    if (preset === 'all' || shifted.end > today) return;
    applyDates(shifted);
  };

  const exportRecords = async (params, name) => {
    setExporting(true);
    setNotice('');
    try {
      const res = await api.get('/deliveries/timing-records', { params: { ...params, page: 1, limit: EXPORT_LIMIT } });
      const rows = res.data?.data?.records || [];
      const matching = res.data?.data?.total || 0;
      downloadCsv(`${name}-${params.start}_${params.end}.csv`, recordsToCsv(rows));
      if (matching > rows.length) {
        setNotice(`Export limited to the first ${fmt(rows.length)} of ${fmt(matching)} matching deliveries. Choose a shorter date range or narrower filters to export the rest.`);
      }
    } catch {
      setNotice('Could not export delivery records.');
    } finally {
      setExporting(false);
    }
  };
  const exportOverview = () => exportRecords({ start: range.start, end: range.end, timing: 'all', ...apiFilters }, 'delivery-overview');
  const exportTable = () => exportRecords(tableParams, 'delivery-records');

  const periodButtonLabel = periodLabel(range);
  const metrics = [
    ['all', 'Total deliveries', summary.total ? fmt(summary.total) : '—', 'inventory_2', ''],
    ['on', 'On-time rate', summary.onTimeRate == null ? '—' : `${summary.onTimeRate.toFixed(1)}%`, 'check_circle',
      summary.recorded ? `${fmt(summary.on)} of ${fmt(summary.recorded)} timed records` : 'Timing denominator unavailable'],
    ['late', 'Late deliveries', summary.recorded ? fmt(summary.late) : '—', 'error_outline', ''],
    ['unknown', 'Timing unavailable', summary.total ? fmt(summary.unknown) : '—', 'schedule', ''],
  ];

  const detailProps = selected && {
    record: selected,
    updatedLabel,
    onCustomer: () => navigate('/customers', { state: { search: selected.customerId } }),
    onClose: () => setSelected(null),
  };

  const dateControls = (
    <div className="mo-ws-controls" role="group" aria-label="Delivery date navigation">
      <span className="mo-tz">Dubai time</span>
      <button
        type="button"
        className="mo-btn mo-step"
        aria-label={singleRange ? 'Previous day' : 'Previous period'}
        disabled={preset === 'all'}
        onClick={() => step(-1)}
      >{icon('chevron_left')}</button>
      <CardMenu
        label="Delivery period"
        className="mo-period-menu"
        trigger={({ open, toggle }) => (
          <button type="button" className="mo-btn mo-period-trigger" aria-label={`Delivery period: ${periodButtonLabel}`} aria-expanded={open} onClick={toggle}>
            {icon('calendar_month')}<span>{periodButtonLabel}</span>{icon('expand_more')}
          </button>
        )}
        items={[
          ...PRESETS.map(([value, label]) => ({
            label, subtext: preset === value ? 'Selected period' : undefined, onSelect: () => choosePreset(value),
          })),
          { label: 'Choose dates…', onSelect: () => setEditingDates(true) },
        ]}
      />
      <button
        type="button"
        className="mo-btn mo-step"
        aria-label={singleRange ? 'Next day' : 'Next period'}
        disabled={preset === 'all' || nextRange(1).end > today}
        onClick={() => step(1)}
      >{icon('chevron_right')}</button>
    </div>
  );

  return (
    <div className={`mo-ws-layout${selected && !narrow ? ' mo-with-detail' : ''}`}>
      <div className="mo-ws-main">
        <header className="mo-ws-head">
          <div>
            <h1 className="mo-title">Delivery overview</h1>
            <p className="mo-subtitle">{singleRange ? 'Selected day' : 'Selected period'} · Asia/Dubai</p>
          </div>
          <div className="mo-ws-head-actions">
            {!slot && dateControls}
            <button type="button" className="mo-btn" disabled={!summary.total || exporting} onClick={exportOverview}>
              {icon('download')} {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </header>

        {notice && <p className="mo-notice" role="status">{notice}</p>}
        {overviewError && (
          <p className="mo-error" role="alert">{overviewError} <button type="button" className="mo-text-link" onClick={loadOverview}>Retry</button></p>
        )}

        <div className={`mo-metrics${overviewLoading ? ' mo-loading' : ''}`} aria-live="polite">
          {metrics.map(([category, label, value, iconName, note]) => (
            <button key={category} type="button" className={`mo-metric mo-metric-${category}`} onClick={() => selectRecords(category, null, true)}>
              <span className="mo-metric-icon">{icon(iconName)}</span>
              <span>
                <span className="mo-metric-label">{label}</span>
                <strong>{value}</strong>
                {note && <small>{note}</small>}
              </span>
            </button>
          ))}
        </div>

        <div className="mo-coverage">
          {icon('info')}
          <strong>Timing coverage</strong>
          <span>{summary.total ? `${fmt(summary.recorded)} of ${fmt(summary.total)} records have accepted timing` : 'No records available for this selection'}</span>
          <button type="button" disabled={!summary.total} onClick={() => selectRecords('unknown', null, true)}>View missing timing {icon('arrow_forward')}</button>
        </div>

        <section className="mo-panel mo-records-panel" ref={tablePanel} tabIndex={-1} aria-label="Delivery records table">
          <div className="mo-panel-head">
            <div>
              <h2>Delivery records <InfoTip text="The selected chart period and timing tabs narrow this table only. Date, search, zone, driver and status filters also apply to the metrics and chart." /></h2>
            </div>
            <CardMenu
              label="Delivery records options"
              items={[{ label: 'Export records', disabled: !tableTotal || exporting, onSelect: exportTable }]}
            />
          </div>
          <div className="mo-table-scope" aria-live="polite" aria-atomic="true">
            <strong>{fmt(tableTotal)} deliveries{timing !== 'all' ? ` · ${TIMING_LABELS[timing]}` : ''}</strong>
            <span>{tablePeriod} · Dubai time</span>
          </div>
          <div className="mo-table-context">
            <span>Period coverage: {fmt(tableRecorded)} of {fmt(tableCounts.total)} timed · {fmt(tableCounts.unknown)} missing timing</span>
            {selection && (
              <div className="mo-selection-chip">
                {icon('filter_alt')}<span>{bucketLabel(selection)} · Table only</span>
                <button type="button" aria-label="Clear chart selection" onClick={() => selectRecords()}>{icon('close')}</button>
              </div>
            )}
          </div>
          <div className="mo-timing-tabs" role="group" aria-label="Table timing filter">
            {TIMING_TABS.map(([value, label]) => (
              <button type="button" key={value} aria-pressed={timing === value} onClick={() => setTiming(value)}>{label}</button>
            ))}
          </div>
          <div className="mo-filters">
            <label className="mo-search">
              {icon('search')}
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records…" aria-label="Search delivery records" />
            </label>
            <select aria-label="Record zone" value={filters.zone} onChange={(e) => setFilters({ ...filters, zone: e.target.value })}>
              <option value="">All zones</option>
              {facets.zones.map((z) => <option key={z} value={z}>{z}</option>)}
              <option value={MISSING_VALUE}>Not supplied</option>
            </select>
            <select aria-label="Record driver" value={filters.driver} onChange={(e) => setFilters({ ...filters, driver: e.target.value })}>
              <option value="">All drivers</option>
              {facets.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value={MISSING_VALUE}>Not supplied</option>
            </select>
            <select aria-label="Record status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {facets.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="mo-btn" disabled={!tableTotal || exporting} onClick={exportTable}>{icon('download')} Export</button>
          </div>
          {hasFilters && (
            <p className="mo-filter-caption">
              Metrics and chart follow search and record filters. Chart selection and timing tabs narrow only this table.{' '}
              <button type="button" className="mo-text-link" onClick={resetFilters}>Clear filters</button>
            </p>
          )}
          {tableError && <p className="mo-error" role="alert">{tableError} <button type="button" className="mo-text-link" onClick={loadTable}>Retry</button></p>}

          {!tableError && records.length > 0 && (
            <div className={`mo-table-scroll mo-ws-table${tableLoading ? ' mo-loading' : ''}`}>
              <table>
                <thead>
                  <tr><th>Customer</th><th>Scheduled · Dubai</th><th>Zone</th><th>Driver</th><th>Timing</th></tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r._id} className={selected?._id === r._id ? 'mo-selected-row' : ''}>
                      <td>
                        <button
                          type="button"
                          aria-label={`View delivery for ${r.customerName || 'unnamed customer'}`}
                          aria-pressed={selected?._id === r._id}
                          onClick={() => setSelected(r)}
                        >{r.customerName || 'Name unavailable'}</button>
                      </td>
                      <td>{multiDay && <small>{dayLabel(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date(r.scheduledTime)))}</small>}{clockFmt.format(new Date(r.scheduledTime))}</td>
                      <td>{r.zone || '—'}</td>
                      <td>{r.driverName || '—'}</td>
                      <td><TimingPill value={r.timing} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!tableError && !tableLoading && records.length === 0 && (
            <div className="mo-empty">
              {icon('search_off')}
              <strong>{tableCounts.total || hasFilters || selection ? 'No records match these filters' : 'No records available for these dates'}</strong>
              <p>
                {selection
                  ? `No matching records for ${bucketLabel(selection)}. The overview range is unchanged.`
                  : tableCounts.total || hasFilters ? 'Try another timing category or clear the record filters.' : 'There are no deliveries scheduled for the selected dates.'}
              </p>
              {selection && <button type="button" className="mo-btn" onClick={() => selectRecords()}>Clear chart selection</button>}
              {!selection && (hasFilters || timing !== 'all') && <button type="button" className="mo-btn" onClick={resetFilters}>Clear filters</button>}
            </div>
          )}
          <div className="mo-pagination">
            <span>{tableTotal ? `Showing ${fmt((page - 1) * PAGE_SIZE + 1)}–${fmt(Math.min(page * PAGE_SIZE, tableTotal))} of ${fmt(tableTotal)}` : 'No matching records'}</span>
            <div>
              <button type="button" className="mo-btn mo-step" aria-label="Previous record page" disabled={page <= 1 || tableLoading} onClick={() => setPage(page - 1)}>{icon('chevron_left')}</button>
              <span>Page {fmt(page)} of {fmt(table?.pages || 1)}</span>
              <button type="button" className="mo-btn mo-step" aria-label="Next record page" disabled={!table || page >= table.pages || tableLoading} onClick={() => setPage(page + 1)}>{icon('chevron_right')}</button>
            </div>
          </div>
        </section>

        <section className="mo-panel mo-chart-panel" aria-label="Delivery chart">
          <div className="mo-panel-head">
            <div>
              <h2>
                {grouped.grouping === 'hour' ? 'Deliveries by scheduled hour' : `${grouped.grouping === 'day' ? 'Daily' : grouped.grouping === 'week' ? 'Weekly' : 'Monthly'} recorded delivery counts`}{' '}
                <InfoTip text="Scheduled Dubai buckets. Only deliveries with a recorded outcome count toward performance; longer-range bar heights exclude deliveries without timing." />
              </h2>
            </div>
          </div>
          <div className="mo-chart-meta">
            <p>
              {periodLabel(range)} · Dubai time<br />
              {grouped.grouping === 'hour' ? 'Scheduled hour; gray records have missing timing' : 'Bar height counts recorded timing only; missing timing remains in table totals'}
            </p>
            <div className="mo-chart-legend">
              {(grouped.grouping === 'hour' ? ['early', 'on', 'late', 'unknown'] : ['early', 'on', 'late']).map((t) => (
                <span key={t}><Dot timing={t} />{TIMING_LABELS[t]}</span>
              ))}
            </div>
          </div>
          {chartHasData ? (
            <WorkspaceChart grouped={grouped} selectedKey={selection?.key} selectedTiming={timing} onSelect={selectRecords} />
          ) : (
            <div className="mo-chart-empty">
              {overviewLoading ? 'Loading delivery data…' : overviewError ? 'Delivery data is unavailable.' : summary.total ? 'Recorded timing is unavailable for this selection.' : 'No deliveries in this selection.'}
            </div>
          )}
          <div className="mo-chart-selection">
            {selection ? (
              <>
                <span><strong>{bucketLabel(selection)}</strong> · {timing === 'all' ? 'All timing categories' : TIMING_LABELS[timing]} · Table only</span>
                <div>
                  <button type="button" className="mo-btn" onClick={showTable}>Show {fmt(tableTotal)} deliveries · {bucketLabel(selection)}</button>
                  <button type="button" className="mo-text-link" onClick={() => selectRecords()}>Clear selection</button>
                </div>
              </>
            ) : <p>Hover for counts. Select a bar segment or date to filter the delivery table.</p>}
          </div>
        </section>

        {children}

        <details className="mo-data-details">
          <summary>Data details · Live delivery records · Updated {updatedLabel}</summary>
          <div>
            <p>Live records from the delivery system, refreshed each time this page loads. Missing timing does not mean undelivered: deliveries not yet marked delivered have no outcome.</p>
            <p>On-time rate uses recorded early, on-time and late outcomes only. A delivery is early when it arrived more than 180 minutes before the scheduled time, late when it arrived after it, and on time otherwise. Lateness is delivered time minus scheduled time in whole minutes.</p>
            <div className="mo-impact">
              <span>Median reported lateness <strong>{overview.lateness?.median == null ? '—' : `${fmt(overview.lateness.median)} min`}</strong></span>
              <label>
                Over
                <select aria-label="Lateness threshold" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
                  {[15, 30, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
                </select>
                : <strong>{overview.lateness ? fmt(overview.lateness.over?.[threshold] ?? 0) : '—'}</strong>
              </label>
            </div>
            <details className="mo-exact-table">
              <summary>View exact data table</summary>
              <div className="mo-table-scroll">
                <table>
                  <thead><tr><th>Period</th><th>Early</th><th>On time</th><th>Late</th><th>Without timing</th></tr></thead>
                  <tbody>
                    {grouped.buckets.map((b) => (
                      <tr key={b.key}>
                        <td><button type="button" className="mo-text-link" onClick={() => selectRecords('all', b, true)}>{b.hourStart ? `${b.hourStart}–${b.hourEnd}` : periodLabel(b)}</button></td>
                        <td>{fmt(b.early)}</td><td>{fmt(b.on)}</td><td>{fmt(b.late)}</td><td>{fmt(b.unknown)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      </div>

      {selected && !narrow && <RecordPanel {...detailProps} />}
      {selected && narrow && <RecordDialog {...detailProps} />}
      {slot && createPortal(<div className="matter-analytics mo-header-controls">{dateControls}</div>, slot)}
      {editingDates && <DateDialog range={range} today={today} onApply={applyDates} onClose={() => setEditingDates(false)} />}
    </div>
  );
}

export default DeliveryWorkspace;
