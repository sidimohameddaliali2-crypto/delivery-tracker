import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBags } from '../../../store/slices/bagSlice';
import api from '../../../utils/api';
import { dubaiToday } from '../../../utils/deliveryTimingModel';
import { FLAGGED_BAG_THRESHOLD } from './communications/constants';
import '../../../styles/matterDashboard.css';

import OperationsOverviewHeader from './OperationsOverviewHeader';
import TodayStrip from './TodayStrip';
import DeliveryHistoryPanel from './DeliveryHistoryPanel';
import BagLifecycleAnalyticsCard from './BagLifecycleAnalyticsCard';
import TeamUpdates from './TeamUpdates';
import IncidentsDialog from './IncidentsDialog';
import AddIncidentModal from './AddIncidentModal';
import CommunicationsCenterModal from './communications/CommunicationsCenterModal';
import QuickNewCommunicationModal from './communications/QuickNewCommunicationModal';

function MatterAnalyticsDashboard() {
  const dispatch = useDispatch();
  const { bags = [] } = useSelector((state) => state.bag || {});

  // Dubai "today" (refreshed when the tab regains focus) and a counter the
  // "View today" buttons bump to reset the history panel to Today.
  const [dubaiDay, setDubaiDay] = useState(dubaiToday);
  const [viewTodayRequest, setViewTodayRequest] = useState(0);
  const historyPanelRef = useRef(null);

  // Today's { total, incomplete } from /deliveries/timing-history.
  const [todayStats, setTodayStats] = useState(null);

  const [incidents, setIncidents] = useState([]);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showIncidentsList, setShowIncidentsList] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    vehicleType: 'bike',
    incidentType: 'accident',
    description: '',
  });
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);
  const [incidentError, setIncidentError] = useState('');

  const [openIssuesPreview, setOpenIssuesPreview] = useState([]);
  const [issuesPreviewLoading, setIssuesPreviewLoading] = useState(false);
  const [isCommsModalOpen, setIsCommsModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  useEffect(() => {
    const update = () => setDubaiDay(dubaiToday());
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);

  const viewToday = useCallback(() => {
    setDubaiDay(dubaiToday());
    setViewTodayRequest((n) => n + 1);
    historyPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    dispatch(fetchBags({ page: 1, limit: 5000 }));
  }, [dispatch]);

  // Same endpoint (and Dubai-day boundaries) as the history panel, so the strip and the
  // panel's "Today" preset always show the same numbers.
  useEffect(() => {
    let cancelled = false;
    api.get('/deliveries/timing-history', { params: { start: dubaiDay, end: dubaiDay } })
      .then((res) => {
        if (cancelled) return;
        const day = res.data?.data?.days?.[0];
        setTodayStats({ total: day?.total || 0, incomplete: day?.unknown || 0 });
      })
      .catch((error) => { if (!cancelled) { setTodayStats(null); console.error('Failed to load today stats:', error); } });
    return () => { cancelled = true; };
  }, [dubaiDay]);

  const fetchIncidents = useCallback(async () => {
    try {
      // Only open incidents are shown, so don't pull the whole history.
      const response = await api.get('/incidents', { params: { status: 'open' } });
      setIncidents(response.data?.incidents || []);
    } catch (error) {
      console.error('Failed to load incidents:', error);
    }
  }, []);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const fetchIssuesPreview = useCallback(async () => {
    setIssuesPreviewLoading(true);
    try {
      const res = await api.get('/delivery-issues?status=open');
      const issues = res.data?.issues || [];
      setOpenIssuesPreview(issues.filter((i) => i.priority === 'high' || i.priority === 'medium'));
    } catch (error) {
      console.error('Failed to load delivery issues:', error);
    } finally {
      setIssuesPreviewLoading(false);
    }
  }, []);

  useEffect(() => { fetchIssuesPreview(); }, [fetchIssuesPreview]);

  const handleIncidentSubmit = async (event) => {
    event.preventDefault();
    if (!incidentForm.date || !incidentForm.vehicleType || !incidentForm.incidentType) {
      setIncidentError('Please fill in date, vehicle type, and incident type');
      return;
    }
    setIncidentSubmitting(true);
    setIncidentError('');
    try {
      await api.post('/incidents', {
        date: `${incidentForm.date}T00:00:00`,
        vehicleType: incidentForm.vehicleType,
        incidentType: incidentForm.incidentType,
        description: incidentForm.description,
      });
      setIncidentForm((prev) => ({ ...prev, description: '' }));
      await fetchIncidents();
      setShowIncidentModal(false);
    } catch (error) {
      const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Failed to create incident';
      setIncidentError(message);
    } finally {
      setIncidentSubmitting(false);
    }
  };

  const incidentsMetrics = useMemo(() => {
    const open = incidents.filter((i) => i.status !== 'resolved');
    return {
      count: open.length,
      high: open.filter((i) => i.incidentType === 'accident').length,
      medium: open.filter((i) => i.incidentType === 'not_working').length,
    };
  }, [incidents]);

  const assignedBagsCount = useMemo(
    () => (bags || []).filter((bag) => (bag?.status || '').toLowerCase() === 'assigned').length,
    [bags]
  );
  const remainingBagsCount = Math.max(0, 1000 - assignedBagsCount);

  const flaggedCustomers = useMemo(() => {
    if (!Array.isArray(bags) || bags.length === 0) return [];
    const customerMap = new Map();
    bags.forEach((bag) => {
      const customer = bag?.assignedTo?.customer;
      if (!customer) return;
      const trimmedId = customer.customerId?.trim();
      const trimmedName = customer.customerName?.trim();
      const keySource = trimmedId || trimmedName;
      if (!keySource) return;
      const key = keySource.toLowerCase();
      if (!customerMap.has(key)) {
        customerMap.set(key, { key, customerId: trimmedId || null, customerName: trimmedName || 'Unnamed Customer', bags: [] });
      }
      customerMap.get(key).bags.push(bag);
    });
    return Array.from(customerMap.values())
      .filter((entry) => entry.bags.length >= FLAGGED_BAG_THRESHOLD)
      .sort((a, b) => b.bags.length - a.bags.length);
  }, [bags]);

  const openCommsModal = () => setIsCommsModalOpen(true);
  const openIncidentModal = () => setShowIncidentModal(true);

  return (
    <div className="matter-analytics p-4 sm:p-6 space-y-4 sm:space-y-6 min-h-screen">
      <OperationsOverviewHeader
        onOpenComms={openCommsModal}
        onAddIncident={openIncidentModal}
        onViewToday={viewToday}
      />

      <TodayStrip
        stats={todayStats}
        openIncidents={incidentsMetrics.count}
        onViewToday={viewToday}
        onViewIncidents={() => setShowIncidentsList(true)}
      />

      <DeliveryHistoryPanel panelRef={historyPanelRef} today={dubaiDay} presetRequest={viewTodayRequest} />

      <BagLifecycleAnalyticsCard
        assignedCount={assignedBagsCount}
        remainingCount={remainingBagsCount}
        flaggedCustomers={flaggedCustomers}
      />

      <TeamUpdates
        incidents={incidentsMetrics}
        issues={openIssuesPreview}
        issuesLoading={issuesPreviewLoading}
        onAddIncident={openIncidentModal}
        onViewIncidents={() => setShowIncidentsList(true)}
        onOpenComms={openCommsModal}
        onNewCommunication={() => setIsQuickAddOpen(true)}
      />

      {showIncidentsList && (
        <IncidentsDialog
          incidents={incidents}
          onClose={() => setShowIncidentsList(false)}
          onChanged={fetchIncidents}
          onReport={() => { setShowIncidentsList(false); openIncidentModal(); }}
        />
      )}

      {showIncidentModal && (
        <AddIncidentModal
          form={incidentForm}
          onChange={setIncidentForm}
          onSubmit={handleIncidentSubmit}
          submitting={incidentSubmitting}
          error={incidentError}
          onClose={() => setShowIncidentModal(false)}
        />
      )}

      {isCommsModalOpen && (
        <CommunicationsCenterModal
          onClose={() => { setIsCommsModalOpen(false); fetchIssuesPreview(); }}
        />
      )}

      {isQuickAddOpen && (
        <QuickNewCommunicationModal
          onClose={() => setIsQuickAddOpen(false)}
          onSubmitted={() => fetchIssuesPreview()}
        />
      )}
    </div>
  );
}

export default MatterAnalyticsDashboard;
