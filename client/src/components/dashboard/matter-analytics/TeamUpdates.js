import React from 'react';

const fmt = (n) => Number(n).toLocaleString('en-GB');

function TeamUpdates({ incidents, issues, issuesLoading, onAddIncident, onViewIncidents, onOpenComms, onNewCommunication }) {
  return (
    <section className="mo-other-ops" aria-labelledby="mo-team-title">
      <h2 id="mo-team-title">Team updates</h2>
      <div className="mo-team-updates">
        <section>
          <div>
            <h3>Incidents</h3>
            <p>{fmt(incidents.count)} active · High {incidents.high} · Medium {incidents.medium}</p>
          </div>
          <div className="mo-head-actions">
            <button type="button" className="mo-btn" onClick={onViewIncidents}>View incidents</button>
            <button type="button" className="mo-btn" onClick={onAddIncident}>Report incident</button>
          </div>
        </section>
        <section>
          <div>
            <h3>Communications</h3>
            <p>{issuesLoading ? 'Loading…' : issues.length ? `${fmt(issues.length)} open high/medium issues` : 'No open communications.'}</p>
          </div>
          <div className="mo-head-actions">
            <button type="button" className="mo-btn" onClick={onOpenComms}>View all</button>
            <button type="button" className="mo-btn" onClick={onNewCommunication}>New communication</button>
          </div>
        </section>
      </div>
    </section>
  );
}

export default TeamUpdates;
