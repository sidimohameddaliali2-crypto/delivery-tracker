import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchEvents, setSelectedEvent, deleteEvent } from '../store/slices/eventSlice';
import { Calendar, Plus, AlertCircle, Briefcase, ArrowLeft } from 'lucide-react';
import CreateEventModal from '../components/events/CreateEventModal';
import EventDetailModal from '../components/events/EventDetailModal';
import EventCalendarView from '../components/events/EventCalendarView';
import DayEventsModal from '../components/events/DayEventsModal';
import { motion } from 'framer-motion';

const Events = ({ showBackButton = false }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { events, isLoading, error, success, selectedEvent } = useSelector((state) => state.events);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [dayEvents, setDayEvents] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmirateModal, setFilterEmirateModal] = useState('all');

  const emirates = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

  useEffect(() => {
    dispatch(fetchEvents());
  }, [dispatch]);

  const filteredEvents = events.filter((event) => {
    const matchStatus = filterStatus === 'all' || event.status === filterStatus;
    const matchEmirateModal = filterEmirateModal === 'all' || event.emirate === filterEmirateModal;
    const matchSearch =
      event.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.venue.address.toLowerCase().includes(searchTerm.toLowerCase());

    return matchStatus && matchEmirateModal && matchSearch;
  });

  const handleViewEvent = (event) => {
    dispatch(setSelectedEvent(event));
    setShowDetailModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {showBackButton && (
                <button
                  onClick={() => navigate('/dispatcher')}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <Briefcase className="w-8 h-8 text-blue-600" />
                  Events Manager
                </h1>
                <p className="text-gray-600 mt-1">Manage all company events and logistics</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              <Plus className="w-5 h-5" />
              New Event
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={filterEmirateModal}
              onChange={(e) => setFilterEmirateModal(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Emirates</option>
              {emirates.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setFilterStatus('all');
                setFilterEmirateModal('all');
                setSearchTerm('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        )}

        {/* Success Message */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700"
          >
            ✓ Operation successful
          </motion.div>
        )}

        {/* Calendar View */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin">
              <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
            </div>
            <p className="text-gray-600 mt-4">Loading events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No events found</p>
            <p className="text-gray-500 text-sm mt-1">Create your first event to get started</p>
          </div>
        ) : (
          <EventCalendarView 
            events={filteredEvents}
            onEventClick={(event) => {
              dispatch(setSelectedEvent(event));
              setShowDetailModal(true);
            }}
            onDayClick={(day, dayEvents) => {
              setDayEvents(dayEvents);
              setShowDayModal(true);
            }}
          />
        )}
      </div>

      {/* Modals */}
      <CreateEventModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      {selectedEvent && <EventDetailModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} />}
      <DayEventsModal
        isOpen={showDayModal}
        events={dayEvents}
        onClose={() => setShowDayModal(false)}
        onEventClick={(event) => {
          // hide day list before showing detail so detail sits on top
          setShowDayModal(false);
          dispatch(setSelectedEvent(event));
          setShowDetailModal(true);
        }}
      />
    </div>
  );
};

export default Events;
