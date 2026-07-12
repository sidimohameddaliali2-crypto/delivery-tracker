import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { List } from 'react-window';
import { 
  Plus, 
  Upload, 
  Search, 
  Package,
  User,
  MapPin,
  Clock,
  Edit,
  Trash2,
  Users,
  RefreshCw,
  X,
  Download
} from 'lucide-react';
import { fetchBags, createBag, createBulkBags, assignBag, deleteBag } from '../store/slices/bagSlice';
import { fetchDrivers } from '../store/slices/driverSlice';
import api from '../utils/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Memoized bag row component for virtualization
const BagRow = memo(({ index, style, data }) => {
  const bag = data.items[index];
  if (!bag) return null;

  const { 
    getStatusColor, 
    getConditionColor, 
    handleCustomerClick, 
    openAssignModal, 
    handleDeleteBag 
  } = data.handlers || {};

  return (
    <div style={style} className="px-4 py-2">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-2"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900">{bag.bagId}</h3>
            </div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(bag.status)}`}>
              {bag.status?.replace('_', ' ') || 'Unknown'}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Condition:</span>
              <span className={`font-medium ${getConditionColor(bag.condition)}`}>
                {bag.condition || 'Unknown'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Location:</span>
              <span className="font-medium text-gray-900">{bag.location || 'Unknown'}</span>
            </div>

            {bag.assignedTo?.customer?.customerName && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Customer:</span>
                <button
                  type="button"
                  onClick={(event) => handleCustomerClick(event, bag)}
                  className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none"
                >
                  {bag.assignedTo.customer?.customerName}
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <span className="text-xs text-gray-500">Actions hidden</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

BagRow.displayName = 'BagRow';

const formatScanAction = (action) => {
  if (action === 'assign_scan') return 'Assign Scan';
  if (action === 'return_scan') return 'Return Scan';
  if (action === 'status_check') return 'Status Check';
  return 'Scan';
};

const BagTracking = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    bags = [], 
    isLoading,
    pagination = { page: 1, limit: 50, totalPages: 1 },
    total = 0
  } = useSelector(state => state.bag );
  const { drivers = [] } = useSelector(state => state.driver || {});
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('assigned');
  const [showAll, setShowAll] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [bulkRemoveInput, setBulkRemoveInput] = useState('');
  const [isBulkRemoving, setIsBulkRemoving] = useState(false);
  const [bulkRemoveRange, setBulkRemoveRange] = useState({
    prefix: 'BAG-',
    start: 1,
    end: 10,
    padLength: 5
  });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBagHistoryModal, setShowBagHistoryModal] = useState(false);
  const [selectedBag, setSelectedBag] = useState(null);
  // Load dismissed customers from localStorage for persistence
  const loadDismissed = () => {
    try {
      const raw = localStorage.getItem('dismissedCustomers');
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  };
  const [dismissedCustomers, setDismissedCustomers] = useState(loadDismissed);
    // Debounce search input
    useEffect(() => {
      const handler = setTimeout(() => {
          setDebouncedSearch(searchTerm);
        }, 800);
      return () => clearTimeout(handler);
    }, [searchTerm]);

    // Persist dismissed customers to localStorage
    useEffect(() => {
      localStorage.setItem('dismissedCustomers', JSON.stringify(Array.from(dismissedCustomers)));
    }, [dismissedCustomers]);
  const [showFlaggedModal, setShowFlaggedModal] = useState(false);
  const [showOnTimeUsedBagModal, setShowOnTimeUsedBagModal] = useState(false);
  const [todayStoreKeeperScans, setTodayStoreKeeperScans] = useState([]);
  const [flaggedCustomersSearch, setFlaggedCustomersSearch] = useState('');
  const [showFlaggedDetailsModal, setShowFlaggedDetailsModal] = useState(false);
  const [flaggedDetailData, setFlaggedDetailData] = useState(null);
  const [showBagCollectionModal, setShowBagCollectionModal] = useState(false);
  const [bagCollectionData, setBagCollectionData] = useState({
    customer: null,
    driver: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '09:00'
  });
  const FLAGGED_BAG_THRESHOLD = 3;

  useEffect(() => {
    dispatch(fetchDrivers({ includeInactive: true }));
  }, [dispatch]);

  const loadTodayStoreKeeperScans = useCallback(() => {
    api
      .get('/store-keeper-scans/today?limit=1000')
      .then((response) => {
        setTodayStoreKeeperScans(response.data?.data || []);
      })
      .catch((error) => {
        console.error('Failed to load Store Keeper scan history:', error);
        setTodayStoreKeeperScans([]);
      });
  }, []);

  useEffect(() => {
    loadTodayStoreKeeperScans();
  }, [loadTodayStoreKeeperScans]);

  useEffect(() => {
    const limit = showAll ? 10000 : 50;
    const page = showAll ? 1 : currentPage;
    console.log('🔄 Fetching bags with filters:', { page, limit, status: activeTab, search: debouncedSearch, showAll });
    const searchParam = debouncedSearch && debouncedSearch.length >= 2 ? debouncedSearch : undefined;
    dispatch(fetchBags({
      page,
      limit,
      status: activeTab !== 'all' && activeTab !== 'with_driver' ? activeTab : undefined,
      location: activeTab === 'with_driver' ? 'driver' : undefined,
      search: searchParam
    }));
  }, [dispatch, currentPage, activeTab, debouncedSearch, showAll]);

  // Form states
   const [bagForm, setBagForm] = useState({
    bagId: '',
    condition: 'good',
    location: 'warehouse',
    notes: ''
  });
  

  const [bulkForm, setBulkForm] = useState({
    prefix: 'BAG-',
    startNumber: 1,
    endNumber: 10,
    condition: 'good',
    location: 'warehouse'
  });

  const normalizeBagPrefix = (rawPrefix) => {
    const trimmed = String(rawPrefix || '').trim();
    if (!trimmed) return 'BAG-';
    if (trimmed.toUpperCase() === 'BAG') return 'BAG-';
    return trimmed;
  };

  const [assignForm, setAssignForm] = useState({
    driverId: '',
    customerId: '',
    customerName: '',
    notes: '',
  });

  // We don't need to filter bags anymore since the server handles it
  const displayBags = bags || [];

// Debug effect for monitoring bags state
useEffect(() => {
    console.log('📊 Bags state:', {
      bagsCount: bags?.length || 0,
      totalBags: total,
      currentPage,
      isLoading,
      status: activeTab
    });
  }, [bags, total, currentPage, isLoading, activeTab]);

// Bulk create handler
const handleBulkCreate = async (e) => {
    e.preventDefault();
    try {
      const { prefix, startNumber, endNumber, condition, location } = bulkForm;
  const normalizedPrefix = normalizeBagPrefix(prefix);
      const bagData = [];
      
      console.log('🔄 Generating bulk bags:', { startNumber, endNumber, total: endNumber - startNumber + 1 });
      
      for (let i = startNumber; i <= endNumber; i++) {
        bagData.push({
          bagId: `${normalizedPrefix}${i.toString().padStart(5, '0')}`,
          condition,
          location,
          status: 'available'
        });
      }
      
      console.log('📤 Dispatching bulk create with', bagData.length, 'bags');
      const result = await dispatch(createBulkBags(bagData)).unwrap();
      console.log('✅ Bulk create result:', result);
      
      setShowBulkModal(false);
      setBulkForm({
        prefix: 'BAG-',
        startNumber: 1,
        endNumber: 10,
        condition: 'good',
        location: 'warehouse'
      });
    } catch (error) {
      console.error('❌ Failed to create bulk bags:', error);
    }
  };

  // FIXED: Safe filtering with default empty array
 

 const handleCreateBag = async (e) => {
    e.preventDefault();
    try {
      await dispatch(createBag(bagForm)).unwrap();
      setShowAddModal(false);
      setBagForm({ bagId: '', condition: 'good', location: 'warehouse', notes: '' });
    } catch (error) {
      console.error('Failed to create bag:', error);
    }
  };



   const handleAssignBag = async (e) => {
    e.preventDefault();
    if (!selectedBag) return;
    
    try {
      const { driverId, customerId, customerName, notes } = assignForm;

      const payload = {
        bagId: selectedBag._id,
        driverId,
      };

      if (customerId?.trim()) payload.customerId = customerId.trim();
      if (customerName?.trim()) payload.customerName = customerName.trim();
      if (notes?.trim()) payload.notes = notes.trim();

      await dispatch(assignBag(payload)).unwrap();
      
      setShowAssignModal(false);
      setSelectedBag(null);
      setAssignForm({
        driverId: '',
        customerId: '',
        customerName: '',
        notes: '',
      });
    } catch (error) {
      console.error('Failed to assign bag:', error);
    }
  };

  const handleDeleteBag = async (bagId) => {
    if (!bagId) return;
    const ok = window.confirm('Are you sure you want to delete this bag? This action cannot be undone.');
    if (!ok) return;

    try {
      await dispatch(deleteBag(bagId)).unwrap();
    } catch (error) {
      console.error('Failed to delete bag:', error);
      alert(error?.message || 'Failed to delete bag');
    }
  };

  const handleDeleteAllBags = async () => {
    const confirmed = window.confirm(
      `⚠️ WARNING: This will delete ALL ${total} bags from the system!\n\nThis action CANNOT be undone.\n\nAre you absolutely sure you want to continue?`
    );
    
    if (!confirmed) return;

    // Double confirmation
    const doubleConfirm = window.confirm(
      'This is your last chance to cancel.\n\nType YES in the next prompt to confirm deletion of ALL bags.'
    );
    
    if (!doubleConfirm) return;

    const finalConfirm = window.prompt('Type "DELETE ALL BAGS" to confirm (case sensitive):');
    
    if (finalConfirm !== 'DELETE ALL BAGS') {
      alert('Deletion cancelled - confirmation text did not match.');
      return;
    }

    try {
      const response = await api.delete('/bags');
      
      if (response.data.success) {
        alert(`✅ Successfully deleted ${response.data.deletedCount} bags`);
        // Refresh the bags list
        dispatch(fetchBags({ page: 1, limit: 50, status: activeTab !== 'all' ? activeTab : undefined }));
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Failed to delete all bags:', error);
      alert(error?.response?.data?.message || 'Failed to delete all bags');
    }
  };

  const handleBulkRemoveByBagIds = async () => {
    const bagIds = Array.from(
      new Set(
        String(bulkRemoveInput || '')
          .split(/[\s,;\n\r\t]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );

    if (bagIds.length === 0) {
      alert('Please enter at least one bag number (bag ID).');
      return;
    }

    const confirmed = window.confirm(`Delete ${bagIds.length} bag(s) by bag number?`);
    if (!confirmed) return;

    try {
      setIsBulkRemoving(true);
      const response = await api.delete('/bags/bulk-by-bag-ids', {
        data: { bagIds }
      });

      const deletedCount = response.data?.deletedCount || 0;
      const missingBagIds = response.data?.missingBagIds || [];

      alert(
        `Deleted ${deletedCount} bag(s).${
          missingBagIds.length > 0
            ? `\nNot found: ${missingBagIds.slice(0, 10).join(', ')}${missingBagIds.length > 10 ? ' ...' : ''}`
            : ''
        }`
      );

      setShowBulkRemoveModal(false);
      setBulkRemoveInput('');

      const limit = showAll ? 10000 : 50;
      const page = showAll ? 1 : currentPage;
      const searchParam = debouncedSearch && debouncedSearch.length >= 2 ? debouncedSearch : undefined;
      dispatch(fetchBags({
        page,
        limit,
        status: activeTab !== 'all' ? activeTab : undefined,
        search: searchParam
      }));
    } catch (error) {
      console.error('Failed to bulk remove bags:', error);
      alert(error?.response?.data?.message || 'Failed to remove bags');
    } finally {
      setIsBulkRemoving(false);
    }
  };

  const handleAddRangeToBulkRemoveInput = () => {
    const prefix = normalizeBagPrefix(bulkRemoveRange.prefix);
    const start = Number.parseInt(bulkRemoveRange.start, 10);
    const end = Number.parseInt(bulkRemoveRange.end, 10);
    const padLength = Math.max(0, Number.parseInt(bulkRemoveRange.padLength, 10) || 0);

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
      alert('Invalid range. Ensure Start and End are valid numbers and End >= Start.');
      return;
    }

    const generated = [];
    for (let num = start; num <= end; num += 1) {
      const idNumber = padLength > 0 ? String(num).padStart(padLength, '0') : String(num);
      generated.push(`${prefix}${idNumber}`);
      if (generated.length >= 5000) break;
    }

    if (generated.length === 0) return;

    const existing = String(bulkRemoveInput || '')
      .split(/[\s,;\n\r\t]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    const merged = Array.from(new Set([...existing, ...generated]));
    setBulkRemoveInput(merged.join('\n'));
  };

  const handleDismissFlaggedCustomer = (customerKey) => {
    setDismissedCustomers(prev => {
      const updated = new Set(prev);
      updated.add(customerKey);
      return updated;
    });
  };

  const handleAssignBagCollection = async (customer) => {
    // Get customer address from the first bag's customer data
    const firstBag = customer.bags[0];
    const address = firstBag.assignedTo?.customer?.address || '';

    // Validate required fields
    if (!address) {
      alert('Cannot create task: Customer address is missing. Please ensure bags have delivery information.');
      return;
    }

    // Open modal to get driver and date
    setBagCollectionData({
      customer: customer,
      driver: '',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '09:00'
    });
    setShowBagCollectionModal(true);
  };

  const handleCreateBagCollectionTask = async () => {
    try {
      if (!bagCollectionData.driver) {
        alert('Please select a driver');
        return;
      }

      if (!bagCollectionData.scheduledDate) {
        alert('Please select a date');
        return;
      }

      const customer = bagCollectionData.customer;
      const firstBag = customer.bags[0];
      const address = firstBag.assignedTo?.customer?.address || '';
      const company = firstBag.assignedTo?.customer?.company || 'Matter';
      const customerId = customer.customerId || customer.customerName.replace(/\s+/g, '_').toUpperCase();

      // Combine date and time
      const scheduledDateTime = new Date(`${bagCollectionData.scheduledDate}T${bagCollectionData.scheduledTime}`);

      const taskData = {
        type: 'Task',
        taskType: 'Bag Collection',
        customerName: customer.customerName,
        customerId: customerId,
        address: address,
        company: company,
        scheduledTime: scheduledDateTime.toISOString(),
        driver: bagCollectionData.driver,
        status: 'pending',
        notes: `Collect ${customer.bags.length} bag(s). Bag IDs: ${customer.bags.map(b => b.bagId).join(', ')}`,
        requireProof: true,
        todoList: [
          { text: `Collect ${customer.bags.length} bag(s) from customer`, completed: false },
          { text: 'Verify bag condition', completed: false },
          { text: 'Capture photos of returned bags', completed: false }
        ]
      };

      console.log('Creating bag collection task:', taskData);

      const response = await api.post('/deliveries', taskData);
      
      if (response.data.success) {
        alert(`Bag collection task created successfully!`);
        handleDismissFlaggedCustomer(bagCollectionData.customer.key);
        setShowBagCollectionModal(false);
      } else {
        throw new Error(response.data.message || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to create bag collection task:', error);
      
      let errorMessage = 'Failed to create bag collection task';
      if (error.response?.data?.errors) {
        const validationErrors = error.response.data.errors.map(e => `${e.path}: ${e.msg}`).join('\n');
        errorMessage += `\n\nValidation errors:\n${validationErrors}`;
      } else if (error.response?.data?.message) {
        errorMessage += `\n\n${error.response.data.message}`;
      } else if (error.message) {
        errorMessage += `\n\n${error.message}`;
      }
      
      alert(errorMessage);
    }
  };

   const openAssignModal = (bag) => {
    setSelectedBag(bag);
    setShowAssignModal(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'in_use': return 'bg-yellow-100 text-yellow-800';
      case 'maintenance': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleOpenFlaggedModal = () => {
    setShowFlaggedModal(true);
  };

  // (Flagged sidebar removed - use Flagged Customers modal from header button)

  const openFlaggedDetails = async (customer) => {
    try {
      const key = customer.key;
      const res = await api.get(`/alerts/flagged/${encodeURIComponent(key)}`);
      if (res?.data?.success) {
        setFlaggedDetailData({ customer, ...res.data });
        setShowFlaggedDetailsModal(true);
      } else {
        console.error('Failed to load flagged details', res?.data);
        alert('Failed to load flagged customer details');
      }
    } catch (err) {
      console.error('Error loading flagged details', err);
      alert('Error loading flagged customer details');
    }
  };

  const getConditionColor = (condition) => {
    switch (condition) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const handleDownloadAssignedBagsExcel = () => {
    try {
      const assignedBags = bags.filter(b => b.status === 'assigned');
      
      if (assignedBags.length === 0) {
        alert('No assigned bags to download');
        return;
      }

      const bagsData = assignedBags.map(b => ({
        'Bag ID': b.bagId || '-',
        'Status': b.status || '-',
        'Condition': b.condition || '-',
        'Location': b.location || '-',
        'Customer': b.assignedTo?.customer?.customerName || '-',
        'Customer ID': b.assignedTo?.customer?.customerId || '-',
        'Driver': b.assignedTo?.driver?.profile 
          ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() 
          : (b.assignedTo?.driver?.email || '-'),
        'Driver ID': b.assignedTo?.driver?._id || '-',
        'Assigned Date': b.assignedTo?.assignmentTime 
          ? new Date(b.assignedTo.assignmentTime).toLocaleString() 
          : '-',
        'Notes': b.notes || '-'
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(bagsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Assigned Bags');
      
      const fileName = `Assigned_Bags_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      alert(`Excel report downloaded successfully! (${assignedBags.length} bags)`);
    } catch (err) {
      console.error('Failed to generate Excel:', err);
      alert('Failed to generate Excel report');
    }
  };

  const handleDownloadAssignedBagsPDF = () => {
    try {
      const assignedBags = bags.filter(b => b.status === 'assigned');
      
      if (assignedBags.length === 0) {
        alert('No assigned bags to download');
        return;
      }

      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text('Assigned Bags Report', 14, 20);
      
      // Add summary
      doc.setFontSize(11);
      doc.text(`Total Assigned Bags: ${assignedBags.length}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 37);
      
      // Add bags table
      const bagsTableData = assignedBags.map(b => [
        b.bagId || '-',
        b.condition || '-',
        b.location || '-',
        b.assignedTo?.customer?.customerName || '-',
        b.assignedTo?.driver?.profile 
          ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() 
          : (b.assignedTo?.driver?.email || '-'),
        b.assignedTo?.assignmentTime 
          ? new Date(b.assignedTo.assignmentTime).toLocaleDateString() 
          : '-'
      ]);
      
      doc.autoTable({
        startY: 45,
        head: [['Bag ID', 'Condition', 'Location', 'Customer', 'Driver', 'Assigned Date']],
        body: bagsTableData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 35 },
          4: { cellWidth: 35 },
          5: { cellWidth: 30 }
        }
      });
      
      // Download file
      const fileName = `Assigned_Bags_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      alert(`PDF report downloaded successfully! (${assignedBags.length} bags)`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Failed to generate PDF report');
    }
  };

  const handleDownloadFlaggedBagsExcel = () => {
    try {
      if (!flaggedCustomers || flaggedCustomers.length === 0) {
        alert('No flagged bags to download');
        return;
      }

      const rows = flaggedCustomers.map((customer) => ({
        'Customer Name': customer.customerName || '-',
        'Customer ID': customer.customerId || '-',
        'Bag Count': customer.bags?.length || 0,
        'Bag IDs': (customer.bags || []).map((b) => b.bagId).filter(Boolean).join(', ')
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Flagged Bags');

      const fileName = `Flagged_Bags_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      alert(`Excel report downloaded successfully! (${flaggedCustomers.length} customers)`);
    } catch (err) {
      console.error('Failed to generate Excel:', err);
      alert('Failed to generate Excel report');
    }
  };

  const flaggedCustomers = useMemo(() => {
    if (!Array.isArray(bags) || bags.length === 0) {
      return [];
    }

    const customerMap = new Map();

    bags.forEach((bag) => {
      // Count all bags that have a customer assigned (regardless of status)
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

    console.log('Flagged customers calculation:', {
      totalBags: bags.length,
      bagsWithCustomer: bags.filter(b => b?.assignedTo?.customer).length,
      customerCount: customerMap.size,
      flaggedCount: Array.from(customerMap.values()).filter(e => e?.bags?.length >= FLAGGED_BAG_THRESHOLD).length
    });

    return Array.from(customerMap.values())
      .filter(entry => entry?.bags?.length >= FLAGGED_BAG_THRESHOLD)
      .filter(entry => !dismissedCustomers.has(entry.key))
      .sort((a, b) => b.bags.length - a.bags.length);
  }, [bags, dismissedCustomers]);

  const getLinkedDeliveryId = (bag) => {
    if (!bag) return null;
    if (typeof bag.currentDelivery === 'string') {
      return bag.currentDelivery;
    }
    if (bag.currentDelivery?._id) {
      return bag.currentDelivery._id;
    }
    return null;
  };

  const handleCustomerClick = (event, bag) => {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();

    const deliveryId = getLinkedDeliveryId(bag);
    if (deliveryId) {
      const currentPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
      navigate(`/deliveries/${deliveryId}`, {
        state: {
          returnTo: currentPath
        }
      });
      return;
    }

    if (bag?.assignedTo?.customer?.customerId) {
      alert('This bag is not linked to a delivery yet. Assign it to a delivery to view details.');
    } else {
      alert('No delivery details are available for this customer yet.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading bags...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start gap-6">
        <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bag Tracking</h1>
          <p className="text-gray-500">Manage and track delivery bags</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => dispatch(fetchBags())}
            className="flex items-center px-3 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {activeTab === 'assigned' && (
            <>
              <button
                onClick={handleDownloadAssignedBagsExcel}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Excel
              </button>
              <button
                onClick={handleDownloadAssignedBagsPDF}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Download className="w-4 h-4 mr-2" />
                PDF
              </button>
            </>
          )}
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Add
          </button>
          <button
            onClick={() => setShowBulkRemoveModal(true)}
            className="flex items-center px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Bulk Remove
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Bag
          </button>
          <button
            onClick={handleDeleteAllBags}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 border-2 border-red-700"
            title="Delete all bags from the system"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by bag ID, customer, or driver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('available')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'available' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Available
          </button>
          <button
            onClick={() => setActiveTab('assigned')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'assigned' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Assigned
          </button>
          <button
            onClick={() => setActiveTab('with_driver')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'with_driver' ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            With Driver
          </button>
          <button
            onClick={handleOpenFlaggedModal}
            className="flex items-center px-4 py-2 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 relative"
          >
            <Users className="w-4 h-4 mr-2" />
            Flagged Bags
            {flaggedCustomers.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {flaggedCustomers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowOnTimeUsedBagModal(true)}
            className="flex items-center px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 relative"
          >
            <Clock className="w-4 h-4 mr-2" />
            On Time Used Bag
          </button>
        </div>
      </div>

      {/* Store Keeper Daily Scan History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Today Store Keeper Scan History</h2>
            <p className="text-xs text-gray-500">All bags scanned today by Store Keeper</p>
          </div>
          <button
            onClick={loadTodayStoreKeeperScans}
            className="flex items-center px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </button>
        </div>

        {todayStoreKeeperScans.length === 0 ? (
          <p className="text-sm text-gray-500">No Store Keeper scans recorded today.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Bag ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Result</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {todayStoreKeeperScans.map((entry, idx) => (
                  <tr key={`${entry.bagId || 'bag'}-${entry.timestamp || idx}-${idx}`}>
                    <td className="px-3 py-2 text-gray-600">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{entry.bagId || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{formatScanAction(entry.action)}</td>
                    <td className="px-3 py-2 text-gray-600">{entry.result || entry.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bags Count */}
      <div className="text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">{isLoading ? 'Loading...' : `${bags.length} bags`}</div>
          <button
            type="button"
            onClick={() => setShowAll(prev => !prev)}
            className="text-sm px-2 py-1 bg-gray-100 rounded text-gray-700 hover:bg-gray-200"
          >
            {showAll ? 'Show paginated' : 'Show all bags'}
          </button>
        </div>
      </div>

      {/* Bags Section */}
      {isLoading ? (
          // Loading skeletons
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="animate-pulse space-y-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-12 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
        ) : bags.length === 0 ? (
          // Empty state
          <div className="text-center py-10 bg-white rounded-lg shadow-sm border border-gray-200">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No bags found</h3>
            <p className="text-gray-500">
              {searchTerm 
                ? 'Try adjusting your search criteria'
                : activeTab !== 'all'
                  ? `No bags in "${activeTab}" status`
                  : 'Create your first bag to get started'
              }
            </p>
          </div>
        ) : (
          // Table View
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col max-h-[calc(100vh-280px)]">
            <div className="overflow-y-auto flex-1">
              <table className="w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Bag ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Condition
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Driver
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Assigned On
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Assigned By
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bags.map((b) => (
                    <tr key={b._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4 text-blue-500" />
                          <span className="font-semibold text-gray-900">{b.bagId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(b.status)}`}>
                          {b.status?.replace('_', ' ') || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`font-medium text-sm ${getConditionColor(b.condition)}`}>
                          {b.condition || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {b.location || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {b.assignedTo?.customer?.customerName ? (
                          <button
                            type="button"
                            onClick={(event) => handleCustomerClick(event, b)}
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none"
                          >
                            {b.assignedTo.customer.customerName}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {b.assignedTo?.driver ? (
                          <span>
                            {b.assignedTo.driver?.profile 
                              ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() 
                              : (b.assignedTo.driver?.name || b.assignedTo.driver?.email || '—')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {b.assignedTo?.assignmentTime 
                          ? new Date(b.assignedTo.assignmentTime).toLocaleString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {b.assignedTo?.assignedByName || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex space-x-2 justify-center">
                          <button
                            onClick={() => {
                              setSelectedBag(b);
                              setShowBagHistoryModal(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800"
                            title="Assignment History"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAssignModal(b)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Assign"
                          >
                            <User className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteBag(b._id)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {!isLoading && bags.length > 0 && !showAll && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md
                  ${currentPage === 1 
                    ? 'text-gray-300 bg-white' 
                    : 'text-gray-700 bg-white hover:bg-gray-50'}`}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(page => Math.min(pagination.totalPages, page + 1))}
                disabled={currentPage === pagination.totalPages}
                className={`relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium rounded-md
                  ${currentPage === pagination.totalPages 
                    ? 'text-gray-300 bg-white' 
                    : 'text-gray-700 bg-white hover:bg-gray-50'}`}
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * pagination.limit + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pagination.limit, total)}
                  </span>{' '}
                  of <span className="font-medium">{total}</span> results
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className={`relative inline-flex items-center rounded-l-md px-2 py-2
                      ${currentPage === 1 
                        ? 'text-gray-300 bg-white' 
                        : 'text-gray-500 bg-white hover:bg-gray-50'}`}
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, pagination.totalPages) }).map((_, idx) => {
                    let pageNum;
                    const totalPages = pagination.totalPages;
                    
                    if (totalPages <= 5) {
                      pageNum = idx + 1;
                    } else if (currentPage <= 3) {
                      pageNum = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - (4 - idx);
                    } else {
                      pageNum = currentPage - 2 + idx;
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold
                          ${currentPage === pageNum
                            ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(page => Math.min(pagination.totalPages, page + 1))}
                    disabled={currentPage === pagination.totalPages}
                    className={`relative inline-flex items-center rounded-r-md px-2 py-2
                      ${currentPage === pagination.totalPages 
                        ? 'text-gray-300 bg-white' 
                        : 'text-gray-500 bg-white hover:bg-gray-50'}`}
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}

      {bags.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <div className="text-gray-400 text-lg">No bags found</div>
          <div className="text-gray-500 mt-2">
            {searchTerm ? 'Try adjusting your search criteria' : 'Create your first bag to get started'}
          </div>
        </div>
      )}

      {/* Add Bag Modal */}
      {showAddModal && (
        <BagModal
          title="Add New Bag"
          onSubmit={handleCreateBag}
          onClose={() => setShowAddModal(false)}
          formData={bagForm}
          setFormData={setBagForm}
        />
      )}

      {/* Bulk Add Modal */}
      {showBulkModal && (
        <BulkBagModal
          onSubmit={handleBulkCreate}
          onClose={() => setShowBulkModal(false)}
          formData={bulkForm}
          setFormData={setBulkForm}
        />
      )}

      {showBulkRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => !isBulkRemoving && setShowBulkRemoveModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Remove Multiple Bags</h2>
              <p className="text-sm text-gray-600 mb-4">
                Paste bag numbers (bag IDs), separated by comma, space, or new line.
              </p>

              <div className="mb-4 rounded-lg border border-gray-200 p-3 bg-gray-50">
                <div className="text-sm font-semibold text-gray-800 mb-2">Generate Range</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={bulkRemoveRange.prefix}
                    onChange={(e) => setBulkRemoveRange((prev) => ({ ...prev, prefix: e.target.value }))}
                    placeholder="Prefix"
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="number"
                    min="0"
                    value={bulkRemoveRange.start}
                    onChange={(e) => setBulkRemoveRange((prev) => ({ ...prev, start: e.target.value }))}
                    placeholder="Start"
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="number"
                    min="0"
                    value={bulkRemoveRange.end}
                    onChange={(e) => setBulkRemoveRange((prev) => ({ ...prev, end: e.target.value }))}
                    placeholder="End"
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="number"
                    min="0"
                    value={bulkRemoveRange.padLength}
                    onChange={(e) => setBulkRemoveRange((prev) => ({ ...prev, padLength: e.target.value }))}
                    placeholder="Pad"
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddRangeToBulkRemoveInput}
                  className="mt-2 px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm"
                >
                  Add Range To List
                </button>
              </div>

              <textarea
                rows={8}
                value={bulkRemoveInput}
                onChange={(e) => setBulkRemoveInput(e.target.value)}
                placeholder="BAG00001\nBAG00002\nBAG00003"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBulkRemoveModal(false)}
                  disabled={isBulkRemoving}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkRemoveByBagIds}
                  disabled={isBulkRemoving}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {isBulkRemoving ? 'Removing...' : 'Remove Bags'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Bag Modal */}
      {showAssignModal && selectedBag && (
        <AssignBagModal
          bag={selectedBag}
          drivers={drivers}
          onSubmit={handleAssignBag}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedBag(null);
          }}
          formData={assignForm}
          setFormData={setAssignForm}
        />
      )}

      {showBagHistoryModal && selectedBag && (
        <BagAssignmentHistoryModal
          bag={selectedBag}
          onClose={() => {
            setShowBagHistoryModal(false);
            setSelectedBag(null);
          }}
        />
      )}

      {/* Flagged sidebar removed - use modal button in header */}

      {/* Bag Collection Modal */}
      {showBagCollectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Assign Bag Collection Task</h2>
            
            {bagCollectionData.customer && (
              <>
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700">Customer: {bagCollectionData.customer.customerName}</p>
                  <p className="text-sm text-gray-600">Bags: {bagCollectionData.customer.bags.length}</p>
                </div>

                <div className="space-y-4">
                  {/* Driver Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Assign Driver <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={bagCollectionData.driver}
                      onChange={(e) => setBagCollectionData({ ...bagCollectionData, driver: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a driver...</option>
                      {drivers.map(driver => (
                        <option key={driver._id} value={driver._id}>
                          {driver.profile?.name || driver.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Scheduled Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={bagCollectionData.scheduledDate}
                      onChange={(e) => setBagCollectionData({ ...bagCollectionData, scheduledDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Time Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Scheduled Time</label>
                    <input
                      type="time"
                      value={bagCollectionData.scheduledTime}
                      onChange={(e) => setBagCollectionData({ ...bagCollectionData, scheduledTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowBagCollectionModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateBagCollectionTask}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Create Task
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Flagged Customers Modal */}
      {showFlaggedModal && (
        <FlaggedCustomersModal
          customers={flaggedCustomers}
          threshold={FLAGGED_BAG_THRESHOLD}
          searchTerm={flaggedCustomersSearch}
          onSearchChange={setFlaggedCustomersSearch}
          onClose={() => {
            setShowFlaggedModal(false);
            setFlaggedCustomersSearch('');
          }}
          onDismiss={handleDismissFlaggedCustomer}
          onAssignCollection={handleAssignBagCollection}
          onOpenDetails={openFlaggedDetails}
          onDownloadExcel={handleDownloadFlaggedBagsExcel}
        />
      )}

      {showFlaggedDetailsModal && flaggedDetailData && (
        <FlaggedCustomerDetailsModal
          data={flaggedDetailData}
          onClose={() => {
            setShowFlaggedDetailsModal(false);
            setFlaggedDetailData(null);
          }}
          onAssignCollection={(customer) => {
            // reuse existing assign flow
            handleAssignBagCollection(customer);
          }}
        />
      )}

      {/* On Time Used Bag Modal */}
      {showOnTimeUsedBagModal && (
        <OnTimeUsedBagModal
          customers={flaggedCustomers}
          onClose={() => setShowOnTimeUsedBagModal(false)}
        />
      )}
        </div>
      </div>
    </div>
  );
};


// Individual Bag Modal Component
const BagModal = ({ title, onSubmit, onClose, formData, setFormData }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
    <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bag ID *
            </label>
            <input
              type="text"
              required
              value={formData.bagId}
              onChange={(e) => setFormData(prev => ({ ...prev, bagId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., BAG000001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition
            </label>
            <select
              value={formData.condition}
              onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <select
              value={formData.location}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="warehouse">Warehouse</option>
              <option value="driver">With Driver</option>
              <option value="customer">With Customer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional notes about the bag..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Create Bag
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);

// Flagged Customer Details Modal
const FlaggedCustomerDetailsModal = ({ data, onClose, onAssignCollection }) => {
  const { customer, alert, bags = [], deliveries = [] } = data || {};

  const handleSendSlack = async () => {
    try {
      const payload = {
        customerName: customer?.customerName || 'Unknown',
        customerId: customer?.customerId || '',
        bagCount: bags?.length || 0,
        bagIds: (bags || []).map(b => b.bagId).filter(Boolean)
      };
      console.log('Sending to Slack:', payload);
      const response = await api.post('/api/alerts/flagged-customer', payload);
      console.log('Slack response:', response.data);
      alert('Sent flagged customer to Slack');
    } catch (err) {
      console.error('Failed to send Slack:', err);
      console.error('Error details:', err.response?.data || err.message);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to send to Slack';
      alert(`Failed to send to Slack: ${errorMsg}`);
    }
  };

  const handleDownloadExcel = () => {
    try {
      // Prepare bags data
      const bagsData = bags.map(b => ({
        'Bag ID': b.bagId || '-',
        'Status': b.status || '-',
        'Customer': b.assignedTo?.customer?.customerName || '-',
        'Driver': b.assignedTo?.driver?.profile 
          ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() 
          : (b.assignedTo?.driver?.email || '-'),
        'Assigned Date': b.assignedTo?.assignmentTime 
          ? new Date(b.assignedTo.assignmentTime).toLocaleString() 
          : '-',
        'Condition': b.condition || '-',
        'Location': b.location || '-'
      }));

      // Prepare deliveries data
      const deliveriesData = deliveries.map(d => ({
        'Task Type': d.taskType || d.type || '-',
        'Driver': d.driver?.profile 
          ? `${d.driver.profile.firstName || ''} ${d.driver.profile.lastName || ''}`.trim() 
          : (d.driver?.email || '-'),
        'Status': d.status || '-',
        'Scheduled Time': d.scheduledTime 
          ? new Date(d.scheduledTime).toLocaleString() 
          : '-',
        'Assigned At': d.bagAssignment?.assignedAt 
          ? new Date(d.bagAssignment.assignedAt).toLocaleString() 
          : '-',
        'Assigned By': d.bagAssignment?.assignedBy?.profile 
          ? `${d.bagAssignment.assignedBy.profile.firstName || ''} ${d.bagAssignment.assignedBy.profile.lastName || ''}`.trim() 
          : (d.bagAssignment?.assignedBy?.email || '-'),
        'Returned At': d.bagAssignment?.returnedAt 
          ? new Date(d.bagAssignment.returnedAt).toLocaleString() 
          : (d.completedAt ? new Date(d.completedAt).toLocaleString() : '-'),
        'Completed At': d.completedAt 
          ? new Date(d.completedAt).toLocaleString() 
          : '-'
      }));

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add customer info sheet
      const customerInfo = [
        ['Customer Name', customer?.customerName || 'Unknown'],
        ['Customer ID', customer?.customerId || '-'],
        ['Total Bags', bags.length],
        ['Last Alert', alert?.lastSent ? new Date(alert.lastSent).toLocaleString() : 'Never'],
        ['Report Generated', new Date().toLocaleString()]
      ];
      const wsInfo = XLSX.utils.aoa_to_sheet(customerInfo);
      XLSX.utils.book_append_sheet(wb, wsInfo, 'Customer Info');

      // Add bags sheet
      if (bagsData.length > 0) {
        const wsBags = XLSX.utils.json_to_sheet(bagsData);
        XLSX.utils.book_append_sheet(wb, wsBags, 'Bags');
      }

      // Add collection tasks sheet
      if (deliveriesData.length > 0) {
        const wsDeliveries = XLSX.utils.json_to_sheet(deliveriesData);
        XLSX.utils.book_append_sheet(wb, wsDeliveries, 'Collection Tasks');
      }

      // Download file
      const fileName = `Flagged_Customer_${customer?.customerId || 'Report'}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      alert('Excel report downloaded successfully!');
    } catch (err) {
      console.error('Failed to generate Excel:', err);
      alert('Failed to generate Excel report');
    }
  };

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text('Flagged Customer Report', 14, 20);
      
      // Add customer info
      doc.setFontSize(12);
      doc.text(`Customer: ${customer?.customerName || 'Unknown'}`, 14, 30);
      doc.text(`Customer ID: ${customer?.customerId || '-'}`, 14, 37);
      doc.text(`Total Bags: ${bags.length}`, 14, 44);
      doc.text(`Last Alert: ${alert?.lastSent ? new Date(alert.lastSent).toLocaleString() : 'Never'}`, 14, 51);
      doc.text(`Report Generated: ${new Date().toLocaleString()}`, 14, 58);
      
      // Add bags table
      if (bags.length > 0) {
        doc.setFontSize(14);
        doc.text('Bags', 14, 68);
        
        const bagsTableData = bags.map(b => [
          b.bagId || '-',
          b.status || '-',
          b.assignedTo?.customer?.customerName || '-',
          b.assignedTo?.driver?.profile 
            ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() 
            : (b.assignedTo?.driver?.email || '-'),
          b.assignedTo?.assignmentTime 
            ? new Date(b.assignedTo.assignmentTime).toLocaleDateString() 
            : '-'
        ]);
        
        doc.autoTable({
          startY: 72,
          head: [['Bag ID', 'Status', 'Customer', 'Driver', 'Assigned Date']],
          body: bagsTableData,
          theme: 'grid',
          styles: { fontSize: 9 },
          headStyles: { fillColor: [251, 191, 36] }
        });
      }
      
      // Add collection tasks table
      if (deliveries.length > 0) {
        const finalY = doc.lastAutoTable?.finalY || 72;
        doc.setFontSize(14);
        doc.text('Collection Tasks', 14, finalY + 10);
        
        const deliveriesTableData = deliveries.map(d => [
          d.taskType || d.type || '-',
          d.driver?.profile 
            ? `${d.driver.profile.firstName || ''} ${d.driver.profile.lastName || ''}`.trim() 
            : (d.driver?.email || '-'),
          d.status || '-',
          d.scheduledTime 
            ? new Date(d.scheduledTime).toLocaleDateString() 
            : '-',
          d.completedAt 
            ? new Date(d.completedAt).toLocaleDateString() 
            : '-'
        ]);
        
        doc.autoTable({
          startY: finalY + 14,
          head: [['Task Type', 'Driver', 'Status', 'Scheduled', 'Completed']],
          body: deliveriesTableData,
          theme: 'grid',
          styles: { fontSize: 9 },
          headStyles: { fillColor: [251, 191, 36] }
        });
      }
      
      // Download file
      const fileName = `Flagged_Customer_${customer?.customerId || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      alert('PDF report downloaded successfully!');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Failed to generate PDF report');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{customer.customerName}</h2>
            <p className="text-sm text-gray-600">{customer.customerId ? `ID: ${customer.customerId}` : 'No customer ID'}</p>
            <p className="text-xs text-gray-500">Last Alert: {alert?.lastSent ? new Date(alert.lastSent).toLocaleString() : 'Never'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadExcel} className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button onClick={handleDownloadPDF} className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button onClick={handleSendSlack} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">Send to Slack</button>
            <button onClick={() => { onAssignCollection(customer); onClose(); }} className="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm">Assign Collection</button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Bags ({bags.length})</h3>
            <div className="grid grid-cols-1 gap-2">
              {bags.map(b => (
                <div key={b._id} className="p-3 border rounded bg-gray-50 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{b.bagId}</div>
                    <div className="text-xs text-gray-600">{b.assignedTo?.customer?.customerName || 'No customer'}</div>
                  </div>
                  <div className="text-right text-sm text-gray-700">
                    <div>{b.status}</div>
                    <div className="text-xs text-gray-500">Assigned: {b.assignedTo?.assignmentTime ? new Date(b.assignedTo.assignmentTime).toLocaleString() : '-'}</div>
                    <div className="text-xs text-gray-500">Driver: {b.assignedTo?.driver?.profile ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() : (b.assignedTo?.driver?.name || b.assignedTo?.driver?.email || '-')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Collection Tasks ({deliveries.length})</h3>
            {deliveries.length === 0 ? (
              <div className="text-xs text-gray-500">No collection tasks found for this customer.</div>
            ) : (
              <div className="space-y-3">
                {deliveries.map(d => (
                  <div key={d._id} className="p-3 border rounded bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Task: {d.taskType || d.type}</div>
                        <div className="text-xs text-gray-500">Scheduled: {d.scheduledTime ? new Date(d.scheduledTime).toLocaleString() : '-'}</div>
                      </div>
                      <div className="text-right text-sm text-gray-700">
                        <div>Driver: {d.driver?.profile ? `${d.driver.profile.firstName || ''} ${d.driver.profile.lastName || ''}`.trim() : (d.driver?.name || d.driver?.email || '-')}</div>
                        <div>Status: {d.status}</div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>Assigned At: {d.bagAssignment?.assignedAt ? new Date(d.bagAssignment.assignedAt).toLocaleString() : '-'}</div>
                      <div>Assigned By: {d.bagAssignment?.assignedBy?.profile ? `${d.bagAssignment.assignedBy.profile.firstName || ''} ${d.bagAssignment.assignedBy.profile.lastName || ''}`.trim() : (d.bagAssignment?.assignedBy?.email || '-')}</div>
                      <div>Returned At: {d.bagAssignment?.returnedAt ? new Date(d.bagAssignment.returnedAt).toLocaleString() : (d.completedAt ? new Date(d.completedAt).toLocaleString() : '-')}</div>
                      <div>Completed At: {d.completedAt ? new Date(d.completedAt).toLocaleString() : '-'}</div>
                    </div>
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

// Bulk Bag Modal Component
const BulkBagModal = ({ onSubmit, onClose, formData, setFormData }) => {
  const totalBags = formData.endNumber - formData.startNumber + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Bulk Add Bags</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prefix
                </label>
                <input
                  type="text"
                  value={formData.prefix}
                  onChange={(e) => setFormData(prev => ({ ...prev, prefix: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., BAG"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Number
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.startNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, startNumber: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Number
                </label>
                <input
                  type="number"
                  min={formData.startNumber}
                  value={formData.endNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, endNumber: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-end">
                <div className="w-full p-2 bg-gray-50 rounded-lg text-center">
                  <div className="text-lg font-bold text-blue-600">{totalBags}</div>
                  <div className="text-xs text-gray-600">Total Bags</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="warehouse">Warehouse</option>
                  <option value="driver">With Driver</option>
                </select>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800">
                <strong>Example Bag IDs:</strong><br />
                {formData.prefix}{formData.startNumber.toString().padStart(6, '0')} to {formData.prefix}{formData.endNumber.toString().padStart(6, '0')}
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                Create {totalBags} Bags
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Assign Bag Modal Component
const AssignBagModal = ({ bag, drivers, onSubmit, onClose, formData, setFormData }) => {
  const [allBags, setAllBags] = useState([]);
  const [loadingBags, setLoadingBags] = useState(true);

  // Fetch ALL bags for the assignment modal (no pagination)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoadingBags(true);
        console.log('🔄 Fetching all bags for assignment modal...');
        
        // Fetch without limit to get ALL bags
        const res = await api.get('/bags?limit=500&page=1');
        
        if (!mounted) return;
        
        let payloadBags = [];
        if (res?.data?.data && Array.isArray(res.data.data)) {
          payloadBags = res.data.data;
        } else if (res?.data?.bags && Array.isArray(res.data.bags)) {
          payloadBags = res.data.bags;
        } else if (Array.isArray(res?.data)) {
          payloadBags = res.data;
        }

        console.log(`✅ Loaded ${payloadBags.length} total bags for assignment`);

        // Sort by assigned time asc (earliest -> latest). Fallback to createdAt.
        payloadBags.sort((a, b) => {
          const ta = a?.assignedTo?.assignmentTime ? new Date(a.assignedTo.assignmentTime) : (a.createdAt ? new Date(a.createdAt) : new Date(0));
          const tb = b?.assignedTo?.assignmentTime ? new Date(b.assignedTo.assignmentTime) : (b.createdAt ? new Date(b.createdAt) : new Date(0));
          return ta - tb;
        });

        setAllBags(Array.isArray(payloadBags) ? payloadBags : []);
      } catch (err) {
        console.error('Failed to fetch all bags for Assign modal', err);
      } finally {
        if (mounted) setLoadingBags(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-none shadow-xl w-full h-full mx-0 max-h-none overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Assign Bag {bag.bagId}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assignment Form */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Assignment Details</h3>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign to Driver *
                  </label>
                  {(drivers || []).length === 0 && (
                    <p className="text-xs text-red-500 mb-2">
                      No drivers found. Create a driver or enable an existing one first.
                    </p>
                  )}
                  <select
                    required
                    value={formData.driverId}
                    onChange={(e) => setFormData(prev => ({ ...prev, driverId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={(drivers || []).length === 0}
                  >
                    <option value="">Select a driver</option>
                    {(drivers || []).map(driver => {
                      const displayName =
                        driver.name ||
                        `${driver.profile?.firstName || ''} ${driver.profile?.lastName || ''}`.trim() ||
                        driver.email;
                      return (
                        <option key={driver._id} value={driver._id}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer ID
                    </label>
                    <input
                      type="text"
                      value={formData.customerId}
                      onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Name
                    </label>
                    <input
                      type="text"
                      value={formData.customerName}
                      onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignment Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional notes about this assignment..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 rounded-lg text-white ${
                      (drivers || []).length === 0
                        ? 'bg-blue-300 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                    disabled={(drivers || []).length === 0}
                  >
                    Assign Bag
                  </button>
                </div>
              </form>
            </div>

            {/* All Bags List (detailed) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                All Bags ({loadingBags ? '...' : allBags.length})
              </h3>
              <div className="bg-gray-50 rounded-lg border border-gray-200 max-h-[600px] overflow-y-auto p-2">
                {loadingBags ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading all bags...
                  </div>
                ) : allBags.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No bags found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allBags.map(b => {
                      const linkedDelivery = typeof b.currentDelivery === 'string' ? b.currentDelivery : b.currentDelivery?._id;
                      return (
                        <div
                          key={b._id}
                          className={`p-3 bg-white border rounded-lg shadow-sm hover:shadow-md ${b._id === bag._id ? 'ring-2 ring-blue-200' : ''}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3">
                              <Package className="w-5 h-5 text-gray-500 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{b.bagId}</p>
                                <p className="text-xs text-gray-500">{b.assignedTo?.customer?.customerName || 'No customer'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                                b.status === 'available' ? 'bg-green-100 text-green-700' :
                                b.status === 'assigned' ? 'bg-blue-100 text-blue-700' :
                                b.status === 'in_transit' ? 'bg-yellow-100 text-yellow-700' :
                                b.status === 'delivered' ? 'bg-gray-100 text-gray-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {b.status?.replace('_', ' ') || 'Unknown'}
                              </span>
                              <p className="text-xs text-gray-500 mt-1">{b.condition || 'Unknown'}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-gray-700">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Location</span>
                              <span className="font-medium">{b.location || 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Assigned Customer ID</span>
                              <span className="font-medium">{b.assignedTo?.customer?.customerId || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Assigned Driver</span>
                              <span className="font-medium">{b.assignedTo?.driver?.profile ? `${b.assignedTo.driver.profile.firstName || ''} ${b.assignedTo.driver.profile.lastName || ''}`.trim() : (b.assignedTo?.driver?.name || b.assignedTo?.driver?.email || '-')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Assigned On</span>
                              <span className="font-medium">{b.assignedTo?.assignmentTime ? new Date(b.assignedTo.assignmentTime).toLocaleString() : '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Linked Delivery</span>
                              <span className="font-medium">{linkedDelivery || '-'}</span>
                            </div>
                            {b.notes && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Notes</span>
                                <span className="font-medium">{b.notes}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-end space-x-2">
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(b.bagId)}
                              className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-700 hover:bg-gray-200"
                            >
                              Copy ID
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BagAssignmentHistoryModal = ({ bag, onClose }) => {
  const events = useMemo(() => {
    const history = Array.isArray(bag?.history) ? bag.history : [];
    return history
      .filter((entry) => entry?.eventType === 'assigned_to_driver')
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [bag]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Assignment History</h2>
            <p className="text-sm text-gray-500">Bag {bag?.bagId}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[65vh]">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No new assignment history available for this bag.</p>
          ) : (
            <div className="space-y-3">
              {events.map((entry, index) => (
                <div key={`${entry.timestamp || 'event'}-${index}`} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Dispatcher</p>
                      <p className="font-semibold text-gray-900">{entry.assignedBy?.name || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Driver</p>
                      <p className="font-semibold text-gray-900">{entry.assignedTo?.driverName || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Date/Time</p>
                      <p className="font-semibold text-gray-900">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// On Time Used Bag Modal Component
const OnTimeUsedBagModal = ({ customers, onClose }) => {
  const [search, setSearch] = useState('');

  const filtered = search.trim() === ''
    ? customers
    : customers.filter(c =>
        c.customerName?.toLowerCase().includes(search.toLowerCase()) ||
        c.customerId?.toLowerCase().includes(search.toLowerCase())
      );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Clock className="w-6 h-6 text-teal-600" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">On Time Used Bag</h2>
                <p className="text-sm text-gray-600">Flagged customers — notification status</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {search ? 'No matching customers' : 'No flagged customers'}
              </h3>
              <p className="text-gray-500">No customers to display.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Customer ID</th>
                    <th className="px-4 py-3">Bags</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(customer => (
                    <tr key={customer.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{customer.customerName}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.customerId || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">
                          {customer.bags.length} bags
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full">
                          Sent
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Flagged Customers Modal Component
const FlaggedCustomersModal = ({ customers, onClose, onDismiss, onAssignCollection, threshold, onOpenDetails, onDownloadExcel, searchTerm, onSearchChange }) => {
  // Filter customers based on search term
  const filteredCustomers = searchTerm.trim() === '' 
    ? customers 
    : customers.filter(customer => 
        customer.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.customerId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.bags?.some(bag => bag.bagId?.toLowerCase().includes(searchTerm.toLowerCase()))
      );

  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
    <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Users className="w-6 h-6 text-yellow-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Flagged Customers</h2>
              <p className="text-sm text-gray-600">
                Customers currently holding {threshold}+ bags
              </p>
            </div>
          </div>
          <button
            onClick={onDownloadExcel}
            className="mr-2 inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
          >
            <Download className="w-4 h-4 mr-2" />
            Excel
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer name, ID, or bag ID..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No matching customers' : 'No Flagged Customers'}
            </h3>
            <p className="text-gray-500">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : `All customers currently have fewer than ${threshold} bags`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCustomers.map(customer => (
              <div
                key={customer.key}
                onClick={() => onOpenDetails?.(customer)}
                className="cursor-pointer rounded-lg border border-yellow-200 bg-yellow-50 p-4 hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-gray-900">{customer.customerName}</p>
                    <p className="text-sm text-gray-600">
                      {customer.customerId ? `ID: ${customer.customerId}` : 'No customer ID on record'}
                    </p>
                  </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-3 py-1 text-sm font-semibold text-yellow-800 bg-yellow-100 rounded-full">
                            {customer.bags.length} bags
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDismiss(customer.key); }}
                            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-yellow-100 rounded"
                            title="Dismiss"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const payload = {
                                  customerName: customer.customerName,
                                  customerId: customer.customerId,
                                  bagCount: customer.bags.length,
                                  bagIds: customer.bags.map(b => b.bagId)
                                };
                                await api.post('/alerts/flagged-customer', payload);
                                alert('Sent flagged customer to Slack');
                              } catch (err) {
                                console.error('Slack send error', err);
                                alert('Failed to send to Slack');
                              }
                            }}
                            className="p-1 text-gray-700 hover:text-gray-900 hover:bg-yellow-100 rounded"
                            title="Send to Slack"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16v4a1 1 0 0 1-1 1h-3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 8V4a1 1 0 0 1 1-1h3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 8v-2a1 1 0 0 0-1-1h-2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 16v2a1 1 0 0 0 1 1h2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 3v18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 3v18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {customer.bags.map(bag => (
                    <span
                      key={bag._id}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium bg-white text-gray-700 rounded-full border border-yellow-200"
                    >
                      {bag.bagId}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => {
                    onAssignCollection(customer);
                    onClose();
                  }}
                  className="w-full flex items-center justify-center px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Assign Bag Collection Task
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
  );
};
export default BagTracking;
