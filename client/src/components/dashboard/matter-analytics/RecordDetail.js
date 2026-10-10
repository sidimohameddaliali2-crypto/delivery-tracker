import React, { useEffect, useRef } from 'react';
import { TIMING_LABELS } from '../../../utils/deliveryTimingModel';
import { Dot } from './WorkspaceChart';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const stamp = (value) => (value ? `${timeFmt.format(new Date(value))} Dubai` : '—');
const icon = (name) => <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;

export function TimingPill({ value }) {
  return <span className={`mo-timing-pill mo-pill-${value}`}><Dot timing={value} />{TIMING_LABELS[value]}</span>;
}

export function RecordDetails({ record: r, updatedLabel, onCustomer }) {
  const variance = r.varianceMinutes == null ? '—' : `${r.varianceMinutes > 0 ? '+' : ''}${r.varianceMinutes} min`;
  const facts = [
    ['event', 'Scheduled · Dubai', stamp(r.scheduledTime)],
    ['schedule', 'Actual delivery · Dubai', stamp(r.deliveredTime)],
    ['error_outline', 'Reported timing', TIMING_LABELS[r.timing]],
    ['bar_chart', 'Reported variance', variance],
    ['location_on', 'Zone', r.zone || '—'],
    ['person', 'Driver', r.driverName || '—'],
    ['inventory_2', 'Record status', r.status || '—'],
    ['badge', 'Customer ID', r.customerId || '—'],
  ];
  return (
    <div className="mo-detail-body">
      <div className="mo-detail-name">
        <h3>{r.customerName || 'Name unavailable'}</h3>
        <TimingPill value={r.timing} />
      </div>
      <p className="mo-record-id">Record ID · {r._id}</p>
      <dl className="mo-detail-facts">
        {facts.map(([name, label, value]) => (
          <div key={label}>{icon(name)}<div><dt>{label}</dt><dd>{value}</dd></div></div>
        ))}
      </dl>
      <div className="mo-detail-source">
        {icon('database')}
        <div><strong>Data source</strong><p>Live delivery records</p><small>Updated {updatedLabel}</small></div>
      </div>
      <p className="mo-unavailable">{icon('info')}Unavailable values are shown as —. Timing compares the delivered time with the scheduled time.</p>
      <button type="button" className="mo-btn mo-wide" disabled={!r.customerId} onClick={onCustomer}>
        {icon('group')} View customer records
      </button>
    </div>
  );
}

// Non-modal companion panel on wide screens; focus stays on the originating row.
export function RecordPanel({ onClose, ...props }) {
  const previous = useRef(null);
  const recordId = props.record._id;
  useEffect(() => {
    previous.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous.current?.isConnected) previous.current.focus({ preventScroll: true });
    };
  }, [recordId, onClose]);
  return (
    <aside className="mo-detail" aria-label="Delivery record">
      <header>
        <h2>Delivery record</h2>
        <button type="button" aria-label="Close delivery record" onClick={onClose}>{icon('close')}</button>
      </header>
      <RecordDetails {...props} />
    </aside>
  );
}

// Focused dialog on phones and tablets.
export function RecordDialog({ onClose, ...props }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal mo-modal-narrow" role="dialog" aria-modal="true" aria-label="Delivery record">
        <div className="mo-modal-head">
          <h2>Delivery record</h2>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        <RecordDetails {...props} />
      </div>
    </div>
  );
}
