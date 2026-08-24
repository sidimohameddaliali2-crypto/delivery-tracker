import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchLateEarlyDeliveries } from '../../../store/slices/deliverySlice';
import { fetchBags } from '../../../store/slices/bagSlice';
import api from '../../../utils/api';
import { FLAGGED_BAG_THRESHOLD } from './communications/constants';

import ActiveCommunicationsPanel from './ActiveCommunicationsPanel';
import OperationsOverviewHeader from './OperationsOverviewHeader';
import MetricCardsRow from './MetricCardsRow';
import DeliveryVarianceChart from './DeliveryVarianceChart';
import ZonePerformanceCard from './ZonePerformanceCard';
import BagLifecycleAnalyticsCard from './BagLifecycleAnalyticsCard';
import DeliveryEfficiencyCard from './DeliveryEfficiencyCard';
import AddIncidentModal from './AddIncidentModal';
import CommunicationsCenterModal from './communications/CommunicationsCenterModal';
import QuickNewCommunicationModal from './communications/QuickNewCommunicationModal';
import ResolveModal from './communications/ResolveModal';

function formatLocalDateTime(date, endOfDay = false) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (endOfDay) return `${year}-${month}-${day}T23:59:59.999`;
  return `${year}-${month}-${day}T00:00:00`;
}

function isSameDay(iso, ref) {
  if (!iso) return false;
  return new Date(iso).toDateString() === ref.toDateString();
}

function MatterAnalyticsDashboard() {
  const dispatch = useDispatch();
  const { lateEarlyDeliveries = [], lateEarlyStats = {} } = useSelector((state) => state.delivery || {});
  const { bags = [] } = useSelector((state) => state.bag || {});

  // 8-day window of DELIVERED items (today + prior 7 days), for the "today vs
  // yesterday" trend, the 7-day sparkline, and the Delivery Variance chart.
  // Deliberately NOT the generic `/deliveries` list (used by fetchDeliveries) —
  // that endpoint sorts ascending by scheduledTime and caps at 500 records
  // server-side, so with any real history it silently returns the OLDEST 500
  // deliveries ever, never today's. /deliveries/late-early has no such cap.
  const [chartDeliveries, setChartDeliveries] = useState([]);

  // Today's and yesterday's full /deliveries/late-early stats (total, avgEarlyTime,
  // avgLateTime, ...), for the "Total Deliveries Today" headline + trend and the
  // Delivery Efficiency time trends. Independent of chartDeliveries (delivered-only)
  // and of the Filter selector — these always mean literally today vs. yesterday.
  const [todayStats, setTodayStats] = useState(null);
  const [yesterdayStats, setYesterdayStats] = useState(null);

  const [timeRange, setTimeRange] = useState('1day');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);

  const [showIncidentModal, setShowIncidentModal] = useState(false);
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
  const [resolvingIssue, setResolvingIssue] = useState(null);

  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = new Date(today);
    let endDate = new Date(today);

    if (timeRange === 'custom') {
      if (customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        endDate = new Date(customEndDate);
      }
    } else if (timeRange === '1week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '1month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    const endDateExclusive = new Date(endDate);
    endDateExclusive.setDate(endDateExclusive.getDate() + 1);
    return { startDate, endDateExclusive };
  }, [timeRange, customStartDate, customEndDate]);

  // Late/early delivery stats + zone breakdown for the selected range
  useEffect(() => {
    if (timeRange === 'custom' && (!customStartDate || !customEndDate)) return;
    const { startDate, endDateExclusive } = dateRange;
    const endDate = new Date(endDateExclusive);
    endDate.setMilliseconds(endDate.getMilliseconds() - 1);

    dispatch(fetchLateEarlyDeliveries({
      startDate: formatLocalDateTime(startDate),
      endDate: formatLocalDateTime(endDate, true),
      type: 'all',
    }));
  }, [dispatch, timeRange, customStartDate, customEndDate, dateRange]);

  useEffect(() => {
    dispatch(fetchBags({ page: 1, limit: 5000 }));
  }, [dispatch]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 7);

    api.get('/deliveries/late-early', {
      params: {
        startDate: formatLocalDateTime(windowStart),
        endDate: formatLocalDateTime(today, true),
        type: 'all',
      },
    }).then((res) => setChartDeliveries(res.data?.deliveries || []))
      .catch((error) => console.error('Failed to load chart deliveries:', error));
  }, []);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dayStats = (day) => api.get('/deliveries/late-early', {
      params: {
        startDate: formatLocalDateTime(day),
        endDate: formatLocalDateTime(day, true),
        type: 'all',
      },
    }).then((res) => res.data?.stats || null);

    Promise.all([dayStats(today), dayStats(yesterday)])
      .then(([todayResult, yesterdayResult]) => {
        setTodayStats(todayResult);
        setYesterdayStats(yesterdayResult);
      })
      .catch((error) => console.error('Failed to load today/yesterday stats:', error));
  }, []);

  const fetchIncidents = useCallback(async () => {
    if (timeRange === 'custom' && (!customStartDate || !customEndDate)) return;
    setIncidentsLoading(true);
    try {
      const { startDate, endDateExclusive } = dateRange;
      const endDate = new Date(endDateExclusive);
      endDate.setMilliseconds(endDate.getMilliseconds() - 1);
      const response = await api.get('/incidents', {
        params: {
          startDate: formatLocalDateTime(startDate),
          endDate: formatLocalDateTime(endDate, true),
        },
      });
      setIncidents(response.data?.incidents || []);
    } catch (error) {
      console.error('Failed to load incidents:', error);
    } finally {
      setIncidentsLoading(false);
    }
  }, [dateRange, timeRange, customStartDate, customEndDate]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const fetchIssuesPreview = useCallback(async () => {
    setIssuesPreviewLoading(true);
    try {
      const res = await api.get('/delivery-issues?status=open');
      const issues = res.data?.issues || [];
      const ranked = issues
        .filter((i) => i.priority === 'high' || i.priority === 'medium')
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      setOpenIssuesPreview(ranked);
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
        date: formatLocalDateTime(new Date(incidentForm.date)),
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

  // Total deliveries today + trend vs. yesterday + 7-day sparkline.
  // total/trendPct use todayTotal/yesterdayTotal (ALL statuses, see effect above)
  // so the trend reflects real scheduling volume, not just what's been delivered
  // so far today. The sparkline still uses delivered-only chartDeliveries — a
  // separate "completed volume" shape, not meant to match the headline number.
  const totalDeliveriesMetrics = useMemo(() => {
    const today = new Date();
    const todayTotal = todayStats?.total || 0;
    const yesterdayTotal = yesterdayStats?.total || 0;
    const trendPct = yesterdayTotal
      ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
      : (todayTotal > 0 ? 100 : 0);

    const sparkline = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const count = chartDeliveries.filter((d) => isSameDay(d.scheduledTime, day)).length;
      sparkline.push({ day: day.toDateString(), count });
    }

    return {
      total: todayTotal,
      trendPct,
      sparkline,
    };
  }, [chartDeliveries, todayStats, yesterdayStats]);

  // "2.1m improvement" / "1.4m increase" style trend for the Delivery
  // Efficiency card's avg early/late time tiles — a smaller average today
  // than yesterday is an improvement, a larger one is an increase.
  // avgEarlyTime/avgLateTime default to 0 when a day has zero early/late
  // deliveries — that's "no data", not a real average of 0 — so a trend is
  // only shown when BOTH days actually had at least one such delivery.
  const efficiencyTrends = useMemo(() => {
    const buildTrend = (todayAvg, todayCount, yesterdayAvg, yesterdayCount) => {
      if (!todayCount || !yesterdayCount) return null;
      const delta = yesterdayAvg - todayAvg;
      if (delta === 0) return null;
      const label = `${Math.abs(delta).toFixed(1)}m ${delta > 0 ? 'improvement' : 'increase'}`;
      return { label, up: delta > 0 };
    };
    return {
      early: buildTrend(todayStats?.avgEarlyTime, todayStats?.early, yesterdayStats?.avgEarlyTime, yesterdayStats?.early),
      late: buildTrend(todayStats?.avgLateTime, todayStats?.late, yesterdayStats?.avgLateTime, yesterdayStats?.late),
    };
  }, [todayStats, yesterdayStats]);

  const deliverySplit = useMemo(() => {
    const total = lateEarlyStats.total || 0;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    return {
      earlyPct: pct(lateEarlyStats.early || 0),
      onTimePct: pct(lateEarlyStats.onTime || 0),
      latePct: pct(lateEarlyStats.late || 0),
      // stats.incomplete = deliveries in range not yet marked 'delivered' —
      // i.e. status hasn't been updated to a final state.
      notUpdatedPct: pct(lateEarlyStats.incomplete || 0),
    };
  }, [lateEarlyStats]);

  // Ported from the old dashboard's Performance Status gauge: deviation =
  // early% + late% (distance from a perfectly on-time day), bucketed into
  // the same three tiers.
  const performanceStatus = useMemo(() => {
    const deviation = deliverySplit.earlyPct + deliverySplit.latePct;
    if (deviation < 10) return 'excellent';
    if (deviation < 25) return 'good';
    return 'needsImprovement';
  }, [deliverySplit]);

  const incidentsMetrics = useMemo(() => {
    const openIncidents = incidents.filter((i) => i.status !== 'resolved');
    const high = openIncidents.filter((i) => i.incidentType === 'accident').length;
    const medium = openIncidents.filter((i) => i.incidentType === 'not_working').length;
    // No day-over-day trend: showing one would require a second /incidents request per
    // load, and the connection budget is already tight (see MongoDB connection note).
    return { count: openIncidents.length, high, medium, trend: null };
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

  return (
    <div className="matter-analytics p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 min-h-screen">
      <ActiveCommunicationsPanel
        issues={openIssuesPreview}
        loading={issuesPreviewLoading}
        onViewAll={openCommsModal}
        onNewCommunication={() => setIsQuickAddOpen(true)}
        onSelectIssue={setResolvingIssue}
      />

      <OperationsOverviewHeader
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomStartDateChange={setCustomStartDate}
        onCustomEndDateChange={setCustomEndDate}
        onOpenComms={openCommsModal}
        exportRows={lateEarlyDeliveries}
      />

      <MetricCardsRow
        totalDeliveries={totalDeliveriesMetrics}
        deliverySplit={deliverySplit}
        incidents={{ ...incidentsMetrics, onAddIncident: () => setShowIncidentModal(true) }}
        performanceStatus={performanceStatus}
      />

      <div className="grid grid-cols-12 gap-4">
        <DeliveryVarianceChart deliveries={chartDeliveries} />
        <ZonePerformanceCard lateEarlyDeliveries={lateEarlyDeliveries} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <BagLifecycleAnalyticsCard
          assignedCount={assignedBagsCount}
          remainingCount={remainingBagsCount}
          flaggedCustomers={flaggedCustomers}
        />
        <DeliveryEfficiencyCard
          avgEarlyTime={lateEarlyStats.avgEarlyTime || 0}
          earlyVolume={lateEarlyStats.early || 0}
          avgLateTime={lateEarlyStats.avgLateTime || 0}
          lateVolume={lateEarlyStats.late || 0}
          earlyTrend={efficiencyTrends.early}
          lateTrend={efficiencyTrends.late}
        />
      </div>

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

      {resolvingIssue && (
        <ResolveModal
          issue={resolvingIssue}
          onClose={() => setResolvingIssue(null)}
          onResolved={() => { setResolvingIssue(null); fetchIssuesPreview(); }}
        />
      )}
    </div>
  );
}

export default MatterAnalyticsDashboard;
