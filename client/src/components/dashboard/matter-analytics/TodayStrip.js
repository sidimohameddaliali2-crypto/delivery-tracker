import React from 'react';
import { InfoTip, CardMenu } from './DashboardBits';

const fmt = (n) => Number(n).toLocaleString('en-GB');

function TodayStrip({ stats, openIncidents, onViewToday, onViewIncidents }) {
  const loaded = Boolean(stats);
  const total = stats?.total || 0;
  const awaiting = stats?.incomplete || 0;
  const recorded = loaded ? total - awaiting : 0;
  return (
    <>
      <div className="mo-today-strip">
        <section className="mo-today-main" aria-label="Today at a glance">
          <div className="mo-card-title">
            <h2>Today at a glance <InfoTip text="Today's deliveries by Dubai calendar day, from the live delivery records." /></h2>
            <CardMenu label="Today at a glance options" items={[{ label: "View today's deliveries", onSelect: onViewToday }]} />
          </div>
          <div className="mo-today-deliveries">
            <button type="button" className="mo-glance-stat" onClick={onViewToday}>
              <span>Deliveries today</span>
              <strong>{loaded ? fmt(total) : '—'}</strong>
              <small>{loaded ? 'Scheduled for today' : 'No records available for today'}</small>
            </button>
            <button type="button" className="mo-glance-stat" onClick={onViewToday}>
              <span>Awaiting update</span>
              <strong>{loaded ? fmt(awaiting) : '—'}</strong>
              <small>Without recorded timing</small>
            </button>
          </div>
        </section>
        <section className="mo-glance-stat mo-incident-glance" aria-label="Active incidents">
          <span>Active incidents</span>
          <strong>{fmt(openIncidents)}</strong>
          <small>Open reports</small>
          <button type="button" className="mo-text-link" onClick={onViewIncidents}>View open incidents →</button>
        </section>
      </div>
      <p className="mo-info">
        {loaded
          ? `${fmt(recorded)} of ${fmt(total)} deliveries scheduled for today have a recorded outcome.`
          : "Today's delivery figures are loading."}
      </p>
    </>
  );
}

export default TodayStrip;
