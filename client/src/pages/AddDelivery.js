import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, Upload, X, Download, FileText, CheckCircle, AlertCircle, Search, Plus, Trash2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../utils/api';
import * as XLSX from 'xlsx';

const MS_PER_MINUTE = 60 * 1000;
const LOCAL_TIMEZONE_OFFSET_MINUTES = Number(
  process.env.REACT_APP_LOCAL_TIMEZONE_OFFSET_MINUTES ?? process.env.LOCAL_TIMEZONE_OFFSET_MINUTES ?? 0
);
const HAS_DEFINED_LOCAL_OFFSET = Number.isFinite(LOCAL_TIMEZONE_OFFSET_MINUTES);

const buildUtcFromLocalComponents = (
  year,
  monthIndex,
  day,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0
) => {
  const baseUtc = Date.UTC(year, monthIndex, day, hours, minutes, seconds, milliseconds);
  if (!HAS_DEFINED_LOCAL_OFFSET) {
    return Number.isNaN(baseUtc) ? null : new Date(baseUtc);
  }
  const adjusted = baseUtc - LOCAL_TIMEZONE_OFFSET_MINUTES * MS_PER_MINUTE;
  return Number.isNaN(adjusted) ? null : new Date(adjusted);
};

const parseExcelSerialToDate = (numericValue) => {
  if (!numericValue || Number.isNaN(Number(numericValue))) {
    return null;
  }

  const dateCode = XLSX.SSF.parse_date_code(Number(numericValue));
  if (!dateCode) {
    return null;
  }

  return buildUtcFromLocalComponents(
    dateCode.y,
    (dateCode.m || 1) - 1,
    dateCode.d || 1,
    dateCode.H || 0,
    dateCode.M || 0,
    Math.floor(dateCode.S || 0)
  );
};

const reconstructFromDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return buildUtcFromLocalComponents(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
};

const tryParseStringDate = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const explicitTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);

  const candidates = [
    trimmed,
    trimmed.replace(/\s+/g, ' '),
    trimmed.replace(/\//g, '-'),
    trimmed.replace(/\//g, '-').replace(/\s+/, 'T'),
  ];

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return explicitTimezone ? parsed : reconstructFromDate(parsed);
    }
  }

  // Attempt manual parsing for formats like DD/MM/YYYY HH:mm:ss AM
  const match = trimmed.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );
  if (match) {
    let [_, part1, part2, part3, hh, mm, ss = '0', meridiem] = match;
    let day = Number(part1);
    let month = Number(part2);
    let year = Number(part3);

    if (year < 100) {
      year += 2000;
    } else if (year < 1000) {
      year += 2000;
    }

    // Assume format is DD/MM/YYYY unless month would be invalid
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }

    let hours = Number(hh);
    const minutes = Number(mm);
    const seconds = Number(ss);
    if (meridiem) {
      const upper = meridiem.toUpperCase();
      if (upper === 'PM' && hours < 12) {
        hours += 12;
      }
      if (upper === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    return buildUtcFromLocalComponents(year, month - 1, day, hours, minutes, seconds);
  }

  return null;
};

const parseDateTimeValue = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  if (rawValue instanceof Date) {
    return reconstructFromDate(rawValue);
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
    return parseExcelSerialToDate(rawValue);
  }

  if (typeof rawValue === 'string') {
    return tryParseStringDate(rawValue);
  }

  return null;
};

// Helper function to apply pending changes after delivery creation
// Enhanced helper function to apply pending changes after delivery creation
const applyPendingChanges = async (delivery) => {
  try {
    if (!delivery || !delivery.customerId || !delivery.scheduledTime) {
      console.warn('applyPendingChanges called with invalid delivery:', delivery);
      return 0;
    }
    console.log('Checking for pending changes for delivery:', {
      customerId: delivery.customerId,
      scheduledTime: delivery.scheduledTime
    });

    // Extract just the date part (YYYY-MM-DD) from the scheduledTime
    const scheduledDate = new Date(delivery.scheduledTime);
    const dateString = scheduledDate.toISOString().split('T')[0];
    
    console.log('Formatted date for pending changes search:', dateString);

    // Check for pending changes for this customer and date
    const response = await api.get('/delivery-changes/pending', {
      params: {
        customerId: delivery.customerId,
        scheduledDate: dateString
      }
    });

    const pendingChanges = response.data.changes || [];
    console.log(`Found ${pendingChanges.length} pending changes for customer ${delivery.customerId} on ${dateString}`);

    let appliedCount = 0;

    for (const change of pendingChanges) {
      try {
        console.log('Processing pending change:', change._id, 'for delivery:', delivery._id);
        
        // Use the apply endpoint instead of direct update
        const applyResponse = await api.post(`/delivery-changes/${change._id}/apply`);
        
        if (applyResponse.data.success) {
          appliedCount++;
          console.log(`✅ Successfully applied change ${change._id} to delivery ${delivery._id}`);
        } else {
          console.error(`❌ Failed to apply change ${change._id}:`, applyResponse.data.message);
        }
      } catch (error) {
        console.error(`❌ Error applying change ${change._id}:`, error.response?.data || error.message);
      }
    }

    console.log(`Applied ${appliedCount} out of ${pendingChanges.length} pending changes`);
    return appliedCount;
  } catch (error) {
    console.error('❌ Error checking for pending changes:', error.response?.data || error.message);
    return 0;
  }
};

const AddDelivery = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manual');
  const [drivers, setDrivers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importData, setImportData] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importProgress, setImportProgress] = useState({
    total: 0,
    processed: 0,
    success: 0,
    error: 0,
    inProgress: false
  });
  const [pastedData, setPastedData] = useState('');
  const { user } = useSelector(state => state.auth);

  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    scheduledTime: '',
    driver: '',
    company: 'Matter',
    otherCompany: '',
    type: 'Delivery',
    taskType: 'Purchase', // For task tab
    todoList: [], // For task tab
    requireProof: true, // For task tab
    address: '',
    zone: '',
    gpsLocation: {
      lat: '',
      lng: '',
      link: ''
    },
    notes: ''
  });

  const [todoInput, setTodoInput] = useState('');

  // Collection state
  const [collectionBagIds, setCollectionBagIds] = useState(['']);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerCacheRef = React.useRef(null);
  const searchDebounceRef = React.useRef(null);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
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

      setDrivers(Array.isArray(driversList) ? driversList : []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  const enhancedParseGPSFromLink = (link) => {
    if (!link || typeof link !== 'string') return null;

    const str = link.trim();

    // Helper: extract lat,lng from arbitrary text
    const extractFromText = (text) => {
      const m = text.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
      if (m) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[2]);
        if (!Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          return { lat, lng };
        }
      }
      return null;
    };

    // If looks like plain coordinates, extract without URL
    const direct = extractFromText(str);
    if (direct) return direct;

    // Normalize URL: add protocol if missing but domain-like
    let normalized = str;
    if (!/^https?:\/\//i.test(normalized) && /(google\.|goo\.gl|maps\.app\.goo\.gl|maps\.apple\.com)/i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    try {
      const url = new URL(normalized);
      const host = url.hostname;

      // Google Maps variants
      if (/google\.com|goo\.gl|maps\.app\.goo\.gl/i.test(host)) {
        // q param like "25.123,55.123"
        const qParam = url.searchParams.get('q');
        if (qParam) {
          const parsed = extractFromText(qParam);
          if (parsed) return parsed;
        }

        // query param
        const queryParam = url.searchParams.get('query');
        if (queryParam) {
          const parsed = extractFromText(queryParam);
          if (parsed) return parsed;
        }

        // ll param sometimes present
        const llParam = url.searchParams.get('ll');
        if (llParam) {
          const parsed = extractFromText(llParam);
          if (parsed) return parsed;
        }

        // Path with @lat,lng
        const pathMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (pathMatch) {
          const lat = parseFloat(pathMatch[1]);
          const lng = parseFloat(pathMatch[2]);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
        }

        // Fallback search whole URL
        const fromWhole = extractFromText(normalized);
        if (fromWhole) return fromWhole;
      }

      // Apple Maps
      if (/maps\.apple\.com/i.test(host)) {
        const llParam = url.searchParams.get('ll');
        if (llParam) {
          const parsed = extractFromText(llParam);
          if (parsed) return parsed;
        }
        const fromWhole = extractFromText(normalized);
        if (fromWhole) return fromWhole;
      }

      // Last resort: any URL containing coordinates
      return extractFromText(normalized);
    } catch {
      // Not a valid URL; try extracting from raw text without logging errors
      return extractFromText(str);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!user || user.role !== 'admin') {
      alert('Only admins can create deliveries');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare delivery data based on type
      let deliveryData = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        scheduledTime: formData.scheduledTime,
        company: formData.company === 'Other' ? formData.otherCompany : formData.company,
        address: formData.address,
        zone: formData.zone,
        notes: formData.notes,
        type: formData.type
      };

      // Add gpsLocation if provided
      if (formData.gpsLocation?.lat && formData.gpsLocation?.lng) {
        deliveryData.gpsLocation = formData.gpsLocation;
      }

      // Add driver if selected
      if (formData.driver) {
        deliveryData.driver = formData.driver;
      }

      // Add task-specific fields if type is Task
      if (formData.type === 'Task') {
        deliveryData.taskType = formData.taskType;
        deliveryData.requireProof = formData.requireProof;
        deliveryData.todoList = formData.todoList;
      }

      // Add collection-specific fields if type is Collection
      if (formData.type === 'Collection') {
        const validBagIds = collectionBagIds.map(b => b.trim()).filter(Boolean);
        deliveryData.collectionDetails = { bagIds: validBagIds };
        // address is optional for collections
        deliveryData.address = formData.address || '';
      }

      console.log('Submitting delivery/task data:', deliveryData);

      const response = await api.post('/deliveries', deliveryData);

      if (response.data.success) {
        const createdDelivery = response?.data?.data?.delivery || response?.data?.delivery;
        if (!createdDelivery) {
          console.warn('Create delivery response missing delivery payload:', response.data);
        }
        
        // Server automatically applies pending changes, no need for client-side application
        
        let successMessage = formData.type === 'Task'
          ? 'Task created successfully!'
          : formData.type === 'Collection'
          ? 'Collection created successfully!'
          : 'Delivery created successfully!';
        alert(successMessage);
        navigate(-1);
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      console.error('Error creating delivery:', error);
      
      // Better error display
      let errorMessage = 'Failed to create ' + (formData.type === 'Task' ? 'task' : formData.type === 'Collection' ? 'collection' : 'delivery');
      if (error.response?.data?.errors) {
        const validationErrors = error.response.data.errors.map(e => `${e.path}: ${e.msg}`).join('\n');
        errorMessage += '\n\nValidation errors:\n' + validationErrors;
      } else if (error.response?.data?.message) {
        errorMessage += '\n\n' + error.response.data.message;
      } else if (error.message) {
        errorMessage += '\n\n' + error.message;
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addTodoItem = () => {
    if (todoInput.trim()) {
      setFormData(prev => ({
        ...prev,
        todoList: [...prev.todoList, { text: todoInput.trim(), completed: false }]
      }));
      setTodoInput('');
    }
  };

  const removeTodoItem = (index) => {
    setFormData(prev => ({
      ...prev,
      todoList: prev.todoList.filter((_, i) => i !== index)
    }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Set type based on active tab
    if (tab === 'manual') {
      setFormData(prev => ({ ...prev, type: 'Delivery' }));
    } else if (tab === 'task') {
      setFormData(prev => ({ ...prev, type: 'Task' }));
    } else if (tab === 'bulk') {
      setFormData(prev => ({ ...prev, type: 'Delivery' }));
    } else if (tab === 'collection') {
      setFormData(prev => ({ ...prev, type: 'Collection' }));
      // Pre-load customer list into cache so search is instant
      if (!customerCacheRef.current) {
        api.get('/customers', { params: { limit: 500 } }).then(res => {
          customerCacheRef.current = res?.data?.data || [];
        }).catch(() => {});
      }
    }
  };

  const searchCustomers = (query) => {
    clearTimeout(searchDebounceRef.current);
    if (!query || query.trim().length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    const runFilter = async () => {
      // Ensure cache is populated
      if (!customerCacheRef.current) {
        setCustomerSearchLoading(true);
        try {
          const res = await api.get('/customers', { params: { limit: 500 } });
          customerCacheRef.current = res?.data?.data || [];
        } catch (err) {
          console.error('Customer load error:', err);
          setCustomerSearchLoading(false);
          return;
        }
        setCustomerSearchLoading(false);
      }

      const q = query.trim().toLowerCase();
      const filtered = customerCacheRef.current.filter(c =>
        (c.customerId || '').toLowerCase().includes(q) ||
        (c.firstName || '').toLowerCase().includes(q) ||
        (c.lastName || '').toLowerCase().includes(q) ||
        (`${c.firstName || ''} ${c.lastName || ''}`).toLowerCase().includes(q)
      ).slice(0, 10);
      setCustomerResults(filtered);
      setShowCustomerDropdown(filtered.length > 0);
    };

    searchDebounceRef.current = setTimeout(runFilter, 150);
  };

  const selectCustomer = (customer) => {
    const name = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    setFormData(prev => ({
      ...prev,
      customerId: customer.customerId || '',
      customerName: name
    }));
    setCustomerSearch(name + (customer.customerId ? ` (${customer.customerId})` : ''));
    setShowCustomerDropdown(false);
    setCustomerResults([]);

    // Auto-fetch location from most recent delivery for this customer
    if (customer.customerId) {
      api.get(`/customers/${encodeURIComponent(customer.customerId)}/location`)
        .then(res => {
          const loc = res?.data?.data;
          if (!loc) return;
          setFormData(prev => ({
            ...prev,
            address: loc.address || prev.address,
            zone: loc.zone || prev.zone,
            gpsLocation: loc.gpsLocation
              ? { lat: loc.gpsLocation.lat || '', lng: loc.gpsLocation.lng || '', link: loc.gpsLocation.link || '' }
              : prev.gpsLocation
          }));
        })
        .catch(() => {}); // non-blocking
    }
  };

  const addBagIdField = () => setCollectionBagIds(prev => [...prev, '']);
  const removeBagIdField = (index) => setCollectionBagIds(prev => prev.filter((_, i) => i !== index));
  const updateBagId = (index, value) => setCollectionBagIds(prev => prev.map((b, i) => i === index ? value : b));

  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setValidationErrors([]);
    setImportData([]);
    setImportProgress({
      total: 0,
      processed: 0,
      success: 0,
      error: 0,
      inProgress: false
    });

    const reader = new FileReader();

    reader.onload = event => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          setValidationErrors(['File is empty or has no data']);
          return;
        }

        processImportedData(jsonData);
      } catch (errorReading) {
        console.error('Error reading file:', errorReading);
        setValidationErrors(["Error reading file. Please make sure it's a valid Excel file."]);
      }
    };

    reader.onerror = () => {
      setValidationErrors(['Error reading file']);
    };

    reader.readAsArrayBuffer(file);
  };

  // Parses a structured location string like:
  // "City: DUBAI\nArea: Alkhawaneej 2\nStreet: Alsamr street\nBuilding: House 41\nFloor: 0\nApartment: 41"
  // Returns an object with named fields, or null if the format is not detected.
  const parseStructuredAddress = (value) => {
    if (!value || typeof value !== 'string') return null;
    const lower = value.toLowerCase();
    // Must contain at least "city:" and "area:" to be considered structured
    if (!lower.includes('city:') || !lower.includes('area:')) return null;

    const extract = (label) => {
      const match = value.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i'));
      return match ? match[1].trim() : '';
    };

    return {
      city: extract('city'),
      area: extract('area'),
      street: extract('street'),
      building: extract('building'),
      floor: extract('floor'),
      apartment: extract('apartment')
    };
  };

  const processImportedData = data => {
    const headers = data[0].map(h => h?.toString().trim().toLowerCase() || '');
    const rows = data.slice(1);
    const processedData = [];
    const errors = [];

    const headerMap = {
      'customer id': 'customerId',
      'customer name': 'customerName',
      name: 'customerName',
      'scheduled time': 'scheduledTime',
      'delivery time and date': 'scheduledTime',
      location: 'address',
      address: 'address',
      area: 'zone',
      driver: 'driverName',
      gps: 'gpsLink',
      company: 'company',
      notes: 'notes',
      type: 'type'
    };

    const requiredHeaderGroups = [
      ['customer id'],
      ['name', 'customer name'],
      ['delivery time and date', 'scheduled time'],
      ['location', 'address']
    ];

    const missingHeaders = requiredHeaderGroups
      .filter(group => !group.some(header => headers.includes(header)))
      .map(group => group[0]);

    if (missingHeaders.length > 0) {
      errors.push(`Missing required columns: ${missingHeaders.join(', ')}`);
      setValidationErrors(errors);
      return;
    }

    rows.forEach((row, index) => {
      const isEmptyRow = row.every(
        cell => cell === undefined || cell === null || cell.toString().trim() === ''
      );
      if (isEmptyRow) return;

      const rowData = {};
      const rowErrors = [];

      headers.forEach((header, colIndex) => {
        const rawValue = row[colIndex];
        const stringValue =
          rawValue === undefined || rawValue === null ? '' : rawValue.toString().trim();
        const mappedHeader = headerMap[header];

        if (!mappedHeader) {
          return;
        }

        if (mappedHeader === 'scheduledTime') {
          rowData[mappedHeader] =
            rawValue !== undefined && rawValue !== null && rawValue !== ''
              ? rawValue
              : stringValue;
        } else {
          rowData[mappedHeader] = stringValue;
        }
      });

      // Parse structured address from "Location" column if applicable
      if (rowData.address) {
        const structured = parseStructuredAddress(rowData.address);
        if (structured) {
          // Compose a flat address string from the structured parts
          const parts = [
            structured.building,
            structured.street,
            structured.apartment ? `Apt ${structured.apartment}` : '',
            structured.area,
            structured.city
          ].filter(p => p && p.trim() && p.trim() !== '0');
          rowData.address = parts.join(', ');
          rowData.addressDetails = structured;
          // Use area as zone for auto-detection
          if (!rowData.zone && structured.area) {
            rowData.zone = structured.area;
          }
        }
      }

      if (!rowData.customerId) rowErrors.push('Customer ID is required');
      if (!rowData.customerName) rowErrors.push('Customer Name is required');
      const hasScheduledTimeValue =
        rowData.scheduledTime !== undefined && rowData.scheduledTime !== null && rowData.scheduledTime !== '';
      if (!hasScheduledTimeValue) rowErrors.push('Scheduled Time is required');
      if (!rowData.address) rowErrors.push('Address is required');

      if (hasScheduledTimeValue) {
        const parsedDate = parseDateTimeValue(rowData.scheduledTime);

        if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
          rowErrors.push('Invalid Scheduled Time format');
        } else {
          rowData.scheduledTime = parsedDate.toISOString();
        }
      }

      // Preserve company as provided in sheet; default to Matter when empty
      const rawCompany = rowData.company && rowData.company.trim() ? rowData.company.trim() : '';
      rowData.company = rawCompany || 'Matter';

      if (rowData.driverName) {
        const inputDriverName = rowData.driverName.trim();
        const normalizedDriver = inputDriverName.toLowerCase();
        const driverMatch = drivers.find(d => {
          const firstName = d?.profile?.firstName?.trim().toLowerCase();
          const fullName = `${d?.profile?.firstName || ''} ${d?.profile?.lastName || ''}`
            .trim()
            .toLowerCase();
          return firstName === normalizedDriver || fullName === normalizedDriver;
        });
        if (driverMatch?._id) {
          rowData.driver = driverMatch._id;
          rowData.driverName = `${driverMatch.profile.firstName} ${driverMatch.profile.lastName}`.trim();
        } else {
          rowData.driver = undefined;
          rowData.driverName = inputDriverName;
        }
      }

      if (rowData.gpsLink) {
        let gpsLocation = null;
        const extracted = enhancedParseGPSFromLink(rowData.gpsLink);
        if (extracted) {
          gpsLocation = {
            lat: extracted.lat,
            lng: extracted.lng,
            link: rowData.gpsLink
          };
        } else {
          const coords = rowData.gpsLink.split(',').map(part => parseFloat(part.trim()));
          if (coords.length === 2 && coords.every(coord => !Number.isNaN(coord))) {
            gpsLocation = {
              lat: coords[0],
              lng: coords[1],
              link: ''
            };
          }
        }

        rowData.gpsLocation = gpsLocation || {
          lat: '',
          lng: '',
          link: rowData.gpsLink
        };
      }

      if (rowData.address) rowData.address = rowData.address.trim();
      if (rowData.customerName) rowData.customerName = rowData.customerName.trim();
      if (rowData.zone) rowData.zone = rowData.zone.trim();

      if (rowErrors.length === 0) {
        processedData.push({
          ...rowData,
          gpsLocation: rowData.gpsLocation,
          _id: `temp-${index}`,
          status: 'valid'
        });
      } else {
        errors.push(`Row ${index + 2}: ${rowErrors.join(', ')}`);
      }
    });

    setImportData(processedData);
    setValidationErrors(errors);

    if (errors.length > 0) {
      alert(`Found ${errors.length} error(s) in the file. Please check the validation errors below.`);
    }
  };

  const handleImportSubmit = async () => {
    if (importData.length === 0) {
      return;
    }

    setImportProgress({
      total: importData.length,
      processed: 0,
      success: 0,
      error: 0,
      inProgress: true
    });
    setIsSubmitting(true);
    try {
      // Prepare all deliveries for bulk creation
      const bulkPayload = {
        deliveries: importData.map(delivery => {
          const payload = {
            customerId: delivery.customerId,
            customerName: delivery.customerName,
            scheduledTime: delivery.scheduledTime,
            company: (() => {
              const raw = (delivery.company || '').trim();
              return raw || 'Matter';
            })(),
            type: delivery.type || 'Delivery',
            address: delivery.address || '',
            zone: delivery.zone || '',
            notes: delivery.notes || '',
            status: 'pending'
          };

          if (delivery.addressDetails) {
            payload.addressDetails = delivery.addressDetails;
          }

          if (delivery.driver) {
            payload.driver = delivery.driver;
          }

          const gpsLocation = delivery.gpsLocation || null;
          if (gpsLocation && (gpsLocation.lat || gpsLocation.lng || gpsLocation.link)) {
            payload.gpsLocation = {
              lat: gpsLocation.lat || '',
              lng: gpsLocation.lng || '',
              link: gpsLocation.link || ''
            };
          } else if (delivery.gpsLink) {
            payload.gpsLocation = {
              lat: '',
              lng: '',
              link: delivery.gpsLink
            };
          }

          return payload;
        })
      };

      console.log(`📦 Starting bulk import of ${importData.length} deliveries...`);
      const startTime = Date.now();

      // Send all deliveries in a single request
      const response = await api.post('/deliveries/bulk', bulkPayload);

      const elapsedMs = Date.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(2);

      if (response.data?.success) {
        const createdCount = response.data?.data?.totalCreated || importData.length;
        const changesApplied = response.data?.data?.changesApplied || 0;

        console.log(`✅ Bulk import completed in ${elapsedSec}s`);
        console.log(`   - Created: ${createdCount} deliveries`);
        console.log(`   - Changes applied: ${changesApplied}`);
        console.log(`   - Server processing: ${response.data?.data?.processingTimeMs}ms`);

        setImportProgress({
          total: importData.length,
          processed: importData.length,
          success: createdCount,
          error: 0,
          inProgress: false
        });

        let successMessage = `✅ Successfully imported ${createdCount} deliveries in ${elapsedSec}s`;
        if (changesApplied > 0) {
          successMessage += ` with ${changesApplied} pending changes applied`;
        }
        alert(successMessage);

        // Clear import data after successful import
        setImportData([]);
        setPastedData('');
        setValidationErrors([]);
      } else {
        console.error('Bulk import failed:', response.data);
        const errorMessage = response.data?.message || 'Unknown error during bulk import';
        setValidationErrors([`Bulk import failed: ${errorMessage}`]);
        setImportProgress({
          total: importData.length,
          processed: 0,
          success: 0,
          error: importData.length,
          inProgress: false
        });
      }
    } catch (error) {
      console.error('❌ Bulk import error:', error);
      const errorMessage = 
        error.response?.data?.message || 
        error.message || 
        'Unknown error during bulk import';
      setValidationErrors([`Bulk import failed: ${errorMessage}`]);
      setImportProgress(prev => ({
        ...prev,
        inProgress: false,
        error: prev.total
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNestedChange = e => {
    const { name, value } = e.target;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');

      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const downloadTemplate = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const templateData = [
      ['Customer ID', 'Name', 'Delivery Time and Date', 'Location', 'Area', 'Driver', 'GPS', 'Company'],
      ['CUST001', 'John Doe', `${today} 09:00`, '123 Main St, New York, NY', 'Midtown', 'John Smith', 'https://maps.google.com/?q=40.758,-73.9855', 'Matter'],
      ['CUST002', 'Jane Smith', `${today} 14:30`, '456 Oak Ave, Chicago, IL', 'North Side', 'Sarah Johnson', '41.8818,-87.6231', 'Yellow Block'],
      ['CUST003', 'Bob Wilson', `${tomorrow} 10:00`, '789 Pine Rd, Los Angeles, CA', 'Westwood', 'Mike Brown', '', 'CookIt'],
      [
        'Required',
        'Required',
        'Required - use date and time (example: 2024-01-20 09:00)',
        'Required',
        'Optional zone/area name',
        'Use exact driver names',
        'Optional map link or lat,lng',
        'Optional - defaults to Matter'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Template');

    ws['!cols'] = [
      { width: 14 },
      { width: 20 },
      { width: 26 },
      { width: 32 },
      { width: 18 },
      { width: 20 },
      { width: 36 },
      { width: 18 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C += 1) {
      const cellAddress = { c: C, r: 0 };
      const cellRef = XLSX.utils.encode_cell(cellAddress);
      if (!ws[cellRef]) continue;
      ws[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'D3D3D3' } }
      };
    }

    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 4, c: 0 }, e: { r: 4, c: 7 } });

    XLSX.writeFile(wb, 'delivery_import_template.xlsx');
  };

  const clearImport = () => {
    setImportData([]);
    setValidationErrors([]);
    setFileName('');
    setImportProgress({
      total: 0,
      processed: 0,
      success: 0,
      error: 0,
      inProgress: false
    });
    const fileInput = document.getElementById('file-upload');
    if (fileInput) fileInput.value = '';
  };

  const showImportProgress = importProgress.inProgress || importProgress.total > 0;
  const progressPercent =
    importProgress.total > 0
      ? Math.min(100, Math.round((importProgress.processed / importProgress.total) * 100))
      : 0;
  const displayPercent =
    importProgress.total > 0 && importProgress.inProgress && progressPercent < 5 && importProgress.processed < importProgress.total
      ? 5
      : progressPercent;
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Add Delivery</h1>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900"
        >
          <X className="w-5 h-5 mr-2" />
          Cancel
        </button>
      </div>

      <div className="flex space-x-4 border-b border-gray-200">
        <button
          onClick={() => handleTabChange('manual')}
          className={`pb-4 px-2 font-medium ${
            activeTab === 'manual'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Manual Entry
        </button>
        <button
          onClick={() => handleTabChange('bulk')}
          className={`pb-4 px-2 font-medium ${
            activeTab === 'bulk'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Bulk Entry
        </button>
        <button
          onClick={() => handleTabChange('task')}
          className={`pb-4 px-2 font-medium ${
            activeTab === 'task'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Task
        </button>
        <button
          onClick={() => handleTabChange('collection')}
          className={`pb-4 px-2 font-medium ${
            activeTab === 'collection'
              ? 'border-b-2 border-teal-500 text-teal-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Collection
        </button>
      </div>

      {activeTab === 'manual' ? (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer ID *
              </label>
              <input
                type="text"
                name="customerId"
                value={formData.customerId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="CUST001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scheduled Time * (Local Time)
              </label>
              <input
                type="datetime-local"
                name="scheduledTime"
                value={formData.scheduledTime}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Enter time in your local timezone</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Zone
              </label>
              <input
                type="text"
                name="zone"
                value={formData.zone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GPS Location Google Maps Link Recommended
              </label>
              <input
                type="text"
                name="gpsLocation.link"
                value={formData.gpsLocation.link}
                onChange={handleNestedChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://maps.google.com/?q=40.7128,-74.0060"
                onBlur={e => {
                  const link = e.target.value;
                  if (link) {
                    const coords = enhancedParseGPSFromLink(link);
                    if (coords) {
                      setFormData(prev => ({
                        ...prev,
                        gpsLocation: {
                          ...prev.gpsLocation,
                          lat: coords.lat,
                          lng: coords.lng,
                          link
                        }
                      }));
                    }
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Driver (optional)
              </label>
              <select
                name="driver"
                value={formData.driver}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {drivers.map(driver => (
                  <option key={driver._id} value={driver._id}>
                    {driver.profile.firstName} {driver.profile.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company *
              </label>
              <div className="space-y-2">
                {['Matter', 'Yellow Block', 'CookIt', 'Other'].map(company => (
                  <label key={company} className="flex items-center">
                    <input
                      type="radio"
                      name="company"
                      value={company}
                      checked={formData.company === company}
                      onChange={handleChange}
                      className="mr-2"
                    />
                    {company}
                  </label>
                ))}
              </div>
              {formData.company === 'Other' && (
                <input
                  type="text"
                  name="otherCompany"
                  value={formData.otherCompany}
                  onChange={handleChange}
                  placeholder="Specify company name"
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address *
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="123 Main Street, City, State, ZIP Code"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Special instructions for delivery..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Create Delivery
                </>
              )}
            </button>
          </div>
        </motion.form>
      ) : activeTab === 'bulk' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6"
        >
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Import from Excel File
            </h3>
            <p className="text-gray-600 mb-4">
              Upload an Excel file (.xlsx, .xls) with delivery data. Download the template below for
              the correct format.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-blue-900">Required Columns:</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Customer ID, Name, Delivery Time and Date, Location, Area, Driver, GPS, Company
                  </p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </button>
              </div>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              id="file-upload"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            {!fileName ? (
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="flex flex-col items-center justify-center">
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">Upload Excel File</p>
                  <p className="text-gray-500 mb-4">
                    Drag and drop your file here or click to browse
                  </p>
                  <span className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    Choose File
                  </span>
                  <p className="text-xs text-gray-400 mt-2">
                    Supports .xlsx, .xls, .csv files
                  </p>
                </div>
              </label>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <FileText className="w-12 h-12 text-green-500 mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">{fileName}</p>
                <p className="text-gray-500 mb-4">File uploaded successfully</p>
                <button onClick={clearImport} className="text-blue-600 hover:text-blue-800">
                  Upload different file
                </button>
              </div>
            )}
          </div>

          {showImportProgress && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                <span>{importProgress.inProgress ? 'Importing deliveries...' : 'Import summary'}</span>
                <span>
                  {Math.min(importProgress.processed, importProgress.total)}/{importProgress.total}{' '}
                  processed
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mt-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    importProgress.inProgress ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${displayPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs mt-3">
                <span className="text-green-600 font-semibold">
                  Success: {importProgress.success}
                </span>
                <span className="text-red-600 font-semibold">Failed: {importProgress.error}</span>
              </div>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <h4 className="text-sm font-medium text-red-800">
                  Validation Errors ({validationErrors.length})
                </h4>
              </div>
              <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                {validationErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {importData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Import Preview</h4>
                <div className="flex items-center text-green-600">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span>{importData.length} valid deliveries ready to import</span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Scheduled
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Location
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Area
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Driver
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Company
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {importData.slice(0, 10).map(row => (
                        <tr key={row._id}>
                          <td className="px-4 py-3 text-sm">
                            <div className="font-medium text-gray-900">{row.customerName}</div>
                            <div className="text-gray-500">{row.customerId}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {new Date(row.scheduledTime).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{row.address}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{row.zone || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{row.driverName || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{row.company}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importData.length > 10 && (
                  <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                    ... and {importData.length - 10} more deliveries
                  </div>
                )}
              </div>
            </div>
          )}

          {(fileName || importData.length > 0) && (
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={clearImport}
                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Clear
              </button>
              <button
                onClick={handleImportSubmit}
                disabled={isSubmitting || importData.length === 0 || validationErrors.length > 0}
                className="flex items-center px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Import {importData.length} Deliveries
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      ) : activeTab === 'collection' ? (
        // Collection Tab
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Customer Search */}
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    searchCustomers(e.target.value);
                  }}
                  onFocus={() => customerSearch.length >= 2 && setShowCustomerDropdown(customerResults.length > 0)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  required={!formData.customerId}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Type customer name or ID to search..."
                />
                {customerSearchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {customerResults.map(c => (
                    <button
                      key={c._id || c.customerId}
                      type="button"
                      onMouseDown={() => selectCustomer(c)}
                      className="w-full text-left px-4 py-2 hover:bg-teal-50 flex items-center gap-3"
                    >
                      <span className="font-medium text-gray-900">{c.firstName} {c.lastName}</span>
                      <span className="text-xs text-gray-400">{c.customerId}</span>
                    </button>
                  ))}
                </div>
              )}
              {formData.customerId && (
                <p className="text-xs text-teal-600 mt-1">Selected: {formData.customerName} ({formData.customerId})</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scheduled Date &amp; Time *
              </label>
              <input
                type="datetime-local"
                name="scheduledTime"
                value={formData.scheduledTime}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
              <p className="text-xs text-gray-500 mt-1">Enter time in your local timezone</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Driver (optional)
              </label>
              <select
                name="driver"
                value={formData.driver}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Unassigned</option>
                {drivers.map(driver => (
                  <option key={driver._id} value={driver._id}>
                    {driver.profile?.firstName} {driver.profile?.lastName} ({driver.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company *
              </label>
              <select
                name="company"
                value={formData.company}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="Matter">Matter</option>
                <option value="Yellow Block">Yellow Block</option>
                <option value="CookIt">CookIt</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {formData.company === 'Other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Other Company Name *
                </label>
                <input
                  type="text"
                  name="otherCompany"
                  value={formData.otherCompany}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Enter company name"
                />
              </div>
            )}

            {/* Bag Numbers */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bag Numbers to Collect
              </label>
              <div className="space-y-2">
                {collectionBagIds.map((bagId, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bagId}
                      onChange={e => updateBagId(index, e.target.value)}
                      placeholder={`Bag ID ${index + 1}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    {collectionBagIds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBagIdField(index)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addBagIdField}
                  className="flex items-center gap-2 px-3 py-2 text-teal-600 border border-teal-300 rounded-lg hover:bg-teal-50 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add another bag
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="Special instructions for collection..."
              />
            </div>

            {/* Location — auto-filled from customer's last delivery, editable */}
            <div className="md:col-span-2 border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">
                Location <span className="font-normal text-gray-400">(auto-filled from customer's last delivery)</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    placeholder="Will be filled automatically after selecting a customer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Zone / Area</label>
                  <input
                    type="text"
                    name="zone"
                    value={formData.zone}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    placeholder="e.g., Dubai Marina"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">GPS Link</label>
                  <input
                    type="text"
                    name="gpsLocation.link"
                    value={formData.gpsLocation?.link || ''}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        gpsLocation: {
                          ...prev.gpsLocation,
                          link: e.target.value,
                          ...enhancedParseGPSFromLink(e.target.value)
                        }
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    placeholder="Google Maps link"
                  />
                </div>
                {formData.gpsLocation?.lat && formData.gpsLocation?.lng && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-teal-600">
                      📍 GPS: {Number(formData.gpsLocation.lat).toFixed(6)}, {Number(formData.gpsLocation.lng).toFixed(6)}
                      {formData.gpsLocation.link && (
                        <a href={formData.gpsLocation.link} target="_blank" rel="noopener noreferrer" className="ml-2 underline">View on map</a>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.customerId}
              className="flex items-center px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Create Collection
                </>
              )}
            </button>
          </div>
        </motion.form>
      ) : (
        // Task Tab
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Task Type *
              </label>
              <select
                name="taskType"
                value={formData.taskType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                required
              >
                <option value="Purchase">Purchase</option>
                <option value="Bag Collection">Bag Collection</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer ID *
              </label>
              <input
                type="text"
                name="customerId"
                value={formData.customerId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                placeholder="Enter customer ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scheduled Time *
              </label>
              <input
                type="datetime-local"
                name="scheduledTime"
                value={formData.scheduledTime}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Driver
              </label>
              <select
                name="driver"
                value={formData.driver}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
              >
                <option value="">Unassigned</option>
                {drivers.map(driver => (
                  <option key={driver._id} value={driver._id}>
                    {driver.profile?.firstName} {driver.profile?.lastName} ({driver.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location / Address *
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={2}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                placeholder="Enter location or address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company *
              </label>
              <select
                name="company"
                value={formData.company}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
              >
                <option value="Matter">Matter</option>
                <option value="Yellow Block">Yellow Block</option>
                <option value="CookIt">CookIt</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {formData.company === 'Other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Other Company Name *
                </label>
                <input
                  type="text"
                  name="otherCompany"
                  value={formData.otherCompany}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                  placeholder="Enter company name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Area
              </label>
              <input
                type="text"
                name="zone"
                value={formData.zone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                placeholder="e.g., Dubai Marina"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GPS Link
              </label>
              <input
                type="text"
                name="gpsLocation.link"
                value={formData.gpsLocation?.link || ''}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    gpsLocation: {
                      ...prev.gpsLocation,
                      link: e.target.value,
                      ...enhancedParseGPSFromLink(e.target.value)
                    }
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                placeholder="Paste Google Maps or Apple Maps link"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To-Do List
              </label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={todoInput}
                    onChange={(e) => setTodoInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTodoItem())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none"
                    placeholder="Add a task item"
                  />
                  <button
                    type="button"
                    onClick={addTodoItem}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg"
                  >
                    Add
                  </button>
                </div>
                {formData.todoList.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {formData.todoList.map((item, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <span className="flex-1">{item.text}</span>
                        <button
                          type="button"
                          onClick={() => removeTodoItem(index)}
                          className="text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="requireProof"
                  checked={formData.requireProof}
                  onChange={(e) => setFormData(prev => ({ ...prev, requireProof: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Require Picture Proof</span>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                placeholder="Additional notes or instructions..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center px-6 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Create Task
                </>
              )}
            </button>
          </div>
        </motion.form>
      )}
    </div>
  );
};

export default AddDelivery;

