import React from 'react';
import { dubaiToday, dayLabel } from '../../../utils/deliveryTimingModel';

function OperationsOverviewHeader({ onOpenComms, onAddIncident, onViewToday }) {
  return (
    <header className="mo-page-head">
      <div>
        <h1 className="mo-title">Today's operations</h1>
        <p className="mo-today-date">Today · {dayLabel(dubaiToday(), true)}</p>
        <p className="mo-subtitle">Delivery performance, bag balances and team updates.</p>
      </div>
      <div className="mo-head-actions">
        <button type="button" className="mo-btn" onClick={onAddIncident}>+ Report incident</button>
        <button type="button" className="mo-btn" onClick={onOpenComms}>Communication</button>
        <button type="button" className="mo-btn mo-primary" onClick={onViewToday}>View today ↓</button>
      </div>
    </header>
  );
}

export default OperationsOverviewHeader;
