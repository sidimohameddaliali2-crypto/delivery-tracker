import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { Search, Eye, Edit, MapPin, Clock, User, RefreshCw, CheckCircle, UserCheck, X, Printer, LayoutGrid, Table, Trash2, Zap, Loader, Palette } from 'lucide-react';
import api from '../utils/api';
import StickerDesignerModal from '../components/stickers/StickerDesignerModal';
import BagTagPrintModal from '../components/BagTagPrintModal';
import ZoneColorManager from '../components/ZoneColorManager';

const Deliveries = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [timingFilter, setTimingFilter] = useState('all'); // 'all', 'late', 'early'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalDeliveriesCount, setTotalDeliveriesCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedDeliveries, setSelectedDeliveries] = useState(() => new Set());
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDriversLoading, setIsDriversLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [assignError, setAssignError] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [stickerDeliveries, setStickerDeliveries] = useState([]);
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'
  const [deleteStartDate, setDeleteStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deleteEndDate, setDeleteEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [isBagTagModalOpen, setIsBagTagModalOpen] = useState(false);
  const [bagTagFilterType, setBagTagFilterType] = useState('all'); // 'all' | 'area' | 'company'
  const [bagTagArea, setBagTagArea] = useState('');
  const [bagTagCompany, setBagTagCompany] = useState('');
  const [bagTagDeliveries, setBagTagDeliveries] = useState([]);
  const [isZoneColorModalOpen, setIsZoneColorModalOpen] = useState(false);
  const MAX_FETCH_LIMIT = 2000;

  // Fetch deliveries from server with pagination and optional day filter
  const fetchDeliveries = useCallback(
    async () => {
      try {
        setIsLoading(true);
        setError(null);

        const params = {
          page: 1,
          limit: MAX_FETCH_LIMIT
        };

        if (selectedDate) {
          const start = new Date(`${selectedDate}T00:00:00`);
          if (!Number.isNaN(start.getTime())) {
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            params.dateFrom = start.toISOString();
            params.dateTo = end.toISOString();
          }
        }

        if (statusFilter && statusFilter !== 'all') {
          params.status = statusFilter;
        }

        const response = await api.get('/deliveries', { params });

        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Failed to load deliveries');
        }

        const data = response.data?.data || {};
        const pageDeliveries = Array.isArray(data.deliveries) ? data.deliveries : [];
        const pagination = data.pagination || {};
        const total = pagination.total ?? pageDeliveries.length;

        setDeliveries(pageDeliveries);
        setTotalDeliveriesCount(total);
        setLastUpdated(new Date().toISOString());
        setSelectedDeliveries(prev => {
          if (prev.size === 0) {
            return prev;
          }
          const validIds = new Set(pageDeliveries.map(delivery => delivery._id));
          const next = new Set();
          prev.forEach(id => {
            if (validIds.has(id)) {
              next.add(id);
            }
          });
          return next;
        });
      } catch (error) {
        console.error('Error fetching deliveries:', error);
        setDeliveries([]);
        setTotalDeliveriesCount(0);
        setError(error.response?.data?.message || 'Failed to load deliveries');
      } finally {
        setIsLoading(false);
      }
    },
    [selectedDate, statusFilter]
  );

  const areaOptions = useMemo(() => {
    const zones = new Set();
    deliveries.forEach(delivery => {
      const zone = delivery.zone?.trim();
      if (zone) {
        zones.add(zone);
      }
    });
    return Array.from(zones).sort((a, b) => a.localeCompare(b));
  }, [deliveries]);

  const companyOptions = useMemo(() => {
    const companies = new Set();
    deliveries.forEach(delivery => {
      const company = delivery.company?.trim();
      if (company) companies.add(company);
    });
    return Array.from(companies).sort((a, b) => a.localeCompare(b));
  }, [deliveries]);

  const filteredDeliveryIds = useMemo(
    () => filteredDeliveries.map(delivery => delivery._id),
    [filteredDeliveries]
  );
  const allFilteredSelected =
    filteredDeliveryIds.length > 0 &&
    filteredDeliveryIds.every(id => selectedDeliveries.has(id));

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  useEffect(() => {
    if (areaFilter !== 'all' && !areaOptions.includes(areaFilter)) {
      setAreaFilter('all');
    }
  }, [areaOptions, areaFilter]);

  // Filter deliveries based on search and filters

  useEffect(() => {
    let filtered = deliveries;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(delivery =>
        delivery.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        delivery.customerId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        delivery.driver?.profile?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        delivery.driver?.profile?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        delivery.zone?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(delivery => delivery.status === statusFilter);
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(delivery => delivery.type === typeFilter);
    }

    if (areaFilter !== 'all') {
      filtered = filtered.filter(delivery => {
        const deliveryZone = delivery.zone?.trim();
        return deliveryZone ? deliveryZone === areaFilter : false;
      });
    }

    // Apply timing filter
    if (timingFilter === 'late') {
      filtered = filtered.filter(delivery => delivery.lateMinutes && delivery.lateMinutes > 0);
    } else if (timingFilter === 'early') {
      filtered = filtered.filter(delivery => delivery.earlyMinutes && delivery.earlyMinutes > 0);
    }

    setFilteredDeliveries(filtered);
  }, [deliveries, searchTerm, statusFilter, typeFilter, areaFilter, timingFilter]);

  const loadDrivers = useCallback(async () => {
    try {
      setIsDriversLoading(true);
      const response = await api.get('/users/drivers');
      const payload = response?.data;
      const driversList =
        payload?.data?.users ||
        payload?.data?.drivers ||
        payload?.data ||
        payload?.users ||
        payload?.drivers ||
        payload ||
        [];
      setAvailableDrivers(Array.isArray(driversList) ? driversList : []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
      setAvailableDrivers([]);
      throw error;
    } finally {
      setIsDriversLoading(false);
    }
  }, []);

  const handleToggleDeliverySelection = deliveryId => {
    setSelectedDeliveries(prev => {
      const next = new Set(prev);
      if (next.has(deliveryId)) {
        next.delete(deliveryId);
      } else {
        next.add(deliveryId);
      }
      return next;
    });
  };

  const handleToggleSelectAllOnPage = () => {
    setSelectedDeliveries(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredDeliveryIds.forEach(id => next.delete(id));
      } else {
        filteredDeliveryIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleOpenAssignModal = async () => {
    setAssignError('');
    setIsAssignModalOpen(true);
    if (availableDrivers.length === 0) {
      try {
        await loadDrivers();
      } catch {
        setAssignError('Failed to load drivers. Please try again.');
      }
    }
  };

  const handleCloseAssignModal = () => {
    setIsAssignModalOpen(false);
    setSelectedDriverId('');
    setAssignError('');
  };

  const handleAssignDriverSubmit = async () => {
    if (!selectedDriverId) {
      setAssignError('Please select a driver to assign.');
      return;
    }
    const deliveryIds = Array.from(selectedDeliveries);
    if (deliveryIds.length === 0) {
      setAssignError('Select at least one delivery.');
      return;
    }
    try {
      setIsAssigning(true);
      const response = await api.patch('/deliveries/assign-driver', {
        deliveryIds,
        driverId: selectedDriverId
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to assign driver');
      }
      handleCloseAssignModal();
      setSelectedDeliveries(new Set());
      await fetchDeliveries();
      alert(response.data?.message || 'Driver assigned successfully');
    } catch (error) {
      console.error('Assign driver error:', error);
      setAssignError(error.response?.data?.message || error.message || 'Failed to assign driver');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDeleteSelectedDeliveries = async () => {
    if (!hasSelections) {
      alert('Select at least one delivery to delete.');
      return;
    }

    const deliveryIds = Array.from(selectedDeliveries);
    const confirmed = window.confirm(`Delete ${deliveryIds.length} selected deliveries? This cannot be undone.`);
    if (!confirmed) return;

    try {
      setIsDeletingSelected(true);
      const response = await api.delete('/deliveries/by-ids', { data: { deliveryIds } });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to delete selected deliveries');
      }
      setSelectedDeliveries(new Set());
      await fetchDeliveries();
      alert(response.data?.message || 'Deleted selected deliveries');
    } catch (error) {
      console.error('Delete selected deliveries error:', error);
      alert(error.response?.data?.message || error.message || 'Failed to delete selected deliveries');
    } finally {
      setIsDeletingSelected(false);
    }
  };



  const selectedCount = selectedDeliveries.size;
  const hasSelections = selectedCount > 0;

  // Smart sticker printing logic
  const handleOpenStickerModal = () => {
    if (filteredDeliveries.length === 0) {
      alert('No deliveries available for printing.');
      return;
    }

    let deliveriesToPrint = [];

    if (hasSelections) {
      // If deliveries are selected, print only selected ones
      deliveriesToPrint = filteredDeliveries.filter(delivery => 
        selectedDeliveries.has(delivery._id)
      );
      console.log(`Printing ${deliveriesToPrint.length} selected deliveries`);
    } else {
      // If no selection, print ALL filtered deliveries
      deliveriesToPrint = filteredDeliveries;
      console.log(`No selection - printing all ${deliveriesToPrint.length} filtered deliveries`);
    }

    // Set the deliveries to print in a state that the modal can access
    setStickerDeliveries(deliveriesToPrint);
    setIsStickerModalOpen(true);
  };

  // Bag tag printing uses the same selection rules as sticker printing
  const handleOpenBagTagModal = () => {
    if (filteredDeliveries.length === 0) {
      alert('No deliveries available for bag tags.');
      return;
    }

    let deliveriesToPrint = filteredDeliveries;

    if (hasSelections) {
      deliveriesToPrint = filteredDeliveries.filter(delivery => selectedDeliveries.has(delivery._id));
      if (deliveriesToPrint.length === 0) {
        alert('Selected deliveries are not in the current view. Clear filters or select visible deliveries.');
        return;
      }
    }

    setBagTagDeliveries(deliveriesToPrint);
    setIsBagTagModalOpen(true);
  };
  const getDriverDisplayName = driver => {
    if (!driver) return 'Unnamed driver';
    const firstName = driver.profile?.firstName || driver.firstName;
    const lastName = driver.profile?.lastName || driver.lastName;
    const fallback = driver.name || driver.email || driver.username || driver._id;
    const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
    return combined || fallback || 'Unnamed driver';
  };

const getStatusColor = (status) => {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'assigned': return 'bg-blue-100 text-blue-800';
    case 'picked_up': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const EARLY_THRESHOLD_MINUTES = 180;

const formatDuration = (minutes = 0) => {
  const value = Math.abs(Math.round(minutes));
  if (value < 60) {
    return `${value}m`;
  }

  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return `${hours}h:${mins.toString().padStart(2, '0')}m`;
};

const getTimingInfo = (delivery) => {
  if (!delivery.deliveredTime || !delivery.scheduledTime) {
    return { text: delivery.status === 'delivered' ? 'No timing data' : 'Pending', className: 'text-gray-500', icon: Clock };
  }

  const scheduled = new Date(delivery.scheduledTime);
  const delivered = new Date(delivery.deliveredTime);

  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(delivered.getTime())) {
    return { text: 'Pending', className: 'text-gray-500', icon: Clock };
  }

  const diffMinutes = Math.round((delivered - scheduled) / (1000 * 60));
  const earlyCutoff = new Date(scheduled.getTime() - EARLY_THRESHOLD_MINUTES * 60 * 1000);

  if (diffMinutes > 0) {
    const lateMinutes = delivery.lateMinutes ?? diffMinutes;
    return { text: `+${formatDuration(lateMinutes)} late`, className: 'text-red-600', icon: Clock };
  }

  if (delivered < earlyCutoff) {
    const earlyMinutes = delivery.earlyMinutes ?? Math.max(0, Math.round((earlyCutoff - delivered) / (1000 * 60)));
    return { text: `${formatDuration(earlyMinutes)} early`, className: 'text-yellow-600', icon: Clock };
  }

  return { text: 'On time', className: 'text-green-600', icon: CheckCircle };
};

  const formatDate = (dateString) => {
    if (!dateString) return 'Date not set';
    try {
      const date = new Date(dateString);
      
      // Use local time methods directly - don't apply offset
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Convert to 12-hour format
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const formattedHours = String(hours).padStart(2, '0');
      
      return `${month}/${day}/${year}, ${formattedHours}:${minutes} ${ampm}`;
    } catch {
      return 'Invalid date';
    }
  };

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
  };

  const handleRefresh = () => fetchDeliveries();

  const handleOpenDeleteModal = () => {
    setIsDeleteModalOpen(true);
    setDeleteMessage('');
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setDeleteMessage('');
  };

  const handleDeleteDeliveries = async () => {
    if (!deleteStartDate || !deleteEndDate) {
      setDeleteMessage('Please select both start and end dates');
      return;
    }

    const start = new Date(`${deleteStartDate}T00:00:00`);
    const end = new Date(`${deleteEndDate}T23:59:59`);

    if (start > end) {
      setDeleteMessage('Start date must be before or equal to end date');
      return;
    }

    const deliveryCount = deliveries.filter(d => {
      const deliveryDate = new Date(d.scheduledTime);
      return deliveryDate >= start && deliveryDate <= end;
    }).length;

    if (deliveryCount === 0) {
      setDeleteMessage('No deliveries found for the selected date range');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to DELETE ${deliveryCount} deliveries from ${deleteStartDate} to ${deleteEndDate}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await api.delete('/deliveries/bulk-delete', {
        data: {
          dateFrom: start.toISOString(),
          dateTo: end.toISOString()
        }
      });

      if (response.data?.success) {
        setDeleteMessage(`✓ Successfully deleted ${response.data?.data?.deletedCount || deliveryCount} deliveries`);
        setTimeout(() => {
          handleCloseDeleteModal();
          fetchDeliveries();
        }, 1500);
      } else {
        setDeleteMessage(response.data?.message || 'Failed to delete deliveries');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setDeleteMessage(error.response?.data?.message || 'Failed to delete deliveries');
    } finally {
      setIsDeleting(false);
    }
  };

  const formattedSelectedDate = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString()
    : 'All Dates';

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading deliveries...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-600 font-medium">Error loading deliveries</div>
            <button
              onClick={handleRefresh}
              className="ml-auto flex items-center px-3 py-1 text-sm bg-red-100 text-red-700 rounded"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Retry
            </button>
          </div>
          <div className="text-red-600 text-sm mt-1">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Deliveries</h1>
          <p className="text-gray-600 text-xs md:text-sm">
            Showing {filteredDeliveries.length} of {totalDeliveriesCount} deliveries for {formattedSelectedDate}
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 text-gray-600 bg-gray-200 rounded-lg disabled:opacity-50 active:bg-gray-300 text-sm md:text-base"
          >
            <RefreshCw className={`w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleOpenStickerModal}
            disabled={filteredDeliveries.length === 0}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-indigo-700 text-sm md:text-base"
            title={hasSelections ? `Print stickers for ${selectedCount} selected deliveries` : `Print stickers for all ${filteredDeliveries.length} deliveries`}
          >
            <Printer className="w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2" />
            <span>{hasSelections ? `Print (${selectedCount})` : `Print (${filteredDeliveries.length})`}</span>
          </button>
          <button
            onClick={handleOpenAssignModal}
            disabled={!hasSelections}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-green-700 text-sm md:text-base"
          >
            <UserCheck className="w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2" />
            <span>Assign</span>
          </button>

          <button
            onClick={handleDeleteSelectedDeliveries}
            disabled={!hasSelections || isDeletingSelected}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-red-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-red-600 text-sm md:text-base"
            title="Delete selected deliveries"
          >
            <Trash2 className={`w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2 ${isDeletingSelected ? 'animate-spin' : ''}`} />
            <span>{isDeletingSelected ? 'Deleting...' : 'Delete Selected'}</span>
          </button>
          <button
            onClick={handleOpenDeleteModal}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 active:bg-red-800 text-sm md:text-base"
            title="Delete deliveries for a date range"
          >
            <Trash2 className="w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <button
            onClick={handleOpenBagTagModal}
            disabled={filteredDeliveries.length === 0}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700 active:bg-emerald-800 text-sm md:text-base"
            title={hasSelections ? `Print bag tags for ${selectedCount} selected deliveries` : `Print bag tags for all ${filteredDeliveries.length} deliveries`}
          >
            <Printer className="w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Bag Tag</span>
          </button>
          <button
            onClick={() => setIsZoneColorModalOpen(true)}
            disabled={areaOptions.length === 0}
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 active:bg-purple-800 text-sm md:text-base"
            title="Manage zone colors"
          >
            <Palette className="w-4 md:w-5 h-4 md:h-5 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Zones</span>
          </button>
          <Link
            to="/add-delivery"
            className="w-full sm:w-auto flex items-center justify-center px-3 md:px-4 py-2.5 md:py-2 bg-blue-500 text-white rounded-lg active:bg-blue-600 text-sm md:text-base"
          >
            <span>+ Add</span>
          </Link>
        </div>
      </div>

      {isBagTagModalOpen && (
        <BagTagPrintModal
          deliveries={bagTagDeliveries}
          onClose={() => {
            setIsBagTagModalOpen(false);
            setBagTagDeliveries([]);
          }}
        />
      )}

      {isZoneColorModalOpen && (
        <ZoneColorManager
          isOpen={isZoneColorModalOpen}
          onClose={() => setIsZoneColorModalOpen(false)}
          zones={areaOptions}
        />
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-2 md:gap-4">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 md:w-5 h-4 md:h-5" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2.5 border border-gray-300 rounded-lg outline-none text-sm md:text-base"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full md:w-auto px-3 md:px-4 py-2.5 border border-gray-300 rounded-lg outline-none text-sm md:text-base"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="picked_up">Picked Up</option>
          <option value="delivered">Delivered</option>
          <option value="collected">Collected</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full md:w-auto px-3 md:px-4 py-2.5 border border-gray-300 rounded-lg outline-none text-sm md:text-base"
        >
          <option value="all">All Types</option>
          <option value="Delivery">Delivery</option>
          <option value="Task">Task</option>
          <option value="Collection">Collection</option>
        </select>
        {areaOptions.length > 0 && (
          <select
            value={areaFilter}
            onChange={e => setAreaFilter(e.target.value)}
            className="w-full md:w-auto px-3 md:px-4 py-2.5 border border-gray-300 rounded-lg outline-none text-sm md:text-base"
          >
            <option value="all">All Areas</option>
            {areaOptions.map(area => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        )}

        <select
          value={timingFilter}
          onChange={(e) => setTimingFilter(e.target.value)}
          className="w-full md:w-auto px-3 md:px-4 py-2.5 border border-gray-300 rounded-lg outline-none text-sm md:text-base"
        >
          <option value="all">All Timing</option>
          <option value="late">Late Only</option>
          <option value="early">Early Only</option>
        </select>

        {/* View Mode Toggle */}
        <div className="hidden md:flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-2 flex items-center ${
              viewMode === 'table' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-600'
            }`}
            title="Table view"
          >
            <Table className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-2 flex items-center border-l border-gray-300 ${
              viewMode === 'grid' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-600'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>
      {hasSelections && (
        <div className="text-xs md:text-sm text-blue-600 font-medium">
          {selectedCount} delivery{selectedCount === 1 ? '' : 'ies'} selected
        </div>
      )}

      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs md:text-sm text-gray-500">Date</label>
          <input
            type="date"
            value={selectedDate || ''}
            onChange={handleDateChange}
            className="flex-1 md:flex-none px-2 md:px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm md:text-base"
          />
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="text-xs md:text-sm px-2.5 md:px-3 py-2.5 border border-gray-200 rounded-lg whitespace-nowrap"
          >
            Today
          </button>
        </div>
        <div className="text-xs md:text-sm text-gray-500 md:ml-auto mt-1 md:mt-0">
          Total {totalDeliveriesCount} deliveries
        </div>
      </div>

      {/* Deliveries Table/Grid View */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-8">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    onChange={handleToggleSelectAllOnPage}
                    checked={filteredDeliveryIds.length > 0 && allFilteredSelected}
                    disabled={filteredDeliveryIds.length === 0}
                  />
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-28">
                  Customer
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-14">
                  Type
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-16">
                  Company
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-16">
                  Area
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-20">
                  Time
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-20">
                  Status
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-20">
                  Driver
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-16">
                  Late/Early
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-16">
                  Timing
                </th>
                <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wide w-10">
                  Proof
                </th>
                <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wide w-12">
                  Act
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDeliveries.map((delivery, index) => {
                const timingInfo = getTimingInfo(delivery);
                const TimingIcon = timingInfo.icon;

                return (
                  <tr
                    key={delivery._id}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                        checked={selectedDeliveries.has(delivery._id)}
                        onChange={() => handleToggleDeliverySelection(delivery._id)}
                      />
                    </td>
                    <td className="px-2 py-1 w-28">
                      <div className="truncate">
                        <div className="text-xs font-medium text-gray-900 truncate" title={delivery.customerName}>
                          {delivery.customerName}
                        </div>
                        <div className="text-xs text-gray-400 truncate" title={delivery.customerId}>{delivery.customerId}</div>
                      </div>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs">
                      {delivery.type === 'Task' ? (
                        <span className="px-1 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">
                          Task
                        </span>
                      ) : delivery.type === 'Collection' ? (
                        <span className="px-1 py-0.5 text-xs font-medium rounded bg-teal-100 text-teal-700">
                          Collect
                        </span>
                      ) : (
                        <span className="px-1 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                          Deliv
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-900 truncate">
                      {delivery.company}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-900 truncate">
                      {delivery.zone ? <span title={delivery.zone} className="truncate">{delivery.zone}</span> : '—'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-900">
                      {formatDate(delivery.scheduledTime)}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getStatusColor(delivery.status)}`}>
                        {delivery.status?.replace('_', ' ').substring(0, 8) || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-900 truncate">
                      {delivery.driver ? (
                        <div className="truncate" title={`${delivery.driver.profile?.firstName || ''} ${delivery.driver.profile?.lastName || ''}`}>
                          {delivery.driver.profile?.firstName || '—'}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs">
                      {delivery.lateMinutes && delivery.lateMinutes > 0 ? (
                        <span className="text-red-600 font-semibold">
                          +{formatDuration(delivery.lateMinutes)}
                        </span>
                      ) : delivery.earlyMinutes && delivery.earlyMinutes > 0 ? (
                        <span className="text-yellow-600 font-semibold">
                          -{formatDuration(delivery.earlyMinutes)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs">
                      <span className={`font-medium flex items-center justify-center ${timingInfo.className}`}>
                        <TimingIcon className="w-3 h-3" title={timingInfo.text} />
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs text-center">
                      {delivery.proof?.images?.length > 0 ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs">
                      <div className="flex space-x-1 justify-center">
                        <Link
                          to={`/deliveries/${delivery._id}`}
                          className="text-blue-600 hover:text-blue-800"
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <button className="text-gray-600 hover:text-gray-800" title="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredDeliveries.length === 0 && (
          <div className="text-center py-12">
            {totalDeliveriesCount === 0 ? (
              <>
                <div className="text-gray-400 text-lg">No deliveries found</div>
                <div className="text-gray-500 mt-2">Create your first delivery to get started</div>
                <Link
                  to="/add-delivery"
                  className="inline-block mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Add Delivery
                </Link>
              </>
            ) : (
              <>
                <div className="text-gray-400 text-lg">No deliveries match your search</div>
                <div className="text-gray-500 mt-2">Try adjusting your search criteria</div>
              </>
            )}
          </div>
        )}
      </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDeliveries.map((delivery, index) => {
            const timingInfo = getTimingInfo(delivery);
            const TimingIcon = timingInfo.icon;
            const isSelected = selectedDeliveries.has(delivery._id);

            return (
              <div
                key={delivery._id}
                className={`bg-white rounded-lg border-2 p-4 ${
                  isSelected ? 'border-blue-500' : 'border-gray-200'
                }`}
              >
                {/* Checkbox */}
                <div className="flex items-start justify-between mb-3">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded mt-1"
                    checked={isSelected}
                    onChange={() => handleToggleDeliverySelection(delivery._id)}
                  />
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(delivery.status)}`}>
                    {delivery.status?.replace('_', ' ') || 'Unknown'}
                  </span>
                </div>

                {/* Customer Info */}
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {delivery.customerName}
                  </h3>
                  <p className="text-sm text-gray-500">{delivery.customerId}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-sm text-gray-600">{delivery.company}</span>
                    {delivery.type === 'Task' ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                        Task: {delivery.taskType || 'General'}
                      </span>
                    ) : delivery.type === 'Collection' ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-teal-100 text-teal-800">
                        Collection
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        Delivery
                      </span>
                    )}
                  </div>
                </div>

                {/* Address */}
                {delivery.address && (
                  <div className="flex items-start mb-3 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-gray-400" />
                    <span className="break-words">{delivery.address}</span>
                  </div>
                )}

                {/* Area & Time */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 mr-2">Area:</span>
                    <span className="text-gray-900 font-medium">{delivery.zone || '—'}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Clock className="w-4 h-4 mr-2 text-gray-400" />
                    <span className="text-gray-900">{formatDate(delivery.scheduledTime)}</span>
                  </div>
                </div>

                {/* Driver */}
                <div className="flex items-center mb-3 text-sm">
                  <User className="w-4 h-4 mr-2 text-gray-400" />
                  {delivery.driver ? (
                    <span className="text-gray-900">
                      {delivery.driver.profile?.firstName} {delivery.driver.profile?.lastName}
                    </span>
                  ) : (
                    <span className="text-gray-500">Unassigned</span>
                  )}
                </div>

                {/* Timing */}
                <div className={`flex items-center mb-3 text-sm font-medium ${timingInfo.className}`}>
                  <TimingIcon className="w-4 h-4 mr-1" />
                  {timingInfo.text}
                </div>

                {/* Proof */}
                <div className="flex items-center mb-4 text-sm">
                  <span className="text-gray-500 mr-2">Proof:</span>
                  {delivery.proof?.images?.length > 0 ? (
                    <span className="text-green-600 flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Yes
                    </span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-3 border-t border-gray-100">
                  <Link
                    to={`/deliveries/${delivery._id}`}
                    className="flex-1 flex items-center justify-center px-3 py-2 text-blue-600 bg-blue-50 rounded-lg"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Link>
                  <button className="flex-1 flex items-center justify-center px-3 py-2 text-gray-600 bg-gray-50 rounded-lg">
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
          
          {filteredDeliveries.length === 0 && (
            <div className="col-span-full text-center py-12">
              {totalDeliveriesCount === 0 ? (
                <>
                  <div className="text-gray-400 text-lg">No deliveries found</div>
                  <div className="text-gray-500 mt-2">Create your first delivery to get started</div>
                  <Link
                    to="/add-delivery"
                    className="inline-block mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Add Delivery
                  </Link>
                </>
              ) : (
                <>
                  <div className="text-gray-400 text-lg">No deliveries match your search</div>
                  <div className="text-gray-500 mt-2">Try adjusting your search criteria</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Assign Driver</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Assign {selectedCount} delivery{selectedCount === 1 ? '' : 'ies'} to a driver
                </p>
              </div>
              <button
                onClick={handleCloseAssignModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="text-sm font-medium text-gray-700">Driver</label>
              <select
                value={selectedDriverId}
                onChange={e => {
                  setSelectedDriverId(e.target.value);
                  setAssignError('');
                }}
                disabled={isDriversLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="">Select a driver</option>
                {availableDrivers.map(driver => (
                  <option key={driver._id} value={driver._id}>
                    {getDriverDisplayName(driver)}
                  </option>
                ))}
              </select>
              {isDriversLoading && (
                <p className="text-sm text-gray-500">Loading drivers...</p>
              )}
              {assignError && (
                <p className="text-sm text-red-600">{assignError}</p>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleCloseAssignModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignDriverSubmit}
                disabled={
                  isAssigning ||
                  isDriversLoading ||
                  availableDrivers.length === 0 ||
                  !selectedDriverId
                }
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isAssigning ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4 mr-2" />
                    Assign Driver
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Deliveries by Date</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Delete all deliveries within a date range
                </p>
              </div>
              <button
                onClick={handleCloseDeleteModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={deleteStartDate}
                  onChange={(e) => setDeleteStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={deleteEndDate}
                  onChange={(e) => setDeleteEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              
              {deleteMessage && (
                <div className={`p-3 rounded-lg text-sm ${
                  deleteMessage.includes('✓')
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {deleteMessage}
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Warning:</strong> This action will permanently delete all deliveries in the selected date range. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleCloseDeleteModal}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDeliveries}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Deliveries
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <StickerDesignerModal
        isOpen={isStickerModalOpen}
        onClose={() => setIsStickerModalOpen(false)}
        deliveries={stickerDeliveries}
      />
    </>
  );
};

export default Deliveries;
