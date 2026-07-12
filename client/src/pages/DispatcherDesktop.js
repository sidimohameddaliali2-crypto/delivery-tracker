import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Clock,
  User,
  Phone,
  X,
  ChevronDown,
  ChevronLeft,
  Check,
  Plus,
  LogOut,
  Printer,
  CalendarDays,
  Briefcase
} from 'lucide-react';
import { fetchEvents } from '../store/slices/eventSlice';
import { setSelectedEvent } from '../store/slices/eventSlice';
import EventCalendarView from '../components/events/EventCalendarView';
import EventDetailModal from '../components/events/EventDetailModal';
import api from '../utils/api';
import DispatcherMapAssignModal from '../components/DispatcherMapAssignModal';
import { fetchDeliveries } from '../store/slices/deliverySlice';
import { fetchDrivers } from '../store/slices/driverSlice';
import { logout } from '../store/slices/authSlice';

const AREA_FILTER_OPTIONS = [
  'All',
  'Marina',
  'JVC',
  'Business Bay',
  'Abu Dhabi',
  'Sharjah',
  'Ajman'
];

const statusPills = {
  pending: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-slate-100 text-slate-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800'
};

const DispatcherDesktop = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { deliveries = [], isLoading: deliveriesLoading } = useSelector(
    (state) => state.delivery
  );
  const { drivers = [] } = useSelector((state) => state.driver);
  const { user } = useSelector((state) => state.auth);

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const [areaFilters, setAreaFilters] = useState([]);
  const [driverFilters, setDriverFilters] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [areaSearchTerm, setAreaSearchTerm] = useState('');
  const [timingFilters, setTimingFilters] = useState([]);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState([]);
  const [assigningDriverId, setAssigningDriverId] = useState(null);
  const [activeAssignmentDeliveries, setActiveAssignmentDeliveries] = useState([]);
  const [feedback, setFeedback] = useState({ message: '', error: false });
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const [driverFilterDropdownOpen, setDriverFilterDropdownOpen] = useState(false);
  const [timingDropdownOpen, setTimingDropdownOpen] = useState(false);
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [showCollectionsOnly, setShowCollectionsOnly] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [printDriverFilter, setPrintDriverFilter] = useState(null);
  const [selectedDeliveryDetail, setSelectedDeliveryDetail] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => getTomorrowDate());
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [eventsSelectedDay, setEventsSelectedDay] = useState(null);
  const [eventsDayEvents, setEventsDayEvents] = useState([]);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const { events = [] } = useSelector((state) => state.events);
  const todayEventCount = events.filter((ev) => ev.eventDate && new Date(ev.eventDate).toDateString() === new Date().toDateString()).length;
  const [editForm, setEditForm] = useState({
    customerName: '',
    customerId: '',
    address: '',
    zone: '',
    notes: '',
    scheduledTime: ''
  });

  const areaButtonRef = useRef(null);
  const driverFilterButtonRef = useRef(null);
  const timingButtonRef = useRef(null);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const start = new Date(`${selectedDate}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      dispatch(fetchDeliveries({
        dateRange: 'custom',
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        limit: 1000
      }));
    }
    dispatch(fetchDrivers({ includeInactive: false }));
  }, [dispatch, selectedDate]);

  useEffect(() => {
    if (!feedback.message) return;
    const timer = setTimeout(() => setFeedback({ message: '', error: false }), 4200);
    return () => clearTimeout(timer);
  }, [feedback.message]);

  useEffect(() => {
    if (!areaDropdownOpen) return;
    const handleClickAway = (event) => {
      if (areaButtonRef.current && !areaButtonRef.current.contains(event.target)) {
        setAreaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [areaDropdownOpen]);

  useEffect(() => {
    if (!driverFilterDropdownOpen) return;
    const handleClickAway = (event) => {
      if (driverFilterButtonRef.current && !driverFilterButtonRef.current.contains(event.target)) {
        setDriverFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [driverFilterDropdownOpen]);

  useEffect(() => {
    if (!timingDropdownOpen) return;
    const handleClickAway = (event) => {
      if (timingButtonRef.current && !timingButtonRef.current.contains(event.target)) {
        setTimingDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [timingDropdownOpen]);

  useEffect(() => {
    if (!deliveries.length) {
      setSelectedDeliveryIds([]);
      return;
    }
    setSelectedDeliveryIds((prev) => prev.filter((id) => deliveries.some((d) => d._id === id)));
  }, [deliveries]);

  const areaOptions = useMemo(() => {
    // When showing unassigned only, limit area options to areas that still have unassigned deliveries
    const areaSource = deliveries.filter((delivery) => !showUnassignedOnly || !delivery.driver);
    const zones = Array.from(
      new Set(
        areaSource
          .map((delivery) => delivery.zone)
          .filter(Boolean)
          .map((zone) => zone.trim())
      )
    ).filter((zone) => zone.length > 0);
    return zones.sort((a, b) => a.localeCompare(b));
  }, [deliveries, showUnassignedOnly]);

  const filteredAreaOptions = useMemo(() => {
    if (!areaSearchTerm.trim()) {
      return areaOptions;
    }
    const normalizedSearch = areaSearchTerm.toLowerCase().trim();
    return areaOptions.filter(area => area.toLowerCase().includes(normalizedSearch));
  }, [areaOptions, areaSearchTerm]);

  const isWithinTimingFilter = (scheduledTime) => {
    if (timingFilters.length === 0) return true;
    const date = new Date(scheduledTime);
    const hour = date.getHours();
    return timingFilters.includes(hour);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const normalizedAreaFilters = areaFilters.map((area) => area.toLowerCase().trim());
  const normalizedAreaFiltersKey = normalizedAreaFilters.join('|');
  const driverFiltersKey = driverFilters.join('|');

  const filteredDeliveries = useMemo(() => {
    const processedDeliveries = deliveries || [];
    const filtered = processedDeliveries.filter((delivery) => {
      if (showUnassignedOnly && delivery.driver) {
        return false;
      }

      if (showCollectionsOnly && delivery.type !== 'Collection') {
        return false;
      }

      if (!isWithinTimingFilter(delivery.scheduledTime)) {
        return false;
      }

      const deliveryZone = (delivery.zone || '').toLowerCase().trim();
      const deliveryAddress = (delivery.address || '').toLowerCase();
      const areaMatch =
        normalizedAreaFilters.length === 0 ||
        normalizedAreaFilters.some((area) =>
          deliveryZone ? deliveryZone === area : deliveryAddress.includes(area)
        );

      if (!areaMatch) {
        return false;
      }

      const driverMatch =
        driverFilters.length === 0 ||
        driverFilters.includes(delivery.driver?._id) ||
        (driverFilters.includes('unassigned') && !delivery.driver);

      if (!driverMatch) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const matchesName = delivery.customerName?.toLowerCase().includes(normalizedSearch);
      const matchesCustomerId = delivery.customerId?.toLowerCase().includes(normalizedSearch);
      const matchesDeliveryId = (delivery._id || '').toLowerCase().includes(normalizedSearch);
      const matchesPhone = delivery.customerPhone?.toLowerCase().includes(normalizedSearch);

      return matchesName || matchesCustomerId || matchesDeliveryId || matchesPhone;
    });

    return filtered.sort(
      (a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );
  }, [deliveries, normalizedAreaFiltersKey, driverFiltersKey, normalizedSearch, showUnassignedOnly, showCollectionsOnly, timingFilters]);

  const driverLoadCounts = useMemo(() => {
    const counts = {};
    deliveries.forEach((delivery) => {
      const driverId = delivery.driver?._id;
      if (!driverId) return;
      if (delivery.status === 'delivered') return;
      counts[driverId] = (counts[driverId] || 0) + 1;
    });
    return counts;
  }, [deliveries]);

  const sortedDrivers = useMemo(() => {
    return [...drivers].sort((a, b) => {
      const statusOrder = { available: 0, busy: 1, break: 2, offline: 3, not_working: 4 };
      const statusA = (a.profile?.status || 'available').toLowerCase();
      const statusB = (b.profile?.status || 'available').toLowerCase();
      const byStatus =
        (statusOrder[statusA] ?? 5) - (statusOrder[statusB] ?? 5) ||
        (driverLoadCounts[a._id] || 0) - (driverLoadCounts[b._id] || 0);
      if (byStatus !== 0) return byStatus;
      const nameA = `${a.profile?.firstName || ''} ${a.profile?.lastName || ''}`.trim();
      const nameB = `${b.profile?.firstName || ''} ${b.profile?.lastName || ''}`.trim();
      return nameA.localeCompare(nameB);
    });
  }, [drivers, driverLoadCounts]);

  const getDriverDisplayName = (driver) => {
    if (!driver) return 'Unassigned';
    const parts = [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : driver.email || 'Driver';
  };

  const driverNameMap = useMemo(() => {
    const map = {};
    sortedDrivers.forEach((d) => {
      map[d._id] = getDriverDisplayName(d);
    });
    return map;
  }, [sortedDrivers]);

  const formatTime = (value) => {
    if (!value) return '--:--';
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'assigned':
        return 'Assigned';
      case 'picked_up':
        return 'Picked up';
      case 'delivered':
        return 'Delivered';
      case 'failed':
        return 'Failed';
      default:
        return 'Queued';
    }
  };

  const handleAssignDriver = async (driver) => {
    if (!activeAssignmentDeliveries.length || assigningDriverId) return;
    setAssigningDriverId(driver._id);
    const deliveryIds = activeAssignmentDeliveries.map((delivery) => delivery._id);
    try {
      await api.patch('/deliveries/assign-driver', {
        deliveryIds,
        driverId: driver._id
      });
      setFeedback({
        message: `Assigned to ${getDriverDisplayName(driver)}`,
        error: false
      });
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      dispatch(fetchDeliveries({
        dateRange: 'custom',
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        limit: 1000
      }));
      setSelectedDeliveryIds([]);
      setActiveAssignmentDeliveries([]);
      setAreaFilters([]);
      setTimingFilters([]);
      setDriverFilters([]);
    } catch (error) {
      setFeedback({
        message:
          error.response?.data?.message ||
          error.message ||
          'Unable to assign this driver. Please retry.',
        error: true
      });
    } finally {
      setAssigningDriverId(null);
    }
  };

  const toggleAreaSelection = (area) => {
    setAreaFilters((prev) => {
      if (prev.includes(area)) {
        return prev.filter((item) => item !== area);
      }
      return [...prev, area];
    });
  };

  const toggleDriverSelection = (driverId) => {
    setDriverFilters((prev) => {
      if (prev.includes(driverId)) {
        return prev.filter((id) => id !== driverId);
      }
      return [...prev, driverId];
    });
  };

  const toggleDeliverySelection = (deliveryId) => {
    setSelectedDeliveryIds((prev) => {
      if (prev.includes(deliveryId)) {
        return prev.filter((id) => id !== deliveryId);
      }
      return [...prev, deliveryId];
    });
  };

  const clearAreaFilters = () => {
    setAreaFilters([]);
  };

  const clearDriverFilters = () => {
    setDriverFilters([]);
  };

  const areaLabel = areaFilters.length === 0 ? 'All Areas' : areaFilters.join(', ');

  const driverLabel = useMemo(() => {
    if (driverFilters.length === 0) return 'All Drivers';
    const names = driverFilters.map((id) => (id === 'unassigned' ? 'Unassigned' : driverNameMap[id] || 'Driver'));
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')}…`;
  }, [driverFilters, driverNameMap]);

  const selectedDeliveries = useMemo(
    () => deliveries.filter((delivery) => selectedDeliveryIds.includes(delivery._id)),
    [deliveries, selectedDeliveryIds]
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Dispatcher Hub</h1>
          <p className="text-gray-600 mt-1">
            {user?.profile?.firstName ? `Welcome, ${user.profile.firstName}` : 'Delivery Management'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { dispatch(fetchEvents()); navigate('/dispatcher/events'); }}
            className="relative flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-semibold"
          >
            <CalendarDays className="w-5 h-5" />
            Scheduled Events
            {todayEventCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {todayEventCount}
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>

        {/* Scheduled Events Modal */}
        {showEventsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-auto max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                <div className="flex items-center gap-3">
                  {eventsSelectedDay ? (
                    <button
                      onClick={() => setEventsSelectedDay(null)}
                      className="flex items-center gap-1 text-indigo-600 font-semibold hover:text-indigo-800 mr-1"
                    >
                      <ChevronLeft className="w-5 h-5" /> Back
                    </button>
                  ) : (
                    <Briefcase className="w-6 h-6 text-indigo-600" />
                  )}
                  <h2 className="text-xl font-bold text-gray-900">
                    {eventsSelectedDay
                      ? eventsSelectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                      : 'Scheduled Events'}
                  </h2>
                  {!eventsSelectedDay && todayEventCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{todayEventCount} today</span>
                  )}
                  {eventsSelectedDay && (
                    <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full">{eventsDayEvents.length} event{eventsDayEvents.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <button onClick={() => { setShowEventsModal(false); setEventsSelectedDay(null); }} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              {/* Modal Body */}
              <div className="overflow-y-auto flex-1 p-4">
                {events.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">No events found.</p>
                ) : eventsSelectedDay ? (
                  /* Day Detail View */
                  <div className="space-y-4">
                    {eventsDayEvents.length === 0 ? (
                      <p className="text-center text-gray-400 py-10">No events on this day.</p>
                    ) : (
                      eventsDayEvents.map((ev) => (
                        <div key={ev._id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition" onClick={() => { dispatch(setSelectedEvent(ev)); setShowEventDetail(true); }}>
                          <div className={`px-4 py-3 flex items-center justify-between ${
                            ev.status === 'confirmed' ? 'bg-emerald-50 border-b border-emerald-200' :
                            ev.status === 'cancelled' ? 'bg-gray-100 border-b border-gray-200' :
                            'bg-indigo-50 border-b border-indigo-200'
                          }`}>
                            <div>
                              <p className={`font-bold text-base ${ev.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{ev.eventName}</p>
                              <p className="text-sm text-gray-500">{ev.companyName}</p>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                              ev.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                              ev.status === 'cancelled' ? 'bg-gray-200 text-gray-500' :
                              'bg-amber-100 text-amber-700'
                            }`}>{ev.status}</span>
                          </div>
                          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-sm">
                            {ev.arrivalTime && (
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                                <div>
                                  <p className="text-xs text-gray-400">Arrival</p>
                                  <p className="font-semibold text-gray-800">{ev.arrivalTime}</p>
                                </div>
                              </div>
                            )}
                            {ev.logistics?.guestCount > 0 && (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-indigo-400 shrink-0" />
                                <div>
                                  <p className="text-xs text-gray-400">Guests</p>
                                  <p className="font-semibold text-gray-800">{ev.logistics.guestCount}</p>
                                </div>
                              </div>
                            )}
                            {ev.venue?.address && (
                              <div className="flex items-start gap-2 col-span-2">
                                <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs text-gray-400">{ev.emirate}</p>
                                  <p className="font-semibold text-gray-800">{ev.venue.address}</p>
                                </div>
                              </div>
                            )}
                          </div>
                          {(ev.logistics?.food || []).length > 0 && (
                            <div className="px-4 pb-3">
                              <p className="text-xs font-semibold text-gray-400 mb-1">Food Items</p>
                              <div className="flex flex-wrap gap-1">
                                {ev.logistics.food.map((f, i) => (
                                  <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{f.name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {ev.notes && (
                            <div className="px-4 pb-3">
                              <p className="text-xs text-gray-500 italic">{ev.notes}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* Calendar View */
                  <EventCalendarView
                    events={events}
                    onEventClick={() => {}}
                    onDayClick={(day, dayEvts) => { setEventsSelectedDay(day); setEventsDayEvents(dayEvts); }}
                    hideDetailPanel
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
          {/* Date Picker */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Customer, ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Area Filter */}
          <div ref={areaButtonRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Area</label>
            <button
              onClick={() => setAreaDropdownOpen(!areaDropdownOpen)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-left bg-white hover:bg-gray-50 flex justify-between items-center"
            >
              <span className="truncate text-sm">{areaLabel}</span>
              <ChevronDown className={`w-4 h-4 transition ${areaDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {areaDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-30 max-h-96 overflow-y-auto">
                <div className="sticky top-0 bg-white p-3 border-b border-gray-200">
                  <input
                    type="text"
                    placeholder="Search areas..."
                    value={areaSearchTerm}
                    onChange={(e) => setAreaSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="p-2">
                  {filteredAreaOptions.map((area) => (
                    <button
                      key={area}
                      onClick={() => toggleAreaSelection(area)}
                      className={`w-full text-left px-4 py-2 rounded text-sm flex items-center justify-between hover:bg-gray-100 ${
                        areaFilters.includes(area) ? 'bg-blue-50 text-blue-600' : ''
                      }`}
                    >
                      <span>{area}</span>
                      {areaFilters.includes(area) && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-200 p-2">
                  <button
                    onClick={clearAreaFilters}
                    className="w-full text-sm text-blue-600 font-semibold hover:bg-blue-50 px-4 py-2 rounded"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Driver Filter */}
          <div ref={driverFilterButtonRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Driver</label>
            <button
              onClick={() => setDriverFilterDropdownOpen(!driverFilterDropdownOpen)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-left bg-white hover:bg-gray-50 flex justify-between items-center"
            >
              <span className="truncate text-sm">{driverLabel}</span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition ${driverFilterDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {driverFilterDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-30 max-h-96 overflow-y-auto">
                <div className="p-2">
                  <button
                    onClick={() => toggleDriverSelection('unassigned')}
                    className={`w-full text-left px-4 py-2 rounded text-sm flex items-center justify-between hover:bg-gray-100 ${
                      driverFilters.includes('unassigned') ? 'bg-blue-50 text-blue-600' : ''
                    }`}
                  >
                    <span>Unassigned</span>
                      {driverFilters.includes('unassigned') && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                  {sortedDrivers.map((driver) => {
                    const checked = driverFilters.includes(driver._id);
                    return (
                      <button
                        key={driver._id}
                        onClick={() => toggleDriverSelection(driver._id)}
                        className={`w-full text-left px-4 py-2 rounded text-sm flex items-center justify-between hover:bg-gray-100 ${
                          checked ? 'bg-blue-50 text-blue-600' : ''
                        }`}
                      >
                        <span>{getDriverDisplayName(driver)}</span>
                        {checked && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-gray-200 p-2">
                  <button
                    onClick={clearDriverFilters}
                    className="w-full text-sm text-blue-600 font-semibold hover:bg-blue-50 px-4 py-2 rounded"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Timing Filter */}
          <div ref={timingButtonRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Timing</label>
            <button
              onClick={() => setTimingDropdownOpen(!timingDropdownOpen)}
              className={`w-full px-4 py-2 border rounded-lg text-left text-sm flex justify-between items-center ${
                timingFilters.length > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-600 font-semibold'
                  : 'bg-white border-gray-300'
              }`}
            >
              <span>{timingFilters.length === 0 ? 'Select Hours' : `${timingFilters.length} hour(s)`}</span>
              <ChevronDown className={`w-4 h-4 transition ${timingDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {timingDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2 p-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => (
                    <button
                      key={hour}
                      onClick={() => setTimingFilters(prev =>
                        prev.includes(hour)
                          ? prev.filter(h => h !== hour)
                          : [...prev, hour]
                      )}
                      className={`px-3 py-2 rounded text-xs font-semibold ${
                        timingFilters.includes(hour)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {hour}am
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-200 p-2">
                  <button
                    onClick={() => setTimingFilters([])}
                    className="w-full text-sm text-blue-600 font-semibold hover:bg-blue-50 px-4 py-2 rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-end gap-2 mb-2 sm:justify-end justify-center">
          <button
            onClick={() => setShowUnassignedOnly(!showUnassignedOnly)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition w-full sm:w-auto ${
              showUnassignedOnly
                ? 'bg-orange-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            📦 Unassigned
          </button>
          <button
            onClick={() => setShowCollectionsOnly(!showCollectionsOnly)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition w-full sm:w-auto ${
              showCollectionsOnly
                ? 'bg-teal-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            🗂️ Collections
          </button>
          <button
            onClick={() => setPrintMode(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-lg font-semibold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={() => setMapModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-lg font-semibold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            Map
          </button>
        </div>

        {/* Selection Bar */}
        {selectedDeliveryIds.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
            <span className="font-semibold text-blue-900">{selectedDeliveryIds.length} Selected</span>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveAssignmentDeliveries(selectedDeliveries)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Assign to Driver
              </button>
              <button
                onClick={() => setSelectedDeliveryIds([])}
                className="px-4 py-2 bg-white border border-blue-300 text-blue-600 rounded-lg font-semibold hover:bg-blue-50"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left">
                <input
                  type="checkbox"
                  checked={selectedDeliveryIds.length > 0 && filteredDeliveries.every(d => selectedDeliveryIds.includes(d._id))}
                  onChange={() => {
                    if (selectedDeliveryIds.length > 0 && filteredDeliveries.every(d => selectedDeliveryIds.includes(d._id))) {
                      setSelectedDeliveryIds([]);
                    } else {
                      setSelectedDeliveryIds(filteredDeliveries.map(d => d._id));
                    }
                  }}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Customer ID</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Customer Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Time</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Location</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Driver</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deliveriesLoading ? (
              <tr>
                <td colSpan="9" className="px-6 py-12 text-center text-gray-500">
                  Loading deliveries...
                </td>
              </tr>
            ) : filteredDeliveries.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-6 py-12 text-center text-gray-500">
                  No deliveries found
                </td>
              </tr>
            ) : (
              filteredDeliveries.map((delivery) => (
                <tr key={delivery._id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedDeliveryIds.includes(delivery._id)}
                      onChange={() => toggleDeliverySelection(delivery._id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{delivery.customerId}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{delivery.customerName}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatTime(delivery.scheduledTime)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{delivery.address || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{delivery.zone || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="font-medium text-gray-900">{getDriverDisplayName(delivery.driver)}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusPills[delivery.status]}`}>
                      {getStatusLabel(delivery.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2 flex">
                    <button
                      onClick={() => setSelectedDeliveryDetail(delivery)}
                      className="text-gray-600 hover:text-gray-900 font-semibold text-xs px-2 py-1 rounded hover:bg-gray-100 transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => {
                        let scheduledValue = '';
                        if (delivery.scheduledTime) {
                          const date = new Date(delivery.scheduledTime);
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const hours = String(date.getHours()).padStart(2, '0');
                          const minutes = String(date.getMinutes()).padStart(2, '0');
                          scheduledValue = `${year}-${month}-${day}T${hours}:${minutes}`;
                        }
                        setEditingDelivery(delivery);
                        setEditForm({
                          customerName: delivery.customerName || '',
                          customerId: delivery.customerId || '',
                          address: delivery.address || '',
                          zone: delivery.zone || '',
                          notes: delivery.notes || '',
                          scheduledTime: scheduledValue
                        });
                      }}
                      className="text-green-600 hover:text-green-800 font-semibold text-xs px-2 py-1 rounded hover:bg-green-50 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setActiveAssignmentDeliveries([delivery])}
                      className="text-blue-600 hover:text-blue-800 font-semibold text-xs px-2 py-1 rounded hover:bg-blue-50 transition"
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Driver Assignment Modal */}
      {activeAssignmentDeliveries.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Assign Driver</h2>
              <button
                onClick={() => setActiveAssignmentDeliveries([])}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Assigning:</p>
                {activeAssignmentDeliveries.map((d) => (
                  <p key={d._id} className="font-semibold text-gray-900">{d.customerName}</p>
                ))}
              </div>

              <h3 className="font-semibold text-gray-900 mb-4">Select Driver:</h3>
              <div className="space-y-2">
                {sortedDrivers.map((driver) => (
                  <button
                    key={driver._id}
                    onClick={() => handleAssignDriver(driver)}
                    disabled={assigningDriverId === driver._id}
                    className="w-full p-4 border border-gray-300 rounded-lg hover:bg-blue-50 text-left transition disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{getDriverDisplayName(driver)}</p>
                        <p className="text-xs text-gray-500">{driverLoadCounts[driver._id] || 0} deliveries</p>
                      </div>
                      {assigningDriverId === driver._id && (
                        <span className="text-blue-600 font-semibold">Assigning...</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Print Delivery List</h2>
              <button
                onClick={() => setPrintMode(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Filter by Driver (Optional)
              </label>
              <select
                value={printDriverFilter || ''}
                onChange={(e) => setPrintDriverFilter(e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-6"
              >
                <option value="">All Drivers</option>
                <option value="unassigned">Unassigned Only</option>
                {sortedDrivers.map((driver) => (
                  <option key={driver._id} value={driver._id}>
                    {getDriverDisplayName(driver)}
                  </option>
                ))}
              </select>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold text-gray-900 mb-3">
                  Preview ({filteredDeliveries.filter(d => {
                    if (!printDriverFilter) return true;
                    if (printDriverFilter === 'unassigned') return !d.driver;
                    return d.driver?._id === printDriverFilter;
                  }).length} deliveries)
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {filteredDeliveries
                    .filter(d => {
                      if (!printDriverFilter) return true;
                      if (printDriverFilter === 'unassigned') return !d.driver;
                      return d.driver?._id === printDriverFilter;
                    })
                    .map((delivery, idx) => (
                      <div key={delivery._id} className="text-xs text-gray-700 py-1">
                        {idx + 1}. {delivery.customerId} | {delivery.customerName} | {getDriverDisplayName(delivery.driver)} | {formatTime(delivery.scheduledTime)} | {delivery.zone || delivery.address}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-gray-200">
              <button
                onClick={() => setPrintMode(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const printDeliveries = filteredDeliveries.filter(d => {
                    if (!printDriverFilter) return true;
                    if (printDriverFilter === 'unassigned') return !d.driver;
                    return d.driver?._id === printDriverFilter;
                  });

                  const printWindow = window.open('', '', 'height=600,width=800');
                  const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>Delivery List - ${selectedDate}</title>
                      <style>
                        body {
                          font-family: Arial, sans-serif;
                          margin: 20px;
                          font-size: 12px;
                        }
                        h1 {
                          font-size: 16px;
                          margin-bottom: 10px;
                        }
                        table {
                          width: 100%;
                          border-collapse: collapse;
                          margin-top: 10px;
                        }
                        th, td {
                          border: 1px solid #ddd;
                          padding: 8px;
                          text-align: left;
                        }
                        th {
                          background-color: #f0f0f0;
                          font-weight: bold;
                        }
                        tr:nth-child(even) {
                          background-color: #f9f9f9;
                        }
                      </style>
                    </head>
                    <body>
                      <h1>Delivery List - ${selectedDate}</h1>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Customer ID</th>
                            <th>Customer Name</th>
                            <th>Driver</th>
                            <th>Time</th>
                            <th>Zone</th>
                            <th>Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${printDeliveries.map((d, idx) => `
                            <tr>
                              <td>${idx + 1}</td>
                              <td>${d.customerId}</td>
                              <td>${d.customerName}</td>
                              <td>${getDriverDisplayName(d.driver)}</td>
                              <td>${formatTime(d.scheduledTime)}</td>
                              <td>${d.zone || '-'}</td>
                              <td>${d.address || '-'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </body>
                    </html>
                  `;
                  printWindow.document.write(html);
                  printWindow.document.close();
                  setTimeout(() => {
                    printWindow.print();
                  }, 250);
                  setPrintMode(false);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Detail Modal */}
      {selectedDeliveryDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Delivery Details</h2>
                <p className="text-sm text-gray-500">{selectedDeliveryDetail.customerId}</p>
              </div>
              <button
                onClick={() => setSelectedDeliveryDetail(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[70vh] p-6 space-y-4">
              {/* Delivery Proof Images */}
              {selectedDeliveryDetail.proof?.images && selectedDeliveryDetail.proof.images.length > 0 && (
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">📸 Proof of Delivery</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {selectedDeliveryDetail.proof.images.map((image, idx) => (
                      <div key={idx} className="relative">
                        <img 
                          src={image} 
                          alt={`Proof ${idx + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-gray-200"
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23f3f4f6%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%239ca3af%22 font-size=%2212%22%3ENo Image%3C/text%3E%3C/svg%3E';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery Timing */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">⏰ Timing Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <p className="text-blue-700">Scheduled Time:</p>
                    <p className="font-semibold text-blue-900">{formatTime(selectedDeliveryDetail.scheduledTime)}</p>
                  </div>
                  <div className="flex justify-between">
                    <p className="text-blue-700">Scheduled Date:</p>
                    <p className="font-semibold text-blue-900">{formatDate(selectedDeliveryDetail.scheduledTime)}</p>
                  </div>
                  {selectedDeliveryDetail.deliveredTime && (
                    <>
                      <div className="flex justify-between pt-2 border-t border-blue-200">
                        <p className="text-green-700 font-semibold">Delivered Time:</p>
                        <p className="font-semibold text-green-900">{formatTime(selectedDeliveryDetail.deliveredTime)}</p>
                      </div>
                      <div className="flex justify-between">
                        <p className="text-green-700 font-semibold">Delivered Date:</p>
                        <p className="font-semibold text-green-900">{formatDate(selectedDeliveryDetail.deliveredTime)}</p>
                      </div>
                    </>
                  )}
                  {selectedDeliveryDetail.lateMinutes > 0 && (
                    <div className="flex justify-between pt-2 border-t border-blue-200">
                      <p className="text-red-700 font-semibold">Late by:</p>
                      <p className="font-semibold text-red-900">{selectedDeliveryDetail.lateMinutes} minutes</p>
                    </div>
                  )}
                  {selectedDeliveryDetail.earlyMinutes > 0 && (
                    <div className="flex justify-between pt-2 border-t border-blue-200">
                      <p className="text-emerald-700 font-semibold">Early by:</p>
                      <p className="font-semibold text-emerald-900">{selectedDeliveryDetail.earlyMinutes} minutes</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Timeline */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">📜 Delivery Timeline</h3>
                <div className="space-y-4">
                  {selectedDeliveryDetail.timeline && selectedDeliveryDetail.timeline.length > 0 ? (
                    selectedDeliveryDetail.timeline.map((event, index) => (
                      <div key={index} className="flex items-start space-x-4">
                        <div className={`w-3 h-3 rounded-full mt-2 ${
                          event.status === 'delivered' ? 'bg-green-500' :
                          event.status === 'failed' ? 'bg-red-500' :
                          event.status === 'picked_up' ? 'bg-blue-500' :
                          event.status === 'assigned' ? 'bg-yellow-500' :
                          event.status === 'moved_to_next_day' ? 'bg-purple-500' :
                          'bg-gray-500'
                        }`} />
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-gray-900 capitalize">
                                {event.status.replace(/_/g, ' ')}
                              </h4>
                              <p className="text-sm text-gray-500">
                                {event.timestamp ? (new Date(event.timestamp)).toLocaleString() : ''}
                              </p>
                            </div>
                          </div>
                          {event.notes && (
                            <p className="text-sm text-gray-600 mt-1">{event.notes}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <span>No timeline events recorded</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Info */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Customer Information</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="font-semibold text-gray-900">{selectedDeliveryDetail.customerName}</p>
                    </div>
                  </div>
                  {selectedDeliveryDetail.customerPhone && (
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <a href={`tel:${selectedDeliveryDetail.customerPhone}`} className="font-semibold text-blue-600 hover:underline">
                          {selectedDeliveryDetail.customerPhone}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Info */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Delivery Information</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Address</p>
                      <p className="font-semibold text-gray-900 text-sm">{selectedDeliveryDetail.address || 'Not provided'}</p>
                    </div>
                  </div>
                  {selectedDeliveryDetail.zone && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Zone</p>
                        <p className="font-semibold text-gray-900">{selectedDeliveryDetail.zone}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Scheduled Time</p>
                      <p className="font-semibold text-gray-900">{formatTime(selectedDeliveryDetail.scheduledTime)} on {formatDate(selectedDeliveryDetail.scheduledTime)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Driver Assignment */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Driver Assignment</h3>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500">Assigned Driver</p>
                    <p className="font-semibold text-gray-900">
                      {selectedDeliveryDetail.driver ? getDriverDisplayName(selectedDeliveryDetail.driver) : 'Unassigned'}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusPills[selectedDeliveryDetail.status]}`}>
                    {getStatusLabel(selectedDeliveryDetail.status)}
                  </span>
                </div>
              </div>

              {/* Order Details */}
              {(selectedDeliveryDetail.items || selectedDeliveryDetail.weight || selectedDeliveryDetail.dimensions) && (
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">Order Details</h3>
                  <div className="space-y-2 text-sm">
                    {selectedDeliveryDetail.items && (
                      <div>
                        <p className="text-xs text-gray-500">Items</p>
                        <p className="font-semibold text-gray-900">{selectedDeliveryDetail.items}</p>
                      </div>
                    )}
                    {selectedDeliveryDetail.weight && (
                      <div>
                        <p className="text-xs text-gray-500">Weight</p>
                        <p className="font-semibold text-gray-900">{selectedDeliveryDetail.weight} kg</p>
                      </div>
                    )}
                    {selectedDeliveryDetail.dimensions && (
                      <div>
                        <p className="text-xs text-gray-500">Dimensions</p>
                        <p className="font-semibold text-gray-900">{selectedDeliveryDetail.dimensions}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Special Instructions */}
              {selectedDeliveryDetail.notes && (
                <div className="pb-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">Special Instructions</h3>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-900">{selectedDeliveryDetail.notes}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 p-6 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-xl">
              <button
                onClick={() => setSelectedDeliveryDetail(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setActiveAssignmentDeliveries([selectedDeliveryDetail]);
                  setSelectedDeliveryDetail(null);
                }}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
              >
                {selectedDeliveryDetail.driver ? 'Reassign Driver' : 'Assign Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Delivery Modal */}
      {editingDelivery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Edit Delivery</h2>
              <button
                onClick={() => setEditingDelivery(null)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const payload = {};
                  if (editForm.customerName !== editingDelivery.customerName) payload.customerName = editForm.customerName;
                  if (editForm.customerId !== editingDelivery.customerId) payload.customerId = editForm.customerId;
                  if (editForm.address !== editingDelivery.address) payload.address = editForm.address;
                  if (editForm.zone !== editingDelivery.zone) payload.zone = editForm.zone;
                  if (editForm.notes !== editingDelivery.notes) payload.notes = editForm.notes;
                  if (editForm.scheduledTime) {
                    const newScheduled = new Date(editForm.scheduledTime).toISOString();
                    const oldScheduled = editingDelivery.scheduledTime ? new Date(editingDelivery.scheduledTime).toISOString() : null;
                    if (newScheduled !== oldScheduled) payload.scheduledTime = newScheduled;
                  }
                  if (Object.keys(payload).length === 0) {
                    alert('No changes to save');
                    return;
                  }
                  await api.put(`/deliveries/${editingDelivery._id}`, payload);
                  setEditingDelivery(null);
                  const start = new Date(`${selectedDate}T00:00:00`);
                  const end = new Date(start);
                  end.setDate(end.getDate() + 1);
                  dispatch(fetchDeliveries({
                    dateRange: 'custom',
                    dateFrom: start.toISOString(),
                    dateTo: end.toISOString(),
                    limit: 1000
                  }));
                  setFeedback({ message: 'Delivery updated successfully', error: false });
                } catch (err) {
                  console.error('Update delivery error:', err);
                  alert(err?.response?.data?.message || 'Failed to update delivery');
                }
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm(f => ({ ...f, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
                  <input
                    type="text"
                    value={editForm.customerId}
                    onChange={(e) => setEditForm(f => ({ ...f, customerId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                  <input
                    type="text"
                    value={editForm.zone}
                    onChange={(e) => setEditForm(f => ({ ...f, zone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
                  <input
                    type="datetime-local"
                    value={editForm.scheduledTime}
                    onChange={(e) => setEditForm(f => ({ ...f, scheduledTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingDelivery(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Assign Modal */}
      <DispatcherMapAssignModal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        deliveries={filteredDeliveries}
        drivers={drivers}
      />

      {/* Feedback Toast */}
      {feedback.message && (
        <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-lg text-white font-semibold shadow-lg ${
          feedback.error ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {feedback.message}
        </div>
      )}

      <EventDetailModal isOpen={showEventDetail} onClose={() => setShowEventDetail(false)} />
    </div>
  );
};

export default DispatcherDesktop;
