import React from 'react';

const fmt = (n) => Number(n).toLocaleString('en-GB');

function TeamUpdates({ incidents, issues, issuesLoading, onAddIncident, onViewIncidents, onOpenComms, onNewCommunication }) {
  return (
    <div className="mo-team-updates">
      <section>
        <div>
          <h2>Incidents</h2>
          <p>{fmt(incidents.count)} active · High {incidents.high} · Medium {incidents.medium}</p>
        </div>
        <div className="mo-head-actions">
          <button type="button" className="mo-btn" onClick={onViewIncidents}>View incidents</button>
          <button type="button" className="mo-btn" onClick={onAddIncident}>Report incident</button>
        </div>
      </section>
      <section>
        <div>
          <h2>Communications</h2>
          <p>{issuesLoading ? 'Loading…' : issues.length ? `${fmt(issues.length)} open high/medium issues` : 'No open communications.'}</p>
        </div>
        <div className="mo-head-actions">
          <button type="button" className="mo-btn" onClick={onNewCommunication}>New</button>
          <button type="button" className="mo-btn" onClick={onOpenComms}>View all</button>
        </div>
      </section>
    </div>
  );
}

export default TeamUpdates;
