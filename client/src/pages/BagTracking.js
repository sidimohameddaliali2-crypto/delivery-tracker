import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { createBag, createBulkBags, assignBag, deleteBag } from '../store/slices/bagSlice';
import { fetchDrivers } from '../store/slices/driverSlice';
import api from '../utils/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const FLAGGED_BAG_THRESHOLD = 3;

const STATUS_BADGE = {
  available: { label: 'Available', cls: 'bg-blue-50 text-blue-600' },
  maintenance: { label: 'Needs Repair', cls: 'bg-amber-50 text-amber-600' },
};

const CONDITION_BADGE = {
  excellent: { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-600' },
  good: { label: 'Good', cls: 'bg-emerald-50 text-emerald-600' },
  fair: { label: 'Fair', cls: 'bg-amber-50 text-amber-600' },
  poor: { label: 'Poor', cls: 'bg-red-50 text-red-600' },
};

const LOCATION_META = {
  warehouse: { label: 'Warehouse', icon: 'inventory_2' },
  driver: { label: 'With Driver', icon: 'local_shipping' },
  customer: { label: 'With Customer', icon: 'person' },
};

const getDriverDisplayName = (driver) => {
  if (!driver) return null;
  return driver.profile
    ? `${driver.profile.firstName || ''} ${driver.profile.lastName || ''}`.trim() || driver.email
    : (driver.name || driver.email);
};

const getBadgeMeta = (bag) => {
  if (bag.status === 'maintenance') return STATUS_BADGE.maintenance;
  if (bag.status === 'available') return STATUS_BADGE.available;
  return CONDITION_BADGE[bag.condition] || CONDITION_BADGE.good;
};

const BagTracking = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { drivers = [] } = useSelector((state) => state.driver || {});

  const [allBags, setAllBags] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('available');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedBag, setSelectedBag] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [selectedFlaggedCustomer, setSelectedFlaggedCustomer] = useState(null);
  const [showFlaggedDetailsModal, setShowFlaggedDetailsModal] = useState(false);

  const [showBagCollectionModal, setShowBagCollectionModal] = useState(false);
  const [bagCollectionData, setBagCollectionData] = useState({
    customer: null,
    driver: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '09:00'
  });

  const loadDismissed = () => {
    try {
      const raw = localStorage.getItem('dismissedCustomers');
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  };
  const [dismissedCustomers, setDismissedCustomers] = useState(loadDismissed);

  useEffect(() => {
    localStorage.setItem('dismissedCustomers', JSON.stringify(Array.from(dismissedCustomers)));
  }, [dismissedCustomers]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadAllBags = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/bags', { params: { page: 1, limit: 5000 } });
      setAllBags(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load bags:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllBags();
    dispatch(fetchDrivers({ includeInactive: true }));
  }, [loadAllBags, dispatch]);

  const flaggedCustomers = useMemo(() => {
    if (!Array.isArray(allBags) || allBags.length === 0) return [];
    const customerMap = new Map();
    allBags.forEach((bag) => {
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
      .filter((entry) => !dismissedCustomers.has(entry.key))
      .sort((a, b) => b.bags.length - a.bags.length);
  }, [allBags, dismissedCustomers]);

  const tabCounts = useMemo(() => ({
    available: allBags.filter((b) => b.status === 'available').length,
    assigned: allBags.filter((b) => b.status !== 'available').length,
    flagged: flaggedCustomers.reduce((sum, c) => sum + c.bags.length, 0),
    on_time_use: allBags.filter((b) => b.bagType === 'on_time_use').length,
  }), [allBags, flaggedCustomers]);

  const matchesSearch = useCallback((bag) => {
    if (!debouncedSearch || debouncedSearch.length < 2) return true;
    const term = debouncedSearch.toLowerCase();
    const driverName = getDriverDisplayName(bag.assignedTo?.driver) || '';
    return (
      bag.bagId?.toLowerCase().includes(term) ||
      bag.assignedTo?.customer?.customerName?.toLowerCase().includes(term) ||
      driverName.toLowerCase().includes(term)
    );
  }, [debouncedSearch]);

  const displayedBags = useMemo(() => {
    if (activeTab === 'flagged') return [];
    let filtered = allBags;
    if (activeTab === 'available') filtered = allBags.filter((b) => b.status === 'available');
    else if (activeTab === 'assigned') filtered = allBags.filter((b) => b.status !== 'available');
    else if (activeTab === 'on_time_use') filtered = allBags.filter((b) => b.bagType === 'on_time_use');
    return filtered.filter(matchesSearch);
  }, [allBags, activeTab, matchesSearch]);

  const displayedFlaggedCustomers = useMemo(() => {
    if (activeTab !== 'flagged') return [];
    if (!debouncedSearch || debouncedSearch.length < 2) return flaggedCustomers;
    const term = debouncedSearch.toLowerCase();
    return flaggedCustomers.filter((c) =>
      c.customerName?.toLowerCase().includes(term) ||
      c.customerId?.toLowerCase().includes(term) ||
      c.bags.some((b) => b.bagId?.toLowerCase().includes(term))
    );
  }, [activeTab, flaggedCustomers, debouncedSearch]);

  const getLinkedDeliveryId = (bag) => {
    if (!bag) return null;
    if (typeof bag.currentDelivery === 'string') return bag.currentDelivery;
    if (bag.currentDelivery?._id) return bag.currentDelivery._id;
    return null;
  };

  const handleCustomerClick = (event, bag) => {
    event?.preventDefault();
    event?.stopPropagation();
    const deliveryId = getLinkedDeliveryId(bag);
    if (deliveryId) {
      const currentPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
      navigate(`/deliveries/${deliveryId}`, { state: { returnTo: currentPath } });
    } else {
      alert('This bag is not linked to a delivery yet.');
    }
  };

  const openDetails = (bag) => {
    setSelectedBag(bag);
    setShowDetailsModal(true);
  };

  const handleDismissFlaggedCustomer = (customerKey) => {
    setDismissedCustomers((prev) => new Set(prev).add(customerKey));
  };

  const handleAssignBagCollection = (customer) => {
    const firstBag = customer.bags[0];
    const address = firstBag.assignedTo?.customer?.address || '';
    if (!address) {
      alert('Cannot create task: Customer address is missing. Please ensure bags have delivery information.');
      return;
    }
    setBagCollectionData({
      customer,
      driver: '',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '09:00'
    });
    setShowBagCollectionModal(true);
  };

  const handleCreateBagCollectionTask = async () => {
    try {
      if (!bagCollectionData.driver) { alert('Please select a driver'); return; }
      if (!bagCollectionData.scheduledDate) { alert('Please select a date'); return; }

      const customer = bagCollectionData.customer;
      const firstBag = customer.bags[0];
      const address = firstBag.assignedTo?.customer?.address || '';
      const company = firstBag.assignedTo?.customer?.company || 'Matter';
      const customerId = customer.customerId || customer.customerName.replace(/\s+/g, '_').toUpperCase();
      const scheduledDateTime = new Date(`${bagCollectionData.scheduledDate}T${bagCollectionData.scheduledTime}`);

      const taskData = {
        type: 'Task',
        taskType: 'Bag Collection',
        customerName: customer.customerName,
        customerId,
        address,
        company,
        scheduledTime: scheduledDateTime.toISOString(),
        driver: bagCollectionData.driver,
        status: 'pending',
        notes: `Collect ${customer.bags.length} bag(s). Bag IDs: ${customer.bags.map((b) => b.bagId).join(', ')}`,
        requireProof: true,
        todoList: [
          { text: `Collect ${customer.bags.length} bag(s) from customer`, completed: false },
          { text: 'Verify bag condition', completed: false },
          { text: 'Capture photos of returned bags', completed: false }
        ]
      };

      const response = await api.post('/deliveries', taskData);
      if (response.data.success) {
        alert('Bag collection task created successfully!');
        handleDismissFlaggedCustomer(bagCollectionData.customer.key);
        setShowBagCollectionModal(false);
      } else {
        throw new Error(response.data.message || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to create bag collection task:', error);
      alert(error?.response?.data?.message || error.message || 'Failed to create bag collection task');
    }
  };

  const openFlaggedDetails = async (customer) => {
    try {
      const res = await api.get(`/alerts/flagged/${encodeURIComponent(customer.key)}`);
      if (res?.data?.success) {
        setSelectedFlaggedCustomer({ customer, ...res.data });
        setShowFlaggedDetailsModal(true);
      } else {
        alert('Failed to load flagged customer details');
      }
    } catch (err) {
      console.error('Error loading flagged details', err);
      alert('Error loading flagged customer details');
    }
  };

  const handleDownloadFlaggedBagsExcel = () => {
    try {
      if (!flaggedCustomers.length) { alert('No flagged bags to download'); return; }
      const rows = flaggedCustomers.map((customer) => ({
        'Customer Name': customer.customerName || '-',
        'Customer ID': customer.customerId || '-',
        'Bag Count': customer.bags?.length || 0,
        'Bag IDs': (customer.bags || []).map((b) => b.bagId).filter(Boolean).join(', ')
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Flagged Bags');
      XLSX.writeFile(wb, `Flagged_Bags_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to generate Excel:', err);
      alert('Failed to generate Excel report');
    }
  };

  const handleDownloadFlaggedBagsPDF = () => {
    try {
      if (!flaggedCustomers.length) { alert('No flagged bags to download'); return; }
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Flagged Customers Report', 14, 20);
      doc.setFontSize(11);
      doc.text(`Total Flagged Customers: ${flaggedCustomers.length}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 37);

      const tableData = flaggedCustomers.map((c) => [
        c.customerName || '-',
        c.customerId || '-',
        String(c.bags.length),
        c.bags.map((b) => b.bagId).join(', ')
      ]);

      doc.autoTable({
        startY: 45,
        head: [['Customer', 'Customer ID', 'Bags', 'Bag IDs']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 158, 11] },
        columnStyles: { 3: { cellWidth: 90 } }
      });

      doc.save(`Flagged_Bags_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Failed to generate PDF report');
    }
  };

  const handleReportBag = async (bagIdInput, reason) => {
    const target = allBags.find((b) => b.bagId?.toUpperCase() === bagIdInput.trim().toUpperCase());
    if (!target) throw new Error('Bag not found. Check the bag ID and try again.');
    await api.patch(`/bags/${target._id}/update-flag`, { flagReason: reason });
    await loadAllBags();
  };

  const handleUnflagBag = async (bag) => {
    await api.patch(`/bags/${bag._id}/unflag`);
    await loadAllBags();
    setShowDetailsModal(false);
  };

  const handleReturnBag = async (bag) => {
    await api.patch(`/bags/${bag._id}/return`, { status: 'available' });
    await loadAllBags();
    setShowDetailsModal(false);
  };

  const handleAssignSubmit = async ({ driverId, customerId, customerName, notes }) => {
    await dispatch(assignBag({ bagId: selectedBag._id, driverId, customerId, customerName, notes })).unwrap();
    await loadAllBags();
    setShowDetailsModal(false);
  };

  const handleDeleteBag = async (bag) => {
    if (!window.confirm(`Delete bag ${bag.bagId}? This cannot be undone.`)) return;
    try {
      await dispatch(deleteBag(bag._id)).unwrap();
      await loadAllBags();
      setShowDetailsModal(false);
    } catch (error) {
      alert(error?.message || 'Failed to delete bag');
    }
  };

  const handleCreateSingle = async (form) => {
    await dispatch(createBag(form)).unwrap();
    await loadAllBags();
  };

  const handleCreateBulk = async (bagsData) => {
    await dispatch(createBulkBags(bagsData)).unwrap();
    await loadAllBags();
  };

  const tabs = [
    { key: 'available', label: 'Available' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'flagged', label: 'Flagged' },
    { key: 'on_time_use', label: 'On-Time Used' },
  ];

  return (
    <div className="matter-analytics p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bag Tracking</h2>
          <p className="text-sm text-gray-500 mt-1">Manage and track secure transport bags across the network.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">report_problem</span>
            Report Bag
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Bag
          </button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex space-x-1 w-full md:w-auto overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded whitespace-nowrap transition-colors ${
                activeTab === t.key ? 'bg-gray-100 text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t.label} ({tabCounts[t.key]})
            </button>
          ))}
        </div>
        <div className="w-full md:w-64 relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">qr_code_scanner</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Scan or search bag ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Flagged toolbar (export buttons) */}
      {activeTab === 'flagged' && flaggedCustomers.length > 0 && (
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={handleDownloadFlaggedBagsExcel}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">download</span> Excel
          </button>
          <button
            onClick={handleDownloadFlaggedBagsPDF}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">download</span> PDF
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span> Loading bags...
        </div>
      ) : activeTab === 'flagged' ? (
        displayedFlaggedCustomers.length === 0 ? (
          <EmptyState label={debouncedSearch ? 'No matching customers' : 'No flagged customers'} sub={debouncedSearch ? 'Try adjusting your search' : `All customers currently have fewer than ${FLAGGED_BAG_THRESHOLD} bags`} />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {displayedFlaggedCustomers.map((customer) => (
              <FlaggedCustomerCard
                key={customer.key}
                customer={customer}
                onOpenDetails={() => openFlaggedDetails(customer)}
                onDismiss={() => handleDismissFlaggedCustomer(customer.key)}
              />
            ))}
          </motion.div>
        )
      ) : displayedBags.length === 0 ? (
        <EmptyState label="No bags found" sub={debouncedSearch ? 'Try adjusting your search' : 'Create your first bag to get started'} />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {displayedBags.map((bag) => (
            <BagCard key={bag._id} bag={bag} onDetails={() => openDetails(bag)} onCustomerClick={handleCustomerClick} />
          ))}
        </motion.div>
      )}

      {showAddModal && (
        <AddBagModal
          onClose={() => setShowAddModal(false)}
          onCreateSingle={handleCreateSingle}
          onCreateBulk={handleCreateBulk}
        />
      )}

      {showReportModal && (
        <ReportBagModal onClose={() => setShowReportModal(false)} onSubmit={handleReportBag} />
      )}

      {showDetailsModal && selectedBag && (
        <BagDetailsModal
          bag={selectedBag}
          drivers={drivers}
          onClose={() => setShowDetailsModal(false)}
          onAssign={handleAssignSubmit}
          onReturn={() => handleReturnBag(selectedBag)}
          onDelete={() => handleDeleteBag(selectedBag)}
          onUnflag={() => handleUnflagBag(selectedBag)}
          onCustomerClick={handleCustomerClick}
        />
      )}

      {showFlaggedDetailsModal && selectedFlaggedCustomer && (
        <FlaggedCustomerDetailsModal
          data={selectedFlaggedCustomer}
          onClose={() => { setShowFlaggedDetailsModal(false); setSelectedFlaggedCustomer(null); }}
          onAssignCollection={(customer) => handleAssignBagCollection(customer)}
        />
      )}

      {showBagCollectionModal && (
        <BagCollectionModal
          data={bagCollectionData}
          drivers={drivers}
          onChange={setBagCollectionData}
          onClose={() => setShowBagCollectionModal(false)}
          onSubmit={handleCreateBagCollectionTask}
        />
      )}
    </div>
  );
};

const EmptyState = ({ label, sub }) => (
  <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
    <span className="material-symbols-outlined text-gray-300 text-[48px]">inventory_2</span>
    <h3 className="text-base font-medium text-gray-900 mt-2">{label}</h3>
    <p className="text-sm text-gray-500 mt-1">{sub}</p>
  </div>
);

const BagCard = ({ bag, onDetails, onCustomerClick }) => {
  const badge = getBadgeMeta(bag);
  const isFlaggedRepair = bag.status === 'maintenance';
  const isAvailable = bag.status === 'available';
  const locationMeta = LOCATION_META[bag.location] || LOCATION_META.warehouse;
  const driverName = getDriverDisplayName(bag.assignedTo?.driver);
  const customerName = bag.assignedTo?.customer?.customerName;
  const assignedLabel = customerName || driverName || 'Unassigned';
  const inspectionDate = bag.lastMaintenance || bag.updatedAt;

  return (
    <div className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow duration-200 group relative overflow-hidden ${isFlaggedRepair ? 'ring-1 ring-amber-300 border-amber-200' : 'border-gray-200'}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${isAvailable ? 'text-blue-600' : 'text-gray-500'}`}>
            {isAvailable ? 'lock_open' : 'lock'}
          </span>
          <span className="font-mono font-bold text-sm text-gray-900">{bag.bagId}</span>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      <div className="space-y-2 mb-3 text-sm">
        {isAvailable ? (
          <>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Current Location</p>
              <p className="font-medium text-gray-900">{locationMeta.label}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Last Inspection</p>
              <p className="text-gray-700">{inspectionDate ? new Date(inspectionDate).toLocaleDateString() : '—'}</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Assigned To</p>
              {customerName ? (
                <button
                  type="button"
                  onClick={(e) => onCustomerClick(e, bag)}
                  className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  {assignedLabel}
                </button>
              ) : (
                <p className="font-medium text-gray-900">{assignedLabel}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Assigned Date</p>
              <p className="text-gray-700">{bag.assignedTo?.assignmentTime ? new Date(bag.assignedTo.assignmentTime).toLocaleDateString() : '—'}</p>
            </div>
          </>
        )}
      </div>

      <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">
            {isFlaggedRepair ? 'warning' : locationMeta.icon}
          </span>
          {isFlaggedRepair ? 'Maintenance' : locationMeta.label}
        </span>
        <button
          onClick={onDetails}
          className="text-blue-600 hover:text-blue-700 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Details
        </button>
      </div>
    </div>
  );
};

const FlaggedCustomerCard = ({ customer, onOpenDetails, onDismiss }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer" onClick={onOpenDetails}>
    <div className="flex justify-between items-start mb-3">
      <div>
        <p className="font-semibold text-gray-900 text-sm">{customer.customerName}</p>
        <p className="text-xs text-gray-500">{customer.customerId ? `ID: ${customer.customerId}` : 'No customer ID'}</p>
      </div>
      <div className="flex items-center gap-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">{customer.bags.length} bags</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="p-0.5 text-gray-500 hover:text-gray-700 hover:bg-amber-100 rounded"
          title="Dismiss"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
    <div className="flex flex-wrap gap-1 mb-3">
      {customer.bags.slice(0, 6).map((b) => (
        <span key={b._id} className="px-1.5 py-0.5 text-[10px] font-mono bg-white text-gray-700 rounded border border-amber-200">
          {b.bagId}
        </span>
      ))}
      {customer.bags.length > 6 && (
        <span className="px-1.5 py-0.5 text-[10px] text-gray-500">+{customer.bags.length - 6} more</span>
      )}
    </div>
    <div className="pt-3 border-t border-amber-200 flex justify-end">
      <span className="text-amber-700 text-xs font-semibold">Details →</span>
    </div>
  </div>
);

const AddBagModal = ({ onClose, onCreateSingle, onCreateBulk }) => {
  const [mode, setMode] = useState('single');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [singleForm, setSingleForm] = useState({ bagId: '', condition: 'good', location: 'warehouse', bagType: 'standard', notes: '' });
  const [bulkForm, setBulkForm] = useState({ prefix: 'BAG-', startNumber: 1, endNumber: 10, padLength: 5, condition: 'good', location: 'warehouse', bagType: 'standard' });

  const totalBulkBags = Math.max(0, bulkForm.endNumber - bulkForm.startNumber + 1);

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onCreateSingle(singleForm);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to create bag');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (totalBulkBags > 5000) {
      setError('Please generate 5000 or fewer bags at a time.');
      return;
    }
    setSaving(true);
    try {
      const { prefix, startNumber, endNumber, padLength, condition, location, bagType } = bulkForm;
      const bagData = [];
      for (let i = startNumber; i <= endNumber; i++) {
        bagData.push({
          bagId: `${prefix}${i.toString().padStart(padLength, '0')}`,
          condition,
          location,
          bagType,
          status: 'available'
        });
      }
      await onCreateBulk(bagData);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to create bulk bags');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="matter-analytics fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-xl">
          <h2 className="text-lg font-semibold text-gray-900">Add Bag</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`px-4 py-1.5 text-sm font-medium ${mode === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`px-4 py-1.5 text-sm font-medium border-l border-gray-200 ${mode === 'bulk' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Bulk
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bag ID *</label>
              <input
                type="text"
                required
                value={singleForm.bagId}
                onChange={(e) => setSingleForm((p) => ({ ...p, bagId: e.target.value }))}
                placeholder="e.g., BAG000001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select
                  value={singleForm.condition}
                  onChange={(e) => setSingleForm((p) => ({ ...p, condition: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={singleForm.location}
                  onChange={(e) => setSingleForm((p) => ({ ...p, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="warehouse">Warehouse</option>
                  <option value="driver">With Driver</option>
                  <option value="customer">With Customer</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bag Type</label>
              <select
                value={singleForm.bagType}
                onChange={(e) => setSingleForm((p) => ({ ...p, bagType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="standard">Standard</option>
                <option value="on_time_use">On-Time Use (single-use pool)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={singleForm.notes}
                onChange={(e) => setSingleForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional notes about the bag..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:opacity-90 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Bag'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                <input
                  type="text"
                  value={bulkForm.prefix}
                  onChange={(e) => setBulkForm((p) => ({ ...p, prefix: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pad Length</label>
                <input
                  type="number"
                  min="0"
                  value={bulkForm.padLength}
                  onChange={(e) => setBulkForm((p) => ({ ...p, padLength: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Number</label>
                <input
                  type="number"
                  min="1"
                  value={bulkForm.startNumber}
                  onChange={(e) => setBulkForm((p) => ({ ...p, startNumber: parseInt(e.target.value, 10) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Number</label>
                <input
                  type="number"
                  min={bulkForm.startNumber}
                  value={bulkForm.endNumber}
                  onChange={(e) => setBulkForm((p) => ({ ...p, endNumber: parseInt(e.target.value, 10) || bulkForm.startNumber }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>{totalBulkBags} bags</strong> will be created: {bulkForm.prefix}{bulkForm.startNumber.toString().padStart(bulkForm.padLength, '0')} to {bulkForm.prefix}{bulkForm.endNumber.toString().padStart(bulkForm.padLength, '0')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select
                  value={bulkForm.condition}
                  onChange={(e) => setBulkForm((p) => ({ ...p, condition: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={bulkForm.location}
                  onChange={(e) => setBulkForm((p) => ({ ...p, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="warehouse">Warehouse</option>
                  <option value="driver">With Driver</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bag Type</label>
              <select
                value={bulkForm.bagType}
                onChange={(e) => setBulkForm((p) => ({ ...p, bagType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="standard">Standard</option>
                <option value="on_time_use">On-Time Use (single-use pool)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Use "On-Time Use" to generate a dedicated single-use bag batch tracked under the On-Time Used tab.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:opacity-90 disabled:opacity-50">
                {saving ? 'Creating…' : `Create ${totalBulkBags} Bags`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const ReportBagModal = ({ onClose, onSubmit }) => {
  const [bagId, setBagId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!bagId.trim() || !reason.trim()) {
      setError('Please enter a bag ID and a reason.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(bagId, reason);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to report bag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="matter-analytics fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Report Bag</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-500">Flag a bag for the store keeper's attention (damage, missing, wrong condition, etc).</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bag ID *</label>
            <input
              type="text"
              value={bagId}
              onChange={(e) => setBagId(e.target.value)}
              placeholder="e.g., BAG000042"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe the issue with this bag..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:opacity-90 disabled:opacity-50">
              {saving ? 'Reporting…' : 'Report Bag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const BagDetailsModal = ({ bag, drivers, onClose, onAssign, onReturn, onDelete, onUnflag, onCustomerClick }) => {
  const [assignForm, setAssignForm] = useState({ driverId: '', customerId: '', customerName: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const driverName = getDriverDisplayName(bag.assignedTo?.driver);
  const customerName = bag.assignedTo?.customer?.customerName;

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!assignForm.driverId) { setError('Please select a driver'); return; }
    setSaving(true);
    try {
      await onAssign(assignForm);
    } catch (err) {
      setError(err?.message || 'Failed to assign bag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="matter-analytics fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-500">{bag.status === 'available' ? 'lock_open' : 'lock'}</span>
            <h2 className="text-lg font-semibold text-gray-900 font-mono">{bag.bagId}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {bag.isFlagged && (
            <div className="flex items-start justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-amber-800">Reported</p>
                <p className="text-xs text-amber-700">{bag.flagReason || 'No reason provided'}</p>
              </div>
              <button onClick={onUnflag} className="text-xs font-medium text-amber-700 hover:underline flex-shrink-0">Clear</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Status</p>
              <p className="font-medium text-gray-900 capitalize">{bag.status?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Condition</p>
              <p className="font-medium text-gray-900 capitalize">{bag.condition}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Location</p>
              <p className="font-medium text-gray-900">{LOCATION_META[bag.location]?.label || bag.location}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Bag Type</p>
              <p className="font-medium text-gray-900">{bag.bagType === 'on_time_use' ? 'On-Time Use' : 'Standard'}</p>
            </div>
            {customerName && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Customer</p>
                <button onClick={(e) => onCustomerClick(e, bag)} className="font-medium text-indigo-600 hover:underline text-left">{customerName}</button>
              </div>
            )}
            {driverName && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Driver</p>
                <p className="font-medium text-gray-900">{driverName}</p>
              </div>
            )}
            {bag.assignedTo?.assignmentTime && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Assigned On</p>
                <p className="font-medium text-gray-900">{new Date(bag.assignedTo.assignmentTime).toLocaleString()}</p>
              </div>
            )}
            {bag.notes && (
              <div className="col-span-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                <p className="text-gray-700">{bag.notes}</p>
              </div>
            )}
          </div>

          {bag.status === 'available' ? (
            <form onSubmit={handleAssignSubmit} className="pt-4 border-t border-gray-100 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Assign to Driver</h3>
              <select
                value={assignForm.driverId}
                onChange={(e) => setAssignForm((p) => ({ ...p, driverId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a driver</option>
                {(drivers || []).map((d) => (
                  <option key={d._id} value={d._id}>{getDriverDisplayName(d) || d.email}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Customer ID (optional)"
                  value={assignForm.customerId}
                  onChange={(e) => setAssignForm((p) => ({ ...p, customerId: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Customer Name (optional)"
                  value={assignForm.customerName}
                  onChange={(e) => setAssignForm((p) => ({ ...p, customerName: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
              <button type="submit" disabled={saving} className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:opacity-90 disabled:opacity-50">
                {saving ? 'Assigning…' : 'Assign Bag'}
              </button>
            </form>
          ) : (
            <div className="pt-4 border-t border-gray-100">
              <button onClick={onReturn} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                <span className="material-symbols-outlined text-[18px]">undo</span>
                Return to Warehouse
              </button>
            </div>
          )}

          <div className="pt-2">
            <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete Bag
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FlaggedCustomerDetailsModal = ({ data, onClose, onAssignCollection }) => {
  const { customer, alert: alertInfo, bags = [], deliveries = [] } = data || {};

  const handleSendSlack = async () => {
    try {
      const payload = {
        customerName: customer?.customerName || 'Unknown',
        customerId: customer?.customerId || '',
        bagCount: bags?.length || 0,
        bagIds: (bags || []).map((b) => b.bagId).filter(Boolean)
      };
      await api.post('/alerts/flagged-customer', payload);
      alert('Sent flagged customer to Slack');
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Failed to send to Slack');
    }
  };

  return (
    <div className="matter-analytics fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{customer.customerName}</h2>
            <p className="text-sm text-gray-500">{customer.customerId ? `ID: ${customer.customerId}` : 'No customer ID'}</p>
            <p className="text-xs text-gray-400">Last Alert: {alertInfo?.lastSent ? new Date(alertInfo.lastSent).toLocaleString() : 'Never'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSendSlack} className="px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-xs font-medium">Send to Slack</button>
            <button onClick={() => { onAssignCollection(customer); onClose(); }} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:opacity-90 text-xs font-medium">Assign Collection</button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><span className="material-symbols-outlined">close</span></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Bags ({bags.length})</h3>
            <div className="grid grid-cols-1 gap-2">
              {bags.map((b) => (
                <div key={b._id} className="p-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-between">
                  <div>
                    <div className="font-mono font-medium text-sm text-gray-900">{b.bagId}</div>
                    <div className="text-xs text-gray-500">{b.assignedTo?.customer?.customerName || 'No customer'}</div>
                  </div>
                  <div className="text-right text-sm text-gray-700">
                    <div className="capitalize">{b.status}</div>
                    <div className="text-xs text-gray-500">{b.assignedTo?.assignmentTime ? new Date(b.assignedTo.assignmentTime).toLocaleDateString() : '-'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Collection Tasks ({deliveries.length})</h3>
            {deliveries.length === 0 ? (
              <p className="text-xs text-gray-500">No collection tasks found for this customer.</p>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div key={d._id} className="p-3 border border-gray-200 rounded-lg bg-white">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium text-gray-900">{d.taskType || d.type}</div>
                      <div className="text-gray-500 capitalize">{d.status}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Scheduled: {d.scheduledTime ? new Date(d.scheduledTime).toLocaleString() : '-'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const BagCollectionModal = ({ data, drivers, onChange, onClose, onSubmit }) => (
  <div className="matter-analytics fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Assign Bag Collection Task</h2>
        {data.customer && (
          <>
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-700">Customer: {data.customer.customerName}</p>
              <p className="text-sm text-gray-500">Bags: {data.customer.bags.length}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Driver *</label>
                <select
                  value={data.driver}
                  onChange={(e) => onChange({ ...data, driver: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a driver...</option>
                  {drivers.map((driver) => (
                    <option key={driver._id} value={driver._id}>{getDriverDisplayName(driver) || driver.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date *</label>
                <input
                  type="date"
                  value={data.scheduledDate}
                  onChange={(e) => onChange({ ...data, scheduledDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
                <input
                  type="time"
                  value={data.scheduledTime}
                  onChange={(e) => onChange({ ...data, scheduledTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
              <button onClick={onSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90 text-sm font-medium">Create Task</button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);

export default BagTracking;
