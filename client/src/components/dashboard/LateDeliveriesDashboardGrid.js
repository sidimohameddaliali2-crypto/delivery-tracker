import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Clock, Calendar, AlertCircle, AlertTriangle, TrendingDown } from 'lucide-react';
import { fetchLateEarlyDeliveries, fetchDeliveries } from '../../store/slices/deliverySlice';
import { fetchBags } from '../../store/slices/bagSlice';
import api from '../../utils/api';

const defaultDashboardLayout = [
  { i: 'header', x: 0, y: 0, w: 12, h: 4 },
  { i: 'incidents', x: 0, y: 4, w: 12, h: 7 },
  { i: 'flaggedBags', x: 0, y: 11, w: 12, h: 6 },
  { i: 'earlyPerDay', x: 0, y: 17, w: 12, h: 7 },
  { i: 'earlyKpis', x: 0, y: 24, w: 12, h: 6 },
  { i: 'missedNotUpdated', x: 0, y: 28, w: 12, h: 4 },
  { i: 'assignedBags', x: 0, y: 32, w: 6, h: 3 },
  { i: 'remainingBags', x: 6, y: 32, w: 6, h: 3 },
  { i: 'mainKpis', x: 0, y: 35, w: 12, h: 9 },
  { i: 'latePerDay', x: 0, y: 40, w: 12, h: 7 },
  { i: 'zones', x: 0, y: 47, w: 12, h: 6 },
  { i: 'summary', x: 0, y: 53, w: 12, h: 10 }
];

const defaultLayoutById = Object.fromEntries(defaultDashboardLayout.map((item) => [item.i, item]));

const collides = (a, b) => {
  if (a.i === b.i) return false;
  if (a.x + a.w <= b.x) return false;
  if (a.x >= b.x + b.w) return false;
  if (a.y + a.h <= b.y) return false;
  if (a.y >= b.y + b.h) return false;
  return true;
};

const resolveCollisions = (items = []) => {
  const placed = [];
  return items.map((item) => {
    let next = { ...item };
    let safety = 0;
    while (placed.some((p) => collides(next, p)) && safety < 1000) {
      const hit = placed.find((p) => collides(next, p));
      next = { ...next, y: (hit?.y || 0) + (hit?.h || 1) };
      safety += 1;
    }
    placed.push(next);
    return next;
  });
};

const sanitizeLayout = (items, cols) => {
  if (!Array.isArray(items)) return [];
  const normalized = items.map((item) => {
    const fallback = defaultLayoutById[item.i] || { w: 2, h: 3, x: 0, y: 0 };
    const width = Number.isFinite(item.w) ? item.w : fallback.w;
    const height = Number.isFinite(item.h) ? item.h : fallback.h;
    const clampedW = Math.max(1, Math.min(width, cols));
    return {
      ...item,
      w: clampedW,
      h: Math.max(fallback.h || 1, height),
      x: Number.isFinite(item.x) ? Math.min(Math.max(item.x, 0), cols - clampedW) : fallback.x,
      y: Number.isFinite(item.y) ? item.y : fallback.y
    };
  });
  return resolveCollisions(normalized);
};

const LateDeliveriesDashboardGrid = () => {
  const dispatch = useDispatch();
  const { lateEarlyDeliveries = [], lateEarlyStats = {}, deliveries = [], isLoading } = useSelector(state => state.delivery || {});
  const { bags = [], isLoading: bagsLoading } = useSelector(state => state.bag || {});
  const [timeRange, setTimeRange] = useState('1day');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const normalizeStoredLayout = (value) => {
    if (!value) return { lg: defaultDashboardLayout };
    const parsed = value;
    if (Array.isArray(parsed)) {
      return {
        lg: sanitizeLayout(parsed, 12),
        md: sanitizeLayout(parsed, 12),
        sm: sanitizeLayout(parsed, 6),
        xs: sanitizeLayout(parsed, 4),
        xxs: sanitizeLayout(parsed, 2)
      };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        lg: sanitizeLayout(Array.isArray(parsed.lg) ? parsed.lg : defaultDashboardLayout, 12),
        md: sanitizeLayout(Array.isArray(parsed.md) ? parsed.md : parsed.lg, 12),
        sm: sanitizeLayout(Array.isArray(parsed.sm) ? parsed.sm : parsed.lg, 6),
        xs: sanitizeLayout(Array.isArray(parsed.xs) ? parsed.xs : parsed.lg, 4),
        xxs: sanitizeLayout(Array.isArray(parsed.xxs) ? parsed.xxs : parsed.lg, 2)
      };
    }
    return { lg: defaultDashboardLayout };
  };

  const layout = { lg: defaultDashboardLayout };
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentError, setIncidentError] = useState('');
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);
  const [incidentDeletingId, setIncidentDeletingId] = useState(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showFlaggedBagsModal, setShowFlaggedBagsModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState(() => ({
    date: new Date().toISOString().slice(0, 10),
    vehicleType: 'bike',
    incidentType: 'accident',
    description: ''
  }));
  const FLAGGED_BAG_THRESHOLD = 3;

  const formatLocalDateTime = (date, endOfDay = false) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (endOfDay) {
      return `${year}-${month}-${day}T23:59:59.999`;
    }
    return `${year}-${month}-${day}T00:00:00`;
  };

  const getColorForAverage = (minutes, type = 'late') => {
    const min = Number(minutes) || 0;

    if (type === 'late') {
      if (min >= 30) return { border: 'red-100', text: 'red-600', icon: 'red-500' };
      if (min >= 11) return { border: 'orange-100', text: 'orange-600', icon: 'orange-500' };
      if (min >= 1) return { border: 'green-100', text: 'green-600', icon: 'green-500' };
    } else {
      if (min >= 30) return { border: 'red-100', text: 'red-600', icon: 'red-500' };
      if (min >= 11) return { border: 'orange-100', text: 'orange-600', icon: 'orange-500' };
      if (min >= 1) return { border: 'green-100', text: 'green-600', icon: 'green-500' };
    }

    return { border: 'gray-100', text: 'gray-600', icon: 'gray-500' };
  };

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate = new Date(today);
    let endDate = new Date(today);

    if (timeRange === 'custom') {
      if (!customStartDate || !customEndDate) return;
      startDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === '1week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '1month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    dispatch(fetchLateEarlyDeliveries({
      startDate: formatLocalDateTime(startDate),
      endDate: formatLocalDateTime(endDate, true),
      type: 'all'
    }));

    dispatch(fetchDeliveries({
      dateRange: 'custom',
      dateFrom: formatLocalDateTime(startDate),
      dateTo: formatLocalDateTime(endDate, true),
      limit: 5000
    }));
  }, [timeRange, customStartDate, customEndDate, dispatch]);

  useEffect(() => {
    dispatch(fetchBags({ page: 1, limit: 5000 }));
  }, [dispatch]);

  // Static layout only; no saved layout hydration.

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


  const formatIncidentDate = (dateStr) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getIncidentLabel = (incident) => {
    const vehicle = incident.vehicleType === 'van' ? 'Van' : 'Bike';
    const type = incident.incidentType === 'not_working' ? 'Not Working' : 'Accident';
    return `${vehicle} ${type}`;
  };

  const getIncidentBadgeClass = (incident) => {
    if (incident.incidentType === 'accident') {
      return 'bg-red-100 text-red-700';
    }
    return 'bg-orange-100 text-orange-700';
  };

  const fetchIncidents = useCallback(async () => {
    try {
      setIncidentsLoading(true);
      setIncidentError('');

      const endDate = new Date(dateRange.endDateExclusive);
      endDate.setMilliseconds(endDate.getMilliseconds() - 1);

      const response = await api.get('/incidents', {
        params: {
          startDate: formatLocalDateTime(dateRange.startDate),
          endDate: formatLocalDateTime(endDate, true)
        }
      });

      setIncidents(response.data?.incidents || []);
    } catch (error) {
      console.error('Failed to load incidents:', error);
      setIncidentError('Failed to load incidents');
    } finally {
      setIncidentsLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDateExclusive]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleIncidentSubmit = async (event) => {
    event.preventDefault();
    if (!incidentForm.date || !incidentForm.vehicleType || !incidentForm.incidentType) {
      setIncidentError('Please fill in date, vehicle type, and incident type');
      return;
    }

    try {
      setIncidentSubmitting(true);
      setIncidentError('');

      const payloadDate = formatLocalDateTime(new Date(incidentForm.date));

      await api.post('/incidents', {
        date: payloadDate,
        vehicleType: incidentForm.vehicleType,
        incidentType: incidentForm.incidentType,
        description: incidentForm.description
      }, {
        timeout: 15000
      });

      setIncidentForm(prev => ({
        ...prev,
        description: ''
      }));
      await fetchIncidents();
      setShowIncidentModal(false);
    } catch (error) {
      console.error('Failed to create incident:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to create incident';
      setIncidentError(message);
    } finally {
      setIncidentSubmitting(false);
    }
  };

  const handleIncidentDelete = async (incidentId) => {
    if (!incidentId) return;
    try {
      setIncidentDeletingId(incidentId);
      setIncidentError('');
      await api.delete(`/incidents/${incidentId}`, { timeout: 15000 });
      await fetchIncidents();
    } catch (error) {
      console.error('Failed to delete incident:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to delete incident';
      setIncidentError(message);
    } finally {
      setIncidentDeletingId(null);
    }
  };

  const lateDeliveriesAnalysis = useMemo(() => {
    const deliveriesData = lateEarlyDeliveries || [];
    const stats = lateEarlyStats || {};

    const totalDeliveries = stats.total || 0;
    const lateCount = stats.late || 0;
    const onTimeCount = stats.onTime || 0;
    const earlyCount = stats.early || 0;

    const latePercentage = totalDeliveries > 0 ? ((lateCount / totalDeliveries) * 100).toFixed(1) : 0;
    const earlyPercentage = totalDeliveries > 0 ? ((earlyCount / totalDeliveries) * 100).toFixed(1) : 0;

    const lateDeliveries = deliveriesData.filter(d => d.deliveryType === 'late');
    const earlyDeliveries = deliveriesData.filter(d => d.deliveryType === 'early');

    const lateDeliveriesByDay = {};
    lateDeliveries.forEach(delivery => {
      const date = new Date(delivery.scheduledTime);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      lateDeliveriesByDay[dateStr] = (lateDeliveriesByDay[dateStr] || 0) + 1;
    });

    const earlyDeliveriesByDay = {};
    earlyDeliveries.forEach(delivery => {
      const date = new Date(delivery.scheduledTime);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      earlyDeliveriesByDay[dateStr] = (earlyDeliveriesByDay[dateStr] || 0) + 1;
    });

    const lateDeliveriesByZone = {};
    lateDeliveries.forEach(delivery => {
      const zone = delivery.zone || delivery.area || 'Unassigned';
      if (!lateDeliveriesByZone[zone]) {
        lateDeliveriesByZone[zone] = { count: 0, totalMinutes: 0 };
      }
      lateDeliveriesByZone[zone].count += 1;
      lateDeliveriesByZone[zone].totalMinutes += Number(delivery.actualLateMinutes || 0);
    });

    const earlyDeliveriesByZone = {};
    earlyDeliveries.forEach(delivery => {
      const zone = delivery.zone || delivery.area || 'Unassigned';
      if (!earlyDeliveriesByZone[zone]) {
        earlyDeliveriesByZone[zone] = { count: 0, totalMinutes: 0 };
      }
      earlyDeliveriesByZone[zone].count += 1;
      earlyDeliveriesByZone[zone].totalMinutes += Number(delivery.earlyMinutes || 0);
    });

    return {
      totalDeliveries,
      lateCount,
      onTimeCount,
      earlyCount,
      latePercentage,
      earlyPercentage,
      avgLateMinutes: stats.avgLateTime || 0,
      avgEarlyMinutes: stats.avgEarlyTime || 0,
      lateDeliveriesByDay,
      earlyDeliveriesByDay,
      lateDeliveriesByZone,
      earlyDeliveriesByZone,
    };
  }, [lateEarlyDeliveries, lateEarlyStats]);

  const statusCounts = useMemo(() => {
    const { startDate, endDateExclusive } = dateRange;
    const inRange = (delivery) => {
      if (!delivery?.scheduledTime) return false;
      const d = new Date(delivery.scheduledTime);
      d.setHours(0, 0, 0, 0);
      return d >= startDate && d < endDateExclusive;
    };

    const deliveriesInRange = (deliveries || []).filter(inRange);

    const notUpdatedCount = deliveriesInRange.filter(d =>
      ['assigned'].includes((d.status || '').toLowerCase())
    ).length;

    const missedCount = deliveriesInRange.filter(d =>
      ['failed', 'cancelled'].includes((d.status || '').toLowerCase())
    ).length;

    return { deliveriesInRange, notUpdatedCount, missedCount };
  }, [deliveries, dateRange]);

  const flaggedCustomers = useMemo(() => {
    if (!Array.isArray(bags) || bags.length === 0) {
      return [];
    }

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
        customerMap.set(key, {
          key,
          customerId: trimmedId || null,
          customerName: trimmedName || 'Unnamed Customer',
          bags: []
        });
      }

      customerMap.get(key).bags.push(bag);
    });

    return Array.from(customerMap.values())
      .filter(entry => entry?.bags?.length >= FLAGGED_BAG_THRESHOLD)
      .sort((a, b) => b.bags.length - a.bags.length);
  }, [bags]);

  const assignedBagsCount = useMemo(() => {
    return (bags || []).filter(bag => (bag?.status || '').toLowerCase() === 'assigned').length;
  }, [bags]);

  const remainingBagsCount = useMemo(() => {
    return Math.max(0, 1000 - assignedBagsCount);
  }, [assignedBagsCount]);

  const timeRangeOptions = [
    { key: '1day', label: '1 Day', icon: '📅' },
    { key: '1week', label: '1 Week', icon: '📊' },
    { key: '1month', label: '1 Month', icon: '📈' },
    { key: 'custom', label: 'Custom Range', icon: '📆' }
  ];

  const totalDeliveries = lateDeliveriesAnalysis?.totalDeliveries || 0;
  const lateCount = lateDeliveriesAnalysis?.lateCount || 0;
  const earlyCount = lateDeliveriesAnalysis?.earlyCount || 0;
  const missedCount = statusCounts.missedCount || 0;
  const notUpdatedCount = statusCounts.notUpdatedCount || 0;
  const adjustedOnTime = Math.max(
    0,
    totalDeliveries - lateCount - earlyCount - missedCount - notUpdatedCount
  );

  const safeAnalysis = {
    totalDeliveries,
    lateCount,
    earlyCount,
    missedCount,
    notUpdatedCount,
    onTimeCount: adjustedOnTime,
    latePercentage: lateDeliveriesAnalysis?.latePercentage || 0,
    earlyPercentage: lateDeliveriesAnalysis?.earlyPercentage || 0,
    avgLateMinutes: lateDeliveriesAnalysis?.avgLateMinutes || 0,
    avgEarlyMinutes: lateDeliveriesAnalysis?.avgEarlyMinutes || 0,
    lateDeliveriesByDay: lateDeliveriesAnalysis?.lateDeliveriesByDay || {},
    earlyDeliveriesByDay: lateDeliveriesAnalysis?.earlyDeliveriesByDay || {},
    lateDeliveriesByZone: lateDeliveriesAnalysis?.lateDeliveriesByZone || {},
    earlyDeliveriesByZone: lateDeliveriesAnalysis?.earlyDeliveriesByZone || {},
  };

  const performanceDeviation = Number(safeAnalysis.latePercentage) + Number(safeAnalysis.earlyPercentage);


  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <motion.div
            className="flex items-center space-x-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="w-8 h-8 border-4 border-red-200 border-t-red-500 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <span className="text-gray-600 font-medium">Loading late and early deliveries data...</span>
          </motion.div>
        </div>
      )}

      {/* static container replaces grid; preserves order and spacing */}
      <div className="space-y-6">
        <div key="header" className="h-full">
          <motion.div 
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 h-full"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-red-500 rounded-lg">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Late and Early Delivery Analytics</h1>
                  <p className="text-sm text-gray-600">Track and analyze delivery performance</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {timeRangeOptions.map(({ key, label, icon }) => (
                  <motion.button
                    key={key}
                    onClick={() => setTimeRange(key)}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                      timeRange === key
                        ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>{icon} {label}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {timeRange === 'custom' && (
              <motion.div
                className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
                {(!customStartDate || !customEndDate) && (
                  <p className="text-sm text-amber-600 mt-2">Please select both start and end dates</p>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>

        <div key="incidents" className="h-full">
          <motion.div
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-rose-500 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Incidents</h2>
                  <p className="text-sm text-gray-600">Bike or van incidents for the selected range</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                  {incidents.length} incident{incidents.length === 1 ? '' : 's'}
                </div>
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(true)}
                  className="bg-rose-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-rose-600 transition-colors"
                >
                  Add Incident
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {incidentsLoading ? (
                  <div className="flex items-center space-x-2 text-gray-600">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <span className="text-sm">Loading incidents...</span>
                  </div>
                ) : incidentError ? (
                  <div className="text-sm text-red-600">{incidentError}</div>
                ) : incidents.length === 0 ? (
                  <div className="text-sm text-gray-500">No incidents recorded for this date range.</div>
                ) : (
                  <div className="space-y-3">
                    {incidents.map((incident) => (
                      <div
                        key={incident._id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {getIncidentLabel(incident)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatIncidentDate(incident.date)}
                          </div>
                          {incident.description && (
                            <div className="text-xs text-gray-600 mt-1">
                              {incident.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getIncidentBadgeClass(incident)}`}>
                            {incident.incidentType === 'not_working' ? 'Not Working' : 'Accident'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleIncidentDelete(incident._id)}
                            disabled={incidentDeletingId === incident._id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
                          >
                            {incidentDeletingId === incident._id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        <div key="earlyPerDay" className="h-full">
            <motion.div 
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
            >
              <h2 className="text-lg font-bold text-gray-900 mb-6">Early Deliveries Per Day</h2>
              
              <div className="space-y-4">
                {Object.entries(safeAnalysis.earlyDeliveriesByDay)
                  .sort((a, b) => {
                    const dateA = new Date(a[0]);
                    const dateB = new Date(b[0]);
                    return dateA - dateB;
                  })
                  .map(([day, count], index) => {
                    const maxCount = Math.max(...Object.values(safeAnalysis.earlyDeliveriesByDay));
                    const percentage = (count / maxCount) * 100;
                    
                    return (
                      <motion.div
                        key={day}
                        className="space-y-2"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-700">{day}</span>
                          <span className="text-sm font-bold text-yellow-600">{count} early deliveries</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <motion.div
                            className="bg-gradient-to-r from-yellow-500 to-amber-500 h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.8, delay: index * 0.05 + 0.2 }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            </motion.div>
          </div>

        <div key="earlyKpis" className="h-full">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <div className="bg-white rounded-xl shadow-lg border border-yellow-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Early Deliveries</h3>
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="text-4xl font-bold text-yellow-600">{safeAnalysis.earlyCount}</div>
              <p className="text-xs text-gray-500 mt-2">deliveries early</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-amber-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Early %</h3>
                <TrendingDown className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-4xl font-bold text-amber-600">{safeAnalysis.earlyPercentage}%</div>
              <p className="text-xs text-gray-500 mt-2">of total deliveries</p>
            </div>

            <div className={`bg-white rounded-xl shadow-lg border border-${getColorForAverage(safeAnalysis.avgEarlyMinutes, 'early').border} p-6 hover:shadow-xl transition-shadow`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Avg Early Time</h3>
                <Clock className={`w-5 h-5 text-${getColorForAverage(safeAnalysis.avgEarlyMinutes, 'early').icon}`} />
              </div>
              <div className={`text-4xl font-bold text-${getColorForAverage(safeAnalysis.avgEarlyMinutes, 'early').text}`}>{safeAnalysis.avgEarlyMinutes}m</div>
              <p className="text-xs text-gray-500 mt-2">minutes early</p>
            </div>
          </motion.div>
        </div> 

        <div key="latePerDay" className="h-full">
            <motion.div 
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="text-lg font-bold text-gray-900 mb-6">Late Deliveries Per Day</h2>
              
              <div className="space-y-4">
                {Object.entries(safeAnalysis.lateDeliveriesByDay)
                  .sort((a, b) => {
                    const dateA = new Date(a[0]);
                    const dateB = new Date(b[0]);
                    return dateA - dateB;
                  })
                  .map(([day, count], index) => {
                    const maxCount = Math.max(...Object.values(safeAnalysis.lateDeliveriesByDay));
                    const percentage = (count / maxCount) * 100;
                    
                    return (
                      <motion.div
                        key={day}
                        className="space-y-2"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-700">{day}</span>
                          <span className="text-sm font-bold text-red-600">{count} late deliveries</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <motion.div
                            className="bg-gradient-to-r from-red-500 to-red-600 h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.8, delay: index * 0.05 + 0.2 }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            </motion.div>
        </div> 

        
        
        <div key="mainKpis" className="h-full">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Total Deliveries</h3>
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-4xl font-bold text-gray-900">{safeAnalysis.totalDeliveries}</div>
              <p className="text-xs text-gray-500 mt-2">in selected period</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-red-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Late Deliveries</h3>
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-4xl font-bold text-red-600">{safeAnalysis.lateCount}</div>
              <p className="text-xs text-gray-500 mt-2">deliveries delayed</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-orange-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Late %</h3>
                <TrendingDown className="w-5 h-5 text-orange-500" />
              </div>
              <div className="text-4xl font-bold text-orange-600">{safeAnalysis.latePercentage}%</div>
              <p className="text-xs text-gray-500 mt-2">of total deliveries</p>
            </div>

            <div className={`bg-white rounded-xl shadow-lg border border-${getColorForAverage(safeAnalysis.avgLateMinutes, 'late').border} p-6 hover:shadow-xl transition-shadow`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Avg Late Time</h3>
                <Clock className={`w-5 h-5 text-${getColorForAverage(safeAnalysis.avgLateMinutes, 'late').icon}`} />
              </div>
              <div className={`text-4xl font-bold text-${getColorForAverage(safeAnalysis.avgLateMinutes, 'late').text}`}>{safeAnalysis.avgLateMinutes}m</div>
              <p className="text-xs text-gray-500 mt-2">minutes late</p>
            </div>
          </motion.div>
        </div>

        <div key="missedNotUpdated" className="h-full">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
          >
            <div className="bg-white rounded-xl shadow-lg border border-red-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Missed Deliveries</h3>
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-4xl font-bold text-red-600">{safeAnalysis.missedCount}</div>
              <p className="text-xs text-gray-500 mt-2">failed or cancelled</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm">Not Updated</h3>
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-4xl font-bold text-blue-600">{safeAnalysis.notUpdatedCount}</div>
              <p className="text-xs text-gray-500 mt-2">pending or assigned</p>
            </div>
          </motion.div>
        </div>

        <div key="zones" className="h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <motion.div 
              className="bg-white rounded-xl shadow-md border border-gray-100 p-4 h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
            >
              <h2 className="text-base font-bold text-gray-900 mb-3">Late Deliveries Per Zone</h2>

              <div className="divide-y divide-gray-100">
                {Object.entries(safeAnalysis.lateDeliveriesByZone).length > 0 ? (
                  Object.entries(safeAnalysis.lateDeliveriesByZone)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([zone, data], index) => {
                      const avgMinutes = Math.round(data.totalMinutes / Math.max(1, data.count));
                      const colors = getColorForAverage(avgMinutes, 'late');
                      return (
                        <motion.div
                          key={zone}
                          className="py-2"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">{zone}</span>
                            <span className={`text-sm font-semibold text-${colors.text}`}>
                              {data.count} • {avgMinutes}m
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                      <p className="text-gray-600 font-semibold">No late deliveries</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div 
              className="bg-white rounded-xl shadow-md border border-gray-100 p-4 h-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.27 }}
            >
              <h2 className="text-base font-bold text-gray-900 mb-3">Early Deliveries Per Zone</h2>

              <div className="divide-y divide-gray-100">
                {Object.entries(safeAnalysis.earlyDeliveriesByZone).length > 0 ? (
                  Object.entries(safeAnalysis.earlyDeliveriesByZone)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([zone, data], index) => {
                      const avgMinutes = Math.round(data.totalMinutes / Math.max(1, data.count));
                      const colors = getColorForAverage(avgMinutes, 'early');
                      return (
                        <motion.div
                          key={zone}
                          className="flex items-center justify-between py-2"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <span className="text-sm font-medium text-gray-700">{zone}</span>
                          <span className={`text-sm font-semibold text-${colors.text}`}>
                            {data.count} • {avgMinutes}m
                          </span>
                        </motion.div>
                      );
                    })
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                      <p className="text-gray-600 font-semibold">No early deliveries</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        

        <div key="summary" className="h-full">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-green-900">On-Time Deliveries</h3>
                <div className="text-3xl">✓</div>
              </div>
              <p className="text-4xl font-bold text-green-600 mb-2">{safeAnalysis.onTimeCount}</p>
              <p className="text-sm text-green-700">
                {safeAnalysis.totalDeliveries > 0 
                  ? `${((safeAnalysis.onTimeCount / safeAnalysis.totalDeliveries) * 100).toFixed(1)}% success rate`
                  : 'No deliveries in this period'
                }
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border border-blue-200 p-6">
              <h3 className="text-lg font-bold text-blue-900 mb-4">Performance Status</h3>
              <div className="flex items-center space-x-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg ${
                  performanceDeviation < 10 
                    ? 'bg-green-500 text-white' 
                    : performanceDeviation < 25
                    ? 'bg-yellow-500 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {performanceDeviation.toFixed(1)}%
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Status:</p>
                  <p className="text-lg font-bold text-blue-900">
                    {performanceDeviation < 10 
                      ? '🎯 Excellent' 
                      : performanceDeviation < 25
                      ? '⚠️ Good'
                      : '❌ Needs Improvement'
                    }
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

<div className="flex flex-wrap gap-6">

        <div key="assignedBags" className="h-full">
          <motion.div
            className="bg-white rounded-xl shadow-lg border border-indigo-100 p-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-semibold text-sm">Assigned Bags</h3>
              <AlertTriangle className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-4xl font-bold text-indigo-600">
              {bagsLoading ? '—' : assignedBagsCount}
            </div>
            <p className="text-xs text-gray-500 mt-2">bags with status assigned</p>
          </motion.div>
        </div>

        <div key="remainingBags" className="h-full">
          <motion.div
            className="bg-white rounded-xl shadow-lg border border-emerald-100 p-6 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-semibold text-sm">Remaining Bags</h3>
              <Calendar className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-4xl font-bold text-emerald-600">
              {bagsLoading ? '—' : remainingBagsCount}
            </div>
            <p className="text-xs text-gray-500 mt-2">1000 − assigned bags</p>
          </motion.div>
        </div>


        <div key="flaggedBags" className="h-full">
          <motion.div
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 h-full cursor-pointer hover:shadow-xl transition-shadow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            onClick={() => setShowFlaggedBagsModal(true)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Flagged Bags</h2>
                  <p className="text-sm text-gray-600">Customers with {FLAGGED_BAG_THRESHOLD}+ bags</p>
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                {flaggedCustomers.length} flagged
              </div>
            </div>

            {bagsLoading ? (
              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <span className="text-sm">Loading flagged bags...</span>
              </div>
            ) : flaggedCustomers.length === 0 ? (
              <div className="text-sm text-gray-500">No flagged bags found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {flaggedCustomers.slice(0, 8).map((customer) => (
                  <div key={customer.key} className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {customer.customerName}
                      </div>
                      {customer.customerId && (
                        <div className="text-xs text-gray-500">ID: {customer.customerId}</div>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-orange-600">
                      {customer.bags.length} bags
                    </span>
                  </div>
                ))}
                {flaggedCustomers.length > 8 && (
                  <div className="text-xs text-gray-500 pt-2">
                    Showing top 8 of {flaggedCustomers.length}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
 </div>       
      </div>

      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowIncidentModal(false)}
          />
          <motion.div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Incident</h3>
              <button
                type="button"
                onClick={() => setShowIncidentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {incidentError && (
              <div className="text-sm text-red-600 mb-3">{incidentError}</div>
            )}

            <form onSubmit={handleIncidentSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Incident Date</label>
                <input
                  type="date"
                  value={incidentForm.date}
                  onChange={(e) => setIncidentForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
                  <select
                    value={incidentForm.vehicleType}
                    onChange={(e) => setIncidentForm(prev => ({ ...prev, vehicleType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    <option value="bike">Bike</option>
                    <option value="van">Van</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Incident Type</label>
                  <select
                    value={incidentForm.incidentType}
                    onChange={(e) => setIncidentForm(prev => ({ ...prev, incidentType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    <option value="accident">Accident</option>
                    <option value="not_working">Not Working</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Details (optional)</label>
                <textarea
                  value={incidentForm.description}
                  onChange={(e) => setIncidentForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  placeholder="Add details about the incident..."
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={incidentSubmitting}
                  className="bg-rose-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-60"
                >
                  {incidentSubmitting ? 'Saving...' : 'Save Incident'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showFlaggedBagsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowFlaggedBagsModal(false)}
          />
          <motion.div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Flagged Bags</h3>
                <p className="text-sm text-gray-600">Full list of customers with {FLAGGED_BAG_THRESHOLD}+ bags</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFlaggedBagsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {bagsLoading ? (
              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <span className="text-sm">Loading flagged bags...</span>
              </div>
            ) : flaggedCustomers.length === 0 ? (
              <div className="text-sm text-gray-500">No flagged bags found.</div>
            ) : (
              <div className="max-h-[60vh] overflow-auto divide-y divide-gray-100">
                {flaggedCustomers.map((customer) => (
                  <div key={customer.key} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {customer.customerName}
                      </div>
                      {customer.customerId && (
                        <div className="text-xs text-gray-500">ID: {customer.customerId}</div>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-orange-600">
                      {customer.bags.length} bags
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};

const CheckCircle = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default LateDeliveriesDashboardGrid;
