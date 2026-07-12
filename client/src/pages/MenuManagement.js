import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Copy,
  ExternalLink,
  Edit,
  Trash2,
  Check,
  AlertCircle,
  Loader,
  Eye,
  Calendar,
  Users,
  Link as LinkIcon,
  Upload,
  Download,
  Coffee,
  Sandwich,
  Pizza,
  Cookie,
  X,
  Image as ImageIcon,
  FileText
} from 'lucide-react';
import api from '../utils/api';
import { lookupProteinWeight, lookupCarbWeight } from '../utils/nutrition';
import XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const MenuManagement = () => {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);
  const [weeklyItems, setWeeklyItems] = useState([]);
  const [selectionMenuId, setSelectionMenuId] = useState(null);
  const [menuSelections, setMenuSelections] = useState([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionError, setSelectionError] = useState(null);
  const [selectionSearch, setSelectionSearch] = useState('');
  const [selectionDates, setSelectionDates] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [isUploadingMenu, setIsUploadingMenu] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState(null);
  const [isBodybuilderMode, setIsBodybuilderMode] = useState(false);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState(null);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingKitchenPaper, setIsDownloadingKitchenPaper] = useState(false);
  const [isDownloadingMenuPDF, setIsDownloadingMenuPDF] = useState(false);
  const [isEditingSelections, setIsEditingSelections] = useState(false);
  const [editDraft, setEditDraft] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editMenuData, setEditMenuData] = useState(null); // full populated menu for edit mode
  const [editMenuLoading, setEditMenuLoading] = useState(false);
  const [editOpenSlot, setEditOpenSlot] = useState(null); // { dateKey, slotIndex, mealType } for open dropdown
  const [showPresetMacroModal, setShowPresetMacroModal] = useState(false);
  const [presetMacroForm, setPresetMacroForm] = useState({ breakfast: { C: '', P: '', F: '' }, snack: { C: '', P: '', F: '' } });
  const [savingPresetMacros, setSavingPresetMacros] = useState(false);
  const modalContentRef = useRef(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    mealPlans: ['Standard'],
    enableCompletionMessage: false,
    completionMessage: 'Your meal selections have been saved successfully.',
    selectionDeadlines: []
  });

  useEffect(() => {
    fetchMenus();
  }, []);

  const fetchMenus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/menus');
      if (response.data?.success) {
        setMenus(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching menus:', err);
      setError(err.response?.data?.message || 'Failed to fetch menus');
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (start, end) => {
    if (!start || !end) return [];
    const dates = [];
    
    // Parse date strings to avoid timezone issues
    // Date input returns "YYYY-MM-DD" which we need to parse in local timezone
    const parseDate = (dateString) => {
      const normalized = String(dateString).slice(0, 10);
      const [year, month, day] = normalized.split('-').map(Number);
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day);
    };
    
    const current = parseDate(start);
    const endDate = parseDate(end);
    if (!current || !endDate || Number.isNaN(current.getTime()) || Number.isNaN(endDate.getTime())) {
      return [];
    }
    current.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    // Include endDate by looping while current <= endDate
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  // normalize various date representations to YYYY-MM-DD string
  const getDateKey = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    // use local date components to avoid timezone shifts
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Returns true when the selection deadline for a given day has passed.
  const isDateKeyLocked = (dateKey, deadlines) => {
    if (!dateKey) return false;
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) return false;
    const deliveryDate = new Date(year, month - 1, day);

    // When no deadlines are configured, fall back to whether the date itself is in the past.
    if (!Array.isArray(deadlines) || deadlines.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return deliveryDate < today;
    }

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const deliveryDayName = DAY_NAMES[deliveryDate.getDay()];
    const rule = deadlines.find((d) => d.deliveryDay === deliveryDayName);
    if (!rule) {
      // No rule for this day — fall back to past-date check
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return deliveryDate < today;
    }
    const deadlineDateLocal = new Date(
      deliveryDate.getFullYear(),
      deliveryDate.getMonth(),
      deliveryDate.getDate() - (rule.daysBefore || 0)
    );
    const [hh, mm] = String(rule.deadlineTime || '23:59').split(':').map(Number);
    deadlineDateLocal.setHours(hh, mm, 59, 999);
    return new Date() > deadlineDateLocal;
  };

  // Returns the deadline Date object for a specific delivery day, or null if no rule.
  // Used to compare against a customer's submission time.
  const getDeadlineDate = (dateKey, deadlines) => {
    if (!dateKey) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) return null;
    const deliveryDate = new Date(year, month - 1, day);

    if (!Array.isArray(deadlines) || deadlines.length === 0) {
      // No deadlines configured — treat start-of-day as deadline
      const d = new Date(year, month - 1, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const deliveryDayName = DAY_NAMES[deliveryDate.getDay()];
    const rule = deadlines.find((d) => d.deliveryDay === deliveryDayName);
    if (!rule) {
      const d = new Date(year, month - 1, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const deadlineDateLocal = new Date(
      deliveryDate.getFullYear(),
      deliveryDate.getMonth(),
      deliveryDate.getDate() - (rule.daysBefore || 0)
    );
    const [hh, mm] = String(rule.deadlineTime || '23:59').split(':').map(Number);
    deadlineDateLocal.setHours(hh, mm, 59, 999);
    return deadlineDateLocal;
  };

  const initializeWeeklyItems = (start, end, bodybuilderMode = false) => {
    const dates = getDateRange(start, end);
    if (bodybuilderMode) {
      return [{
        date: 'ALL_DAYS',
        items: [
          {
            mealType: 'lunch',
            mealName: '',
            ingredients: '',
            proteinSource: '',
            category: '',
            intolerances: '',
            allergens: '',
            garnish: '',
            carbs: '',
            veg: '',
            sauce: '',
            price: 0
          }
        ]
      }];
    }

    return dates.map((date) => ({
      date: getDateKey(date),
      items: [
        {
          mealType: 'lunch',
          mealName: '',
          ingredients: '',
          proteinSource: '',
          category: '',
          intolerances: '',
          allergens: '',
          garnish: '',
          carbs: '',
          veg: '',
          sauce: '',
          price: 0
        }
      ]
    }));
  };

  const handleWeeklyItemChange = (dayIndex, itemIndex, field, value) => {
    setWeeklyItems((prev) => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex] };
      updated[dayIndex].items = [...updated[dayIndex].items];
      updated[dayIndex].items[itemIndex] = {
        ...updated[dayIndex].items[itemIndex],
        [field]: value
      };
      return updated;
    });
  };

  const handleAddItemForDay = (dayIndex) => {
    setWeeklyItems((prev) => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex] };
      updated[dayIndex].items = [
        ...updated[dayIndex].items,
        {
          mealType: 'lunch',
          mealName: '',
          ingredients: '',
          proteinSource: '',
          category: '',
          intolerances: '',
          allergens: '',
          garnish: '',
          carbs: '',
          veg: '',
          sauce: '',
          price: 0
        }
      ];
      return updated;
    });
  };

  const handleRemoveItemForDay = (dayIndex, itemIndex) => {
    setWeeklyItems((prev) => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex] };
      updated[dayIndex].items = updated[dayIndex].items.filter((_, idx) => idx !== itemIndex);
      if (updated[dayIndex].items.length === 0) {
        updated[dayIndex].items = [{
          mealType: 'lunch',
          mealName: '',
          ingredients: '',
          proteinSource: '',
          category: '',
          intolerances: '',
          allergens: '',
          garnish: '',
          carbs: '',
          veg: '',
          sauce: '',
          price: 0
        }];
      }
      return updated;
    });
  };

  const normalizeHeader = (value) => String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  const getHeaderIndex = (headers, candidates) => {
    const normalized = headers.map(normalizeHeader);
    for (const candidate of candidates) {
      const idx = normalized.indexOf(normalizeHeader(candidate));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const handleDownloadMenuTemplate = () => {
    const rows = [
      ['MEAL TYPE', 'INTOLERANCES', 'DAY', 'MEAL NAME', 'CARB', 'VEG'],
      ['lunch', 'nuts, dairy', 1, 'Chicken Bowl', 'rice', 'broccoli'],
      ['dinner', 'gluten', 2, 'Salad Plate', 'quinoa', 'spinach']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Menu Upload');
    XLSX.writeFile(wb, 'menu_upload_template.xlsx');
  };

  const handleMenuUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!formData.startDate) {
      setUploadError('Please set a start date before uploading the menu file.');
      event.target.value = '';
      return;
    }

    try {
      setIsUploadingMenu(true);
      setUploadError(null);

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (!rows.length) {
        throw new Error('The file is empty.');
      }

      const headerRow = rows[0] || [];
      const headerIndexes = {
        mealType: getHeaderIndex(headerRow, ['MEAL TYPE', 'TYPE', 'MEALTYPE']),
        intolerances: getHeaderIndex(headerRow, ['INTOLERANCES', 'INTOLERANCE', 'EXCLUSIONS', 'EXCLUSION']),
        day: getHeaderIndex(headerRow, ['DAY', 'DAY NUMBER', 'DAY#']),
        mealName: getHeaderIndex(headerRow, ['MEAL NAME', 'MEAL', 'NAME', 'MEALNAME']),
        carb: getHeaderIndex(headerRow, ['CARB', 'CARBS']),
        veg: getHeaderIndex(headerRow, ['VEG', 'VEGETABLE', 'VEGGIE'])
      };

      const useFallbackOrder =
        headerIndexes.day === -1 ||
        headerIndexes.mealName === -1;

      const baseDate = new Date(formData.startDate);
      if (Number.isNaN(baseDate.getTime())) {
        throw new Error('Invalid start date.');
      }

      const dayMap = new Map();
      const dataRows = rows.slice(1);

      dataRows.forEach((row) => {
        const values = Array.isArray(row) ? row : [];

        const mealType = useFallbackOrder ? values[0] : values[headerIndexes.mealType];
        const intolerances = useFallbackOrder ? values[1] : values[headerIndexes.intolerances];
        const dayValue = useFallbackOrder ? values[2] : values[headerIndexes.day];
        const mealName = useFallbackOrder ? values[3] : values[headerIndexes.mealName];
        const carb = useFallbackOrder ? values[4] : values[headerIndexes.carb];
        const veg = useFallbackOrder ? values[5] : values[headerIndexes.veg];

        const dayNumber = Number.parseInt(String(dayValue || '').trim(), 10);
        if (!mealName || Number.isNaN(dayNumber) || dayNumber <= 0) {
          return;
        }

        const itemDate = new Date(baseDate);
        itemDate.setDate(itemDate.getDate() + (dayNumber - 1));
        const dateKey = getDateKey(itemDate);

        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, {
            date: dateKey,
            items: []
          });
        }

        dayMap.get(dateKey).items.push({
          mealType: String(mealType || 'lunch').trim().toLowerCase(),
          mealName: String(mealName).trim(),
          ingredients: '',
          intolerances: String(intolerances || '').trim(),
          allergens: '',
          carbs: String(carb || '').trim(),
          veg: String(veg || '').trim()
        });
      });

      if (dayMap.size === 0) {
        throw new Error('No valid rows found. Please check the template format.');
      }

      const uploadedItems = Array.from(dayMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      setWeeklyItems(uploadedItems);
    } catch (uploadErr) {
      console.error('Menu upload error:', uploadErr);
      setUploadError(uploadErr.message || 'Failed to parse menu file.');
    } finally {
      setIsUploadingMenu(false);
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      if (editingMenuId && weeklyItems.length > 0) return;
      setWeeklyItems(initializeWeeklyItems(formData.startDate, formData.endDate, isBodybuilderMode));
    }
  }, [formData.startDate, formData.endDate, editingMenuId, weeklyItems.length, isBodybuilderMode]);

  const handleCreateMenu = async (e) => {
    e.preventDefault();
    try {
      const daysPayload = isBodybuilderMode
        ? getDateRange(formData.startDate, formData.endDate).map((date) => ({
            date: getDateKey(date),
            items: (weeklyItems[0]?.items || []).map((item) => ({ ...item }))
          }))
        : weeklyItems;

      const payload = {
        ...formData,
        mealPlans: isBodybuilderMode ? ['Bodybuilder'] : formData.mealPlans,
        bodybuilderMode: isBodybuilderMode
      };

      if (editingMenuId) {
        console.log('Updating menu with formData:', formData);
        const response = await api.put(`/menus/${editingMenuId}`, {
          ...payload,
          days: daysPayload
        });

        if (response.data?.success) {
          setMenus(menus.map(m => m._id === editingMenuId ? response.data.data : m));
          setEditingMenuId(null);
          setShowCreateForm(false);
          setFormData({
            title: '',
            description: '',
            startDate: '',
            endDate: '',
            mealPlans: ['Standard'],
            enableCompletionMessage: false,
            completionMessage: 'Your meal selections have been saved successfully.',
            selectionDeadlines: []
          });
          setIsBodybuilderMode(false);
          setWeeklyItems([]);
        }
      } else {
        console.log('Creating menu with formData:', formData);
        const response = await api.post('/menus', {
          ...payload,
          meals: [],
          days: daysPayload
        });

        if (response.data?.success) {
          setMenus([...menus, response.data.data]);
          setShowCreateForm(false);
          setFormData({
            title: '',
            description: '',
            startDate: '',
            endDate: '',
            mealPlans: ['Standard'],
            enableCompletionMessage: false,
            completionMessage: 'Your meal selections have been saved successfully.',
            selectionDeadlines: []
          });
          setIsBodybuilderMode(false);
          setWeeklyItems([]);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save menu');
    }
  };

  const buildWeeklyItemsFromMenu = (menu) => {
    const dayMap = new Map();
    const meals = Array.isArray(menu?.meals) ? menu.meals : [];

    meals.forEach((meal) => {
      const dateKey = meal?.date ? getDateKey(meal.date) : null;
      if (!dateKey) return;

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, { date: dateKey, items: [] });
      }

      const items = Array.isArray(meal.items) ? meal.items : [];
      items.forEach((item) => {
        if (!item) return;
        dayMap.get(dateKey).items.push({
          mealType: meal.mealType || item.mealType || 'lunch',
          mealName: item.mealName || '',
          ingredients: item.ingredients || '',
          proteinSource: item.proteinSource || '',
          category: item.category || '',
          intolerances: item.intolerances || '',
          allergens: Array.isArray(item.allergens) ? item.allergens.join(', ') : (item.allergens || ''),
          garnish: item.garnish || '',
          carbs: item.carbs || '',
          veg: item.veg || '',
          sauce: item.sauce || ''
        });
      });
    });

    return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  };

  const handleEditMenu = async (menuId) => {
    try {
      const response = await api.get(`/menus/${menuId}`);
      if (!response.data?.success) return;

      const menu = response.data.data;
      setEditingMenuId(menuId);
      setShowCreateForm(true);
      setUploadError(null);
      setFormData({
        title: menu.title || '',
        description: menu.description || '',
        startDate: menu.startDate ? getDateKey(menu.startDate) : '',
        endDate: menu.endDate ? getDateKey(menu.endDate) : '',
        mealPlans: menu.mealPlans && menu.mealPlans.length ? menu.mealPlans : ['Standard'],
        enableCompletionMessage: menu.enableCompletionMessage || false,
        completionMessage: menu.completionMessage || 'Your meal selections have been saved successfully.',
        selectionDeadlines: menu.selectionDeadlines || []
      });
      const bodybuilderMenu = Array.isArray(menu.mealPlans) && menu.mealPlans.includes('Bodybuilder');
      setIsBodybuilderMode(bodybuilderMenu);
      const builtItems = buildWeeklyItemsFromMenu(menu);
      if (bodybuilderMenu) {
        setWeeklyItems([{
          date: 'ALL_DAYS',
          items: builtItems[0]?.items || [{
            mealType: 'lunch',
            mealName: '',
            ingredients: '',
            proteinSource: '',
            category: '',
            intolerances: '',
            allergens: '',
            garnish: '',
            carbs: '',
            veg: '',
            sauce: ''
          }]
        }]);
      } else {
        setWeeklyItems(builtItems);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load menu for editing');
    }
  };

  const handlePublishMenu = async (menuId) => {
    try {
      const response = await api.put(`/menus/${menuId}`, {
        isPublished: true
      });

      if (response.data?.success) {
        setMenus(menus.map(m => m._id === menuId ? response.data.data : m));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish menu');
    }
  };

  const handleDeleteMenu = async (menuId) => {
    if (!window.confirm('Are you sure you want to delete this menu?')) return;

    try {
      await api.delete(`/menus/${menuId}`);
      setMenus(menus.filter(m => m._id !== menuId));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete menu');
    }
  };

  const handleDeleteCustomerSelection = async (menuId, customer) => {
    const name = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email;
    if (!window.confirm(`Delete meal selection for ${name}?`)) return;

    try {
      await api.delete(`/menus/${menuId}/selections/${encodeURIComponent(customer.email)}`);
      setMenuSelections(prev => prev.filter(c => c.email !== customer.email));
      setMenus(prev => prev.map(m =>
        m._id === menuId ? { ...m, selectionCount: Math.max(0, (m.selectionCount || 1) - 1) } : m
      ));
      if (selectedCustomerDetail?.email === customer.email) {
        setSelectedCustomerDetail(null);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete selection');
    }
  };

  const getShareLink = async (menuId) => {
    try {
      const response = await api.get(`/menus/${menuId}/share-link`);
      if (response.data?.success) {
        return response.data.data.shareUrl;
      }
    } catch (err) {
      console.error('Error getting share link:', err);
    }
  };

  const copyShareLink = async (menuId) => {
    const shareUrl = await getShareLink(menuId);
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(menuId);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  const handleToggleShareLink = async (menuId, isCurrentlyActive) => {
    try {
      const response = await api.put(`/menus/${menuId}`, {
        shareLinkActive: !isCurrentlyActive
      });

      if (response.data?.success) {
        setMenus(menus.map(m => m._id === menuId ? response.data.data : m));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update link status');
    }
  };

  const handleViewSelections = async (menuId) => {
    if (selectionMenuId === menuId) {
      setSelectionMenuId(null);
      setMenuSelections([]);
      setSelectionError(null);
      return;
    }

    try {
      setSelectionLoading(true);
      setSelectionError(null);
      setSelectionMenuId(menuId);
      setSelectionSearch('');

      // calculate date range for the selected menu
      const menu = menus.find(m => m._id === menuId);
      if (menu) {
        setSelectionDates(getDateRange(menu.startDate, menu.endDate));
      } else {
        setSelectionDates([]);
      }

      const response = await api.get(`/menus/${menuId}/selections`);
      if (response.data?.success) {
        const data = response.data.data || [];
        setMenuSelections(data);
        // Update the menu card's selectionCount in local state so the badge stays accurate
        setMenus(prev => prev.map(m =>
          m._id === menuId ? { ...m, selectionCount: data.length } : m
        ));
      } else {
        setSelectionError(response.data?.message || 'Failed to load selections');
      }
    } catch (err) {
      setSelectionError(err.response?.data?.message || 'Failed to load selections');
    } finally {
      setSelectionLoading(false);
    }
  };

  const handleDownloadMenuPDF = async (menu) => {
    if (!menu) return;

    try {
      setIsDownloadingMenuPDF(true);
      const response = await api.get(`/menus/${menu._id}`);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to load menu details');
      }

      const menuData = response.data.data;
      const weeklyItems = buildWeeklyItemsFromMenu(menuData);
      if (!weeklyItems.length) {
        alert('No menu items found to download.');
        return;
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      let currentY = margin;

      const safeTitle = String(menuData.title || 'Menu').replace(/[^a-z0-9-_]+/gi, '_');
      const formatMenuDayLabel = (dateKey) => {
        if (dateKey === 'ALL_DAYS') return 'All Days';
        const date = new Date(dateKey);
        if (Number.isNaN(date.getTime())) return dateKey;
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      };

      const addTextLines = (text, x, y, lineHeight = 6) => {
        const lines = pdf.splitTextToSize(text, maxWidth);
        pdf.text(lines, x, y);
        return lines.length * lineHeight;
      };

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(menuData.title || 'Weekly Menu', margin, currentY);
      currentY += 10;

      if (menuData.description) {
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        currentY += addTextLines(menuData.description, margin, currentY, 5);
        currentY += 4;
      }

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const dateRange = `${menuData.startDate ? new Date(menuData.startDate).toLocaleDateString() : 'N/A'} - ${menuData.endDate ? new Date(menuData.endDate).toLocaleDateString() : 'N/A'}`;
      pdf.text(`Date range: ${dateRange}`, margin, currentY);
      currentY += 6;

      if (Array.isArray(menuData.mealPlans) && menuData.mealPlans.length) {
        pdf.text(`Meal plan: ${menuData.mealPlans.join(', ')}`, margin, currentY);
        currentY += 8;
      } else {
        currentY += 4;
      }

      weeklyItems.forEach((day) => {
        if (currentY > pageHeight - margin - 30) {
          pdf.addPage();
          currentY = margin;
        }

        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(formatMenuDayLabel(day.date), margin, currentY);
        currentY += 8;

        if (!Array.isArray(day.items) || day.items.length === 0) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
          pdf.text('No items listed for this day.', margin + 2, currentY);
          currentY += 8;
        } else {
          day.items.forEach((item) => {
            if (currentY > pageHeight - margin - 40) {
              pdf.addPage();
              currentY = margin;
            }

            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            const titleText = `${item.mealType ? `${item.mealType}` : 'Meal'}${item.mealName ? ` - ${item.mealName}` : ''}`;
            currentY += addTextLines(titleText, margin, currentY, 6);

            const addLineValue = (label, value) => {
              if (!value) return;
              currentY += addTextLines(`${label}: ${value}`, margin + 2, currentY, 5);
            };

            addLineValue('Category', item.category);
            addLineValue('Ingredients', item.ingredients);
            addLineValue('Protein', item.proteinSource);
            addLineValue('Intolerances', item.intolerances);
            addLineValue('Allergens', item.allergens);
            addLineValue('Garnish', item.garnish);
            addLineValue('CARB', item.carbs);
            addLineValue('VEG', item.veg);
            addLineValue('Sauce', item.sauce);
            currentY += 4;
          });
        }

        currentY += 4;
      });

      pdf.save(`${safeTitle}-menu.pdf`);
    } catch (err) {
      console.error('Error generating menu PDF:', err);
      alert(err.message || 'Failed to download menu PDF');
    } finally {
      setIsDownloadingMenuPDF(false);
    }
  };

  const handleDownloadAsImage = async () => {
    if (!modalContentRef.current || !selectedCustomerDetail) return;
    
    try {
      setIsDownloadingImage(true);
      
      // Find the scrollable body element
      const scrollBody = modalContentRef.current.querySelector('[style*="overflow-y-auto"]');
      
      let canvas;
      
      if (scrollBody) {
        const originalMaxHeight = scrollBody.style.maxHeight;
        const originalOverflow = scrollBody.style.overflow;
        
        // Scroll to bottom to ensure all content is rendered
        scrollBody.scrollTop = scrollBody.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Get the full height needed
        const fullHeight = scrollBody.scrollHeight;
        
        // Temporarily expand the container to show all content
        scrollBody.style.maxHeight = `${fullHeight + 100}px`;
        scrollBody.style.overflow = 'visible';
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Capture the full modal - html2canvas returns the canvas directly
        canvas = await html2canvas(modalContentRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 0,
          onclone: (clonedDoc) => {
            // Force all elements in the clone to display fully
            const allElements = clonedDoc.querySelectorAll('*');
            allElements.forEach(el => {
              el.style.overflow = 'visible !important';
              el.style.maxHeight = 'none !important';
              el.style.height = 'auto !important';
            });
          }
        });
        
        // Restore original styles
        scrollBody.style.maxHeight = originalMaxHeight;
        scrollBody.style.overflow = originalOverflow;
        scrollBody.scrollTop = 0;
      } else {
        // Fallback if we can't find the scroll container
        canvas = await html2canvas(modalContentRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          allowTaint: true
        });
      }
      
      // Convert canvas to JPEG and download
      const imageData = canvas.toDataURL('image/jpeg', 0.95);
      
      const link = document.createElement('a');
      const customerName = `${selectedCustomerDetail.firstName || ''} ${selectedCustomerDetail.lastName || ''}`.trim() || 'Customer';
      const fileName = `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Selections_${new Date().toISOString().split('T')[0]}.jpg`;
      
      link.download = fileName;
      link.href = imageData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleDownloadAsPDF = async () => {
    if (!modalContentRef.current || !selectedCustomerDetail) return;
    
    try {
      setIsDownloadingPDF(true);
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - (2 * margin);
      let currentY = margin;
      let isFirstPage = true;
      
      // Find all date sections (each day container)
      const dateContainers = modalContentRef.current.querySelectorAll('[class*="border-2 border-gray-200 rounded-xl"]');
      
      if (dateContainers.length === 0) {
        throw new Error('No content found to export');
      }
      
      // Process each date section
      for (let i = 0; i < dateContainers.length; i++) {
        const container = dateContainers[i];
        
        // Create a temporary container for this section
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '-99999px';
        tempContainer.style.width = '1000px';
        tempContainer.style.backgroundColor = '#ffffff';
        tempContainer.style.padding = '20px';
        
        const clone = container.cloneNode(true);
        
        // Remove height constraints
        const allElements = clone.querySelectorAll('*');
        allElements.forEach(el => {
          el.style.maxHeight = 'none';
          el.style.height = 'auto';
          el.style.overflow = 'visible';
        });
        
        tempContainer.appendChild(clone);
        document.body.appendChild(tempContainer);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Capture this section
        const canvas = await html2canvas(clone, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          allowTaint: true
        });
        
        document.body.removeChild(tempContainer);
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * contentWidth) / canvas.width;
        
        // Check if we need a new page
        if (!isFirstPage && (currentY + imgHeight > pageHeight - margin)) {
          pdf.addPage();
          currentY = margin;
        }
        
        // Add the image
        pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
        
        currentY += imgHeight + 5; // Add spacing between sections
        
        // If this section would make the next one overflow, start a new page
        if (currentY > pageHeight - 50) { // Leave room for next section
          pdf.addPage();
          currentY = margin;
        }
        
        isFirstPage = false;
      }
      
      // Download PDF
      const customerName = `${selectedCustomerDetail.firstName || ''} ${selectedCustomerDetail.lastName || ''}`.trim() || 'Customer';
      const fileName = `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Selections_${new Date().toISOString().split('T')[0]}.pdf`;
      
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleDownloadKitchenPaperPdf = async () => {
    if (!selectedCustomerDetail) return;

    const normalizeMacros = (rawMacros) => {
      if (!rawMacros) return null;
      if (rawMacros.total) {
        return {
          C: Number(rawMacros.total.C) || 0,
          P: Number(rawMacros.total.P) || 0,
          F: Number(rawMacros.total.F) || 0,
          calories: Number(rawMacros.total.calories) || 0
        };
      }
      return {
        C: Number(rawMacros.C) || 0,
        P: Number(rawMacros.P) || 0,
        F: Number(rawMacros.F) || 0,
        calories: Number(rawMacros.calories) || 0
      };
    };

    try {
      setIsDownloadingKitchenPaper(true);

      let macros = normalizeMacros(selectedCustomerDetail.macros);
      let mealPerDay = Number(selectedCustomerDetail.mealPerDay) || 0;

      if (selectionMenuId && selectedCustomerDetail.email) {
        try {
          const customerKey = encodeURIComponent(selectedCustomerDetail.customerId || selectedCustomerDetail.email);
          const profileResponse = await api.get(
            `/menus/customers/${customerKey}/meal-profile?email=${encodeURIComponent(selectedCustomerDetail.email)}&menuId=${encodeURIComponent(selectionMenuId)}`
          );
          if (profileResponse.data?.success) {
            const profileData = profileResponse.data.data;
            if (!macros || (macros.C === 0 && macros.P === 0 && macros.F === 0)) {
              macros = normalizeMacros(profileData?.macros);
            }
            if (profileData?.mealPerDay) {
              mealPerDay = Number(profileData.mealPerDay);
            }
          }
        } catch (profileFetchError) {
          console.warn('Unable to fetch meal profile for kitchen paper:', profileFetchError);
        }
      }

      const selectedMeals = Array.isArray(selectedCustomerDetail.selectedMeals)
        ? selectedCustomerDetail.selectedMeals
        : [];

      const totalSelectedMeals = selectedMeals.reduce((sum, meal) => sum + (Number(meal.quantity) || 1), 0) || 1;
      const profileMeals = mealPerDay || totalSelectedMeals;
      const totalC = Number(macros?.C) || 0;
      const totalP = Number(macros?.P) || 0;
      const totalF = Number(macros?.F) || 0;
      const totalCalories = Math.round(totalC * 4 + totalP * 4 + totalF * 9);
      const perMealC = Math.round(totalC / profileMeals);
      const perMealP = Math.round(totalP / profileMeals);
      const mealCarbWeight = lookupCarbWeight(perMealC);
      const mealProteinWeight = lookupProteinWeight(perMealP);
      const mealVegWeight = 80;
      const exclusion = selectedCustomerDetail.mealExclusion || selectedCustomerDetail.exclusions || 'None';
      const submittedAt = selectedCustomerDetail.lastMenuSelectionDate
        ? new Date(selectedCustomerDetail.lastMenuSelectionDate).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })
        : 'N/A';

      const mealsByDate = selectedMeals.reduce((acc, meal) => {
        const key = getDateKey(meal.date || meal.menuItemId?.itemDate || '');
        if (!acc[key]) acc[key] = [];
        acc[key].push(meal);
        return acc;
      }, {});
      const sortedDateKeys = Object.keys(mealsByDate).sort();

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      let currentY = margin;

      const addTextLines = (text, x, y, lineHeight = 6) => {
        const lines = pdf.splitTextToSize(text, maxWidth - x + margin);
        pdf.text(lines, x, y);
        return lines.length * lineHeight;
      };

      const addPageIfNeeded = (heightNeeded) => {
        if (currentY + heightNeeded > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }
      };

      const customerName = `${selectedCustomerDetail.firstName || ''} ${selectedCustomerDetail.lastName || ''}`.trim() || 'Unnamed Customer';
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Kitchen Paper', margin, currentY);
      currentY += 10;
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      currentY += addTextLines(`Customer: ${customerName}`, margin, currentY);
      currentY += addTextLines(`Email: ${selectedCustomerDetail.email || 'N/A'}`, margin, currentY);
      if (selectedCustomerDetail.customerId) {
        currentY += addTextLines(`Customer ID: ${selectedCustomerDetail.customerId}`, margin, currentY);
      }
      currentY += addTextLines(`Submitted: ${submittedAt}`, margin, currentY);
      currentY += addTextLines(`Meal exclusion: ${exclusion}`, margin, currentY);
      currentY += addTextLines(`Total meals selected: ${totalSelectedMeals}`, margin, currentY);
      currentY += addTextLines(`Meals in profile: ${profileMeals}`, margin, currentY);

      currentY += 4;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Macro Summary', margin, currentY);
      currentY += 8;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      currentY += addTextLines(`Total Macros: C ${totalC}g, P ${totalP}g, F ${totalF}g`, margin, currentY);
      currentY += addTextLines(`Total Calories: ${totalCalories} kcal`, margin, currentY);
      currentY += addTextLines(`Per meal (÷${profileMeals}): C ${perMealC}g → ${mealCarbWeight}g | P ${perMealP}g → ${mealProteinWeight}g | V ${mealVegWeight}g`, margin, currentY);
      currentY += 4;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Meal Selection', margin, currentY);
      currentY += 8;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');

      if (sortedDateKeys.length === 0) {
        currentY += addTextLines('No meals selected.', margin, currentY);
      } else {
        sortedDateKeys.forEach((dateKey) => {
          const dateLabel = dateKey ? new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
            weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
          }) : 'Unknown date';
          addPageIfNeeded(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.text(dateLabel, margin, currentY);
          currentY += 7;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);

          mealsByDate[dateKey].forEach((meal) => {
            const name = meal.mealName || meal.menuItemId?.mealName || 'Meal';
            const type = meal.mealType || meal.menuItemId?.mealType || 'Meal';
            const quantity = Number(meal.quantity) || 1;
            const mealLine = `• ${name} (${type})${quantity > 1 ? ` x${quantity}` : ''}`;
            const height = addTextLines(mealLine, margin + 2, currentY);
            currentY += height;
            currentY += addTextLines(`  P: ${mealProteinWeight}g | C: ${mealCarbWeight}g | V: ${mealVegWeight}g`, margin + 4, currentY);
            if (meal.carbVegAction) {
              currentY += addTextLines(`  - Carb/Veg action: ${meal.carbVegAction}`, margin + 4, currentY);
            }
            if (meal.conflict || meal.carbVegConflict?.length) {
              const conflictText = meal.conflict ? 'Conflict present' : `Conflicts: ${meal.carbVegConflict.join(', ')}`;
              currentY += addTextLines(`  - ${conflictText}`, margin + 4, currentY);
            }
            if (meal.proteinChoice || meal.carbChoice || meal.vegChoice || meal.sauceChoice) {
              const choices = [
                meal.proteinChoice ? `Protein: ${meal.proteinChoice}` : null,
                meal.carbChoice ? `Carb: ${meal.carbChoice}` : null,
                meal.vegChoice ? `Veg: ${meal.vegChoice}` : null,
                meal.sauceChoice ? `Sauce: ${meal.sauceChoice}` : null
              ].filter(Boolean).join(' | ');
              if (choices) {
                currentY += addTextLines(`  - ${choices}`, margin + 4, currentY);
              }
            }
            if (meal.description) {
              currentY += addTextLines(`  - ${meal.description}`, margin + 4, currentY);
            }
            currentY += 2;
            addPageIfNeeded(20);
          });
        });
      }

      const fileName = `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Kitchen_Paper_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating kitchen paper PDF:', error);
      alert('Failed to generate kitchen paper PDF. Please try again.');
    } finally {
      setIsDownloadingKitchenPaper(false);
    }
  };

  const handleDownloadSelections = (menu) => {
    if (!Array.isArray(menuSelections) || menuSelections.length === 0) return;

    const menuTitle = menu?.title || 'menu-selections';

    const resolveMealTypeOrder = (mealType) => {
      const normalized = String(mealType || '').toLowerCase();
      if (normalized === 'lunch') return 0;
      if (normalized === 'dinner') return 1;
      if (normalized === 'snack') return 2;
      if (normalized === 'breakfast') return 3;
      return 2;
    };

    const menuDateList = menu?.startDate && menu?.endDate
      ? getDateRange(menu.startDate, menu.endDate).map((date) => getDateKey(date)).filter(Boolean)
      : [];

    const uiDateList = Array.isArray(selectionDates) && selectionDates.length
      ? selectionDates.map((date) => getDateKey(date)).filter(Boolean)
      : [];

    const mealDateList = Array.from(
      new Set(
        menuSelections
          .flatMap((customer) => customer.selectedMeals || [])
          .map((meal) => getDateKey(meal.date || meal.menuItemId?.itemDate))
          .filter(Boolean)
      )
    ).sort();

    const dateList = menuDateList.length > 0
      ? menuDateList
      : uiDateList.length > 0
        ? uiDateList
        : mealDateList;

    const wb = XLSX.utils.book_new();

    if (dateList.length === 0) {
      const rows = [
        ['NAME', 'CUS ID', 'STATUS'],
        ...menuSelections.map((customer) => [
          `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unnamed Customer',
          customer.customerId || '',
          'No meal selection'
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Selections');

      const safeTitle = String(menuTitle || 'menu-selections').replace(/[^a-z0-9-_]+/gi, '_');
      XLSX.writeFile(wb, `${safeTitle}-selections.xlsx`);
      return;
    }

    // Pre-compute which dates have at least one customer with selections.
    // If any customer selected for a date, the day was open for selection.
    const datesWithAnySelections = new Set(
      menuSelections
        .flatMap((c) => (c.selectedMeals || []).map((m) => getDateKey(m.date || m.menuItemId?.itemDate)))
        .filter(Boolean)
    );

    dateList.forEach((dateKey, index) => {
      const selectionDeadlines = menu?.selectionDeadlines || [];
      const dayIsLocked = isDateKeyLocked(dateKey, selectionDeadlines);
      // First pass: collect all unique meal names and customer data
      const uniqueMealsSet = new Set();
      const customerData = [];

      menuSelections.forEach((customer) => {
        const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unnamed Customer';
        const selections = Array.isArray(customer.selectedMeals) ? customer.selectedMeals : [];
        const mealsForDate = selections.filter((meal) => {
          const mealDateKey = getDateKey(meal.date || meal.menuItemId?.itemDate);
          return mealDateKey === dateKey;
        });

        // Consolidate duplicate selections (for backward compatibility)
        const consolidatedMap = new Map();
        mealsForDate.forEach((meal) => {
          // Use same fallback chain as the UI: _id → raw menuItemId → mealName
          // This ensures meals still display correctly even if menuItemId was
          // nulled out (e.g. because the menu was edited and old MenuItems deleted).
          const itemId = String(meal.menuItemId?._id || meal.menuItemId || meal.mealName || '');
          if (consolidatedMap.has(itemId)) {
            const existing = consolidatedMap.get(itemId);
            existing.quantity += (meal.quantity || 1);
          } else {
            consolidatedMap.set(itemId, {
              ...meal,
              quantity: meal.quantity || 1
            });
          }
        });

        const consolidatedMeals = Array.from(consolidatedMap.values());
        consolidatedMeals.forEach((meal) => {
          const mealName = meal.mealName || meal.menuItemId?.mealName || '';
          if (mealName) {
            uniqueMealsSet.add(mealName);
          }
        });

        customerData.push({
          name: customerName,
          id: customer.customerId || '',
          email: customer.email || '',
          lastMenuSelectionDate: customer.lastMenuSelectionDate || null,
          meals: consolidatedMeals
        });
      });

      // Sort unique meals alphabetically
      const uniqueMeals = Array.from(uniqueMealsSet).sort();

      // Add status column to show skipped days/no selection
      const headerRow = ['NAME', 'CUS ID', 'STATUS', ...uniqueMeals];

      // Create data rows - one row per customer
      // Also track which cells need yellow highlighting (exclusion conflicts)
      const rows = [headerRow];
      const conflictCells = []; // { r, c } zero-indexed

      customerData.forEach((customer, rowIdx) => {
        const hasMealsForDay = Array.isArray(customer.meals) && customer.meals.length > 0;
        // Submitted before deadline → they chose to leave it empty → "No meal selection"
        // Submitted after deadline (or never submitted) → "Closed Day"
        const excelDeadlineForDay = getDeadlineDate(dateKey, selectionDeadlines);
        const excelSubmittedAt = customer.lastMenuSelectionDate ? new Date(customer.lastMenuSelectionDate) : null;
        const excelSubmittedBeforeDeadline = excelSubmittedAt && excelDeadlineForDay && excelSubmittedAt <= excelDeadlineForDay;
        const dayClosed = dayIsLocked && !excelSubmittedBeforeDeadline;
        const row = [
          customer.name,
          customer.id,
          hasMealsForDay ? '' : dayClosed ? 'Closed Day' : 'No meal selection'
        ];

        // For each unique meal, include quantity if selected multiple times
        uniqueMeals.forEach((mealName, mealIdx) => {
          const mealsWithName = customer.meals.filter(
            (m) => (m.mealName || m.menuItemId?.mealName) === mealName
          );

          if (mealsWithName.length > 0) {
            const totalQty = mealsWithName.reduce((sum, meal) => sum + (meal.quantity || 1), 0);
            const isReplace = mealsWithName.some(m => m.carbVegAction === 'replace');
            const isKept    = mealsWithName.some(m => m.carbVegAction === 'kept');
            const hasCarb   = mealsWithName.some(m => m.carbConflict?.length > 0);
            const hasVeg    = mealsWithName.some(m => m.vegConflict?.length > 0);
            let actionLabel = '';
            if (isReplace || isKept) {
              const verb = isReplace ? 'Replace' : 'Keep';
              const what = hasCarb && hasVeg ? 'Carb+Veg' : hasCarb ? 'Carb' : hasVeg ? 'Veg' : 'Carb/Veg';
              actionLabel = ` [${verb} ${what}]`;
            }
            const conflictItems = mealsWithName.find(m => m.carbVegConflict?.length > 0)?.carbVegConflict;
            const conflictSuffix = conflictItems?.length ? ` (${conflictItems.join(', ')})` : '';
            const baseLabel = totalQty > 1 ? `${mealName} x${totalQty}` : mealName;
            row.push(`${baseLabel}${actionLabel}${conflictSuffix}`);

            // Flag for yellow highlight: meal name contains one of the customer's exclusions
            const hasConflict = mealsWithName.some((m) => m.conflict);
            if (hasConflict) {
              // rowIdx + 1 because row 0 is the header; mealIdx + 3 for NAME/CUS ID/STATUS cols
              conflictCells.push({ r: rowIdx + 1, c: mealIdx + 3 });
            }
          } else {
            row.push('');
          }
        });

        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Apply yellow fill to cells where exclusion conflicts exist
      conflictCells.forEach(({ r, c }) => {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellAddr]) ws[cellAddr] = { t: 's', v: '' };
        ws[cellAddr].s = {
          fill: { fgColor: { rgb: 'FFFF00' } },
          font: { bold: true }
        };
      });
      const sheetName = dateKey || `Day ${index + 1}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
    });

    const safeTitle = String(menuTitle || 'menu-selections').replace(/[^a-z0-9-_]+/gi, '_');
    XLSX.writeFile(wb, `${safeTitle}-selections.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Weekly Menus</h1>
            <p className="text-gray-600 mt-1">Manage and share weekly meal menus with customers</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowCreateForm(true);
                setEditingMenuId(null);
                setIsBodybuilderMode(false);
                setUploadError(null);
                setFormData({
                  title: '',
                  description: '',
                  startDate: '',
                  endDate: '',
                  mealPlans: ['Standard'],
                  enableCompletionMessage: false,
                  completionMessage: 'Your meal selections have been saved successfully.',
                  selectionDeadlines: []
                });
                setWeeklyItems([]);
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus size={20} />
              Create Menu
            </button>
            <button
              onClick={() => {
                setShowCreateForm(true);
                setEditingMenuId(null);
                setIsBodybuilderMode(true);
                setUploadError(null);
                setFormData({
                  title: '',
                  description: '',
                  startDate: '',
                  endDate: '',
                  mealPlans: ['Bodybuilder'],
                  enableCompletionMessage: false,
                  completionMessage: 'Your meal selections have been saved successfully.',
                  selectionDeadlines: []
                });
                setWeeklyItems([]);
              }}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus size={20} />
              Create Bodybuilder Menu
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Menu</h2>
            <form onSubmit={handleCreateMenu} className="space-y-4">
              {isBodybuilderMode && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                  <p className="font-semibold text-rose-800">Bodybuilder Menu Mode</p>
                  <p className="text-sm text-rose-700">This menu skips Excel upload and uses manual ingredient inputs: Protein, Vegetables, Carbs, Sauces.</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Menu Title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {!isBodybuilderMode && (
              <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">Upload Menu (Excel)</p>
                    <p className="text-xs text-gray-500">
                      Columns: CATEGORY, INTOLERANCES, DAY (1/2/3), GARNISH, MEAL NAME, CARB, VEG, SAUCE.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadMenuTemplate}
                      className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
                    >
                      Download Template
                    </button>
                    <label className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer flex items-center gap-2">
                      <Upload size={16} />
                      {isUploadingMenu ? 'Uploading...' : 'Upload Excel'}
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleMenuUpload}
                        disabled={isUploadingMenu}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                {uploadError && (
                  <p className="text-sm text-red-600 mt-2">{uploadError}</p>
                )}
              </div>
              )}

              {/* Completion Message Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-gray-900">Completion Message for Customers</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enableCompletionMessage}
                      onChange={(e) => setFormData({ ...formData, enableCompletionMessage: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">Enable custom message</span>
                  </label>
                </div>
                {formData.enableCompletionMessage && (
                  <textarea
                    placeholder="Enter a message to show customers after they complete their selections..."
                    value={formData.completionMessage}
                    onChange={(e) => setFormData({ ...formData, completionMessage: e.target.value })}
                    className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
                    rows={3}
                  />
                )}
              </div>

              {/* Selection Deadlines Section */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-gray-900">Selection Deadlines</label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Set a cutoff: after this deadline customers can no longer edit meals for that day.
                      E.g. Monday delivery → locked Friday at 23:59 (3 days before).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        selectionDeadlines: [
                          ...formData.selectionDeadlines,
                          { deliveryDay: 'Monday', daysBefore: 3, deadlineTime: '23:59' }
                        ]
                      });
                    }}
                    className="flex-shrink-0 px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600"
                  >
                    + Add Rule
                  </button>
                </div>

                {formData.selectionDeadlines.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No deadlines set — customers can edit anytime.</p>
                )}

                {formData.selectionDeadlines.map((rule, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-3 bg-white border border-orange-200 rounded-lg p-3">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-500">Delivery Day</label>
                      <select
                        value={rule.deliveryDay}
                        onChange={(e) => {
                          const updated = [...formData.selectionDeadlines];
                          updated[idx] = { ...updated[idx], deliveryDay: e.target.value };
                          setFormData({ ...formData, selectionDeadlines: updated });
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-orange-400"
                      >
                        {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-500">Lock N days before</label>
                      <input
                        type="number"
                        min={0}
                        max={6}
                        value={rule.daysBefore}
                        onChange={(e) => {
                          const updated = [...formData.selectionDeadlines];
                          updated[idx] = { ...updated[idx], daysBefore: Number(e.target.value) };
                          setFormData({ ...formData, selectionDeadlines: updated });
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-orange-400"
                      />
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-500">Deadline Time</label>
                      <input
                        type="time"
                        value={rule.deadlineTime}
                        onChange={(e) => {
                          const updated = [...formData.selectionDeadlines];
                          updated[idx] = { ...updated[idx], deadlineTime: e.target.value };
                          setFormData({ ...formData, selectionDeadlines: updated });
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-orange-400"
                      />
                    </div>

                    <div className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                      <label className="text-xs text-gray-500">Summary</label>
                      <span className="text-xs text-orange-700 font-medium">
                        {rule.deliveryDay} → locked {rule.daysBefore} day{rule.daysBefore !== 1 ? 's' : ''} before at {rule.deadlineTime}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = formData.selectionDeadlines.filter((_, i) => i !== idx);
                        setFormData({ ...formData, selectionDeadlines: updated });
                      }}
                      className="ml-auto text-red-500 hover:text-red-700 text-lg leading-none"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {weeklyItems.length > 0 && (
                <div className="mt-6 space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900">Weekly Menu Items</h3>
                  <p className="text-sm text-gray-600">
                    {isBodybuilderMode
                      ? 'Add items one time. The same ingredient options will be used for all days: Protein, Vegetables, Carbs, Sauces.'
                      : 'Add meals for each day (Category, Intolerances, Garnish, Meal Name, CARB, VEG, SAUCE).'}
                  </p>

                  {(isBodybuilderMode ? weeklyItems.slice(0, 1) : weeklyItems).map((day, dayIndex) => (
                    <div key={day.date} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold text-gray-900">{isBodybuilderMode ? 'All Days' : day.date}</div>
                        <button
                          type="button"
                          onClick={() => handleAddItemForDay(dayIndex)}
                          className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
                        >
                          {isBodybuilderMode ? '+ Add Item' : '+ Add Meal'}
                        </button>
                      </div>

                      <div className="space-y-4">
                        {day.items.map((item, itemIndex) => (
                          <div key={`${day.date}-${itemIndex}`} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
                            {/* Row 1: Meal Type, Price, and Meal Name (prominent) */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex gap-3">
                                <div className="flex-1">
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Meal Type</label>
                                  <select
                                    value={item.mealType}
                                    onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'mealType', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold"
                                  >
                                    <option value="breakfast">Breakfast</option>
                                    <option value="lunch">Lunch</option>
                                    <option value="dinner">Dinner</option>
                                    <option value="snack">Snack</option>
                                  </select>
                                </div>
                                <div className="w-28">
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Price (AED)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.price ?? 0}
                                    onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'price', Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold"
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              <div className="md:col-span-2">
                                {isBodybuilderMode ? (
                                  <div className="h-full rounded-lg border border-dashed border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-center">
                                    No meal name needed. It will be generated from ingredients.
                                  </div>
                                ) : (
                                  <>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Meal Name</label>
                                    <input
                                      type="text"
                                      value={item.mealName}
                                      onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'mealName', e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold text-lg"
                                      placeholder="Enter meal name"
                                      required
                                    />
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Intolerances + Allergens (prominent) */}
                            {!isBodybuilderMode && (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Intolerances / Exclusions</label>
                                <textarea
                                  rows={3}
                                  value={item.intolerances}
                                  onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'intolerances', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y font-semibold"
                                  placeholder="Enter any intolerances or exclusions (comma-separated)"
                                />
                                <p className="text-xs text-gray-500 mt-1">Soft warning — customer can acknowledge and still select the meal.</p>
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-red-700 mb-2">⛔ Allergens (Hard Block)</label>
                                <textarea
                                  rows={3}
                                  value={item.allergens}
                                  onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'allergens', e.target.value)}
                                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 resize-y font-semibold"
                                  placeholder="e.g. gluten, dairy, peanuts (comma-separated)"
                                />
                                <p className="text-xs text-red-500 mt-1">Hard block — if a customer's allergies match any allergen, carb, or veg in this meal, the meal is completely blocked for them.</p>
                              </div>
                            </div>
                            )}

                            {/* Row 3: Ingredients, Carbs, Veg */}
                            {isBodybuilderMode ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Protein</label>
                                  <textarea
                                    rows={3}
                                    value={item.proteinSource}
                                    onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'proteinSource', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                    placeholder="e.g. Chicken breast, Salmon, Tofu"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Vegetables</label>
                                  <textarea
                                    rows={3}
                                    value={item.veg}
                                    onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'veg', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                    placeholder="e.g. Broccoli, Spinach, Zucchini"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Carbs</label>
                                  <textarea
                                    rows={3}
                                    value={item.carbs}
                                    onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'carbs', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                    placeholder="e.g. Rice, Sweet potato, Quinoa"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sauces</label>
                                  <textarea
                                    rows={3}
                                    value={item.sauce}
                                    onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'sauce', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                    placeholder="e.g. Tahini, Pesto, Teriyaki"
                                  />
                                </div>
                              </div>
                            ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Ingredients</label>
                                <textarea
                                  rows={3}
                                  value={item.ingredients}
                                  onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'ingredients', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                  placeholder="List ingredients"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">CARB</label>
                                <textarea
                                  rows={3}
                                  value={item.carbs}
                                  onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'carbs', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                  placeholder="Carb type"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">VEG</label>
                                <textarea
                                  rows={3}
                                  value={item.veg}
                                  onChange={(e) => handleWeeklyItemChange(dayIndex, itemIndex, 'veg', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-y"
                                  placeholder="Vegetables"
                                />
                              </div>
                            </div>
                            )}

                            {/* Remove Button */}
                            <div className="flex justify-end pt-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveItemForDay(dayIndex, itemIndex)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-4 rounded-lg transition text-sm"
                              >
                                Remove Meal
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition"
                >
                  {editingMenuId ? 'Save Changes' : 'Create Menu'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingMenuId(null);
                    setIsBodybuilderMode(false);
                    setFormData({
                      title: '',
                      description: '',
                      startDate: '',
                      endDate: '',
                      mealPlans: ['Standard'],
                      enableCompletionMessage: false,
                      completionMessage: 'Your meal selections have been saved successfully.',
                      selectionDeadlines: []
                    });
                    setWeeklyItems([]);
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Menus List */}
        <div className="space-y-4">
          {menus.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Calendar className="mx-auto text-gray-400 mb-3" size={48} />
              <p className="text-gray-600">No menus yet. Create one to get started!</p>
            </div>
          ) : (
            menus.map((menu) => (
              <div
                key={menu._id}
                className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{menu.title}</h3>
                    {menu.description && (
                      <p className="text-gray-600 text-sm mt-1">{menu.description}</p>
                    )}
                    {Array.isArray(menu.mealPlans) && menu.mealPlans.includes('Bodybuilder') && (
                      <span className="inline-flex mt-2 bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                        Bodybuilder
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {menu.isPublished ? (
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                        <Check size={16} />
                        Published
                      </span>
                    ) : (
                      <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-semibold">
                        Draft
                      </span>
                    )}
                    {menu.isPublished && (
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${menu.shareLink?.isActive === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {menu.shareLink?.isActive === false ? 'Link Expired' : 'Link Active'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-gray-600 text-sm">Start Date</p>
                    <p className="font-semibold">
                      {new Date(menu.startDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">End Date</p>
                    <p className="font-semibold">
                      {new Date(menu.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">Views</p>
                    <p className="font-semibold flex items-center gap-1">
                      <Eye size={16} />
                      {menu.viewCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">Selections</p>
                    <p className="font-semibold flex items-center gap-1">
                      <Users size={16} />
                      {menu.selectionCount}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => handleEditMenu(menu._id)}
                    className="flex items-center gap-2 bg-amber-100 text-amber-700 hover:bg-amber-200 px-4 py-2 rounded-lg transition text-sm"
                  >
                    <Edit size={16} />
                    Edit Menu
                  </button>

                  {!menu.isPublished && (
                    <button
                      onClick={() => handlePublishMenu(menu._id)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
                    >
                      <Check size={16} />
                      Publish
                    </button>
                  )}

                  {menu.isPublished && (
                    <button
                      onClick={() => copyShareLink(menu._id)}
                      disabled={menu.shareLink?.isActive === false}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm ${
                        copiedLink === menu._id
                          ? 'bg-green-100 text-green-700'
                          : menu.shareLink?.isActive === false
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {copiedLink === menu._id ? (
                        <>
                          <Check size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copy Link
                        </>
                      )}
                    </button>
                  )}

                  {menu.isPublished && (
                    <button
                      onClick={() => handleToggleShareLink(menu._id, menu.shareLink?.isActive !== false)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm ${menu.shareLink?.isActive === false ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                    >
                      <LinkIcon size={16} />
                      {menu.shareLink?.isActive === false ? 'Enable Link' : 'Stop Link'}
                    </button>
                  )}

                  {menu.shareLink?.isActive === false ? (
                    <span className="flex items-center gap-2 bg-gray-100 text-gray-400 px-4 py-2 rounded-lg text-sm cursor-not-allowed">
                      <ExternalLink size={16} />
                      Preview
                    </span>
                  ) : (
                    <a
                      href={`/menu-select/${menu.shareLink?.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg transition text-sm"
                    >
                      <ExternalLink size={16} />
                      Preview
                    </a>
                  )}

                  <button
                    onClick={() => handleDownloadMenuPDF(menu)}
                    disabled={isDownloadingMenuPDF}
                    className="flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-lg transition text-sm disabled:opacity-50"
                  >
                    {isDownloadingMenuPDF ? (
                      <Loader size={16} className="animate-spin" />
                    ) : (
                      <FileText size={16} />
                    )}
                    {isDownloadingMenuPDF ? 'Downloading...' : 'Menu PDF'}
                  </button>

                  <button
                    onClick={() => handleDeleteMenu(menu._id)}
                    className="flex items-center gap-2 bg-red-100 text-red-700 hover:bg-red-200 px-4 py-2 rounded-lg transition text-sm"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>

                  <button
                    onClick={() => handleViewSelections(menu._id)}
                    className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 px-4 py-2 rounded-lg transition text-sm"
                  >
                    <Users size={16} />
                    {selectionMenuId === menu._id ? 'Hide Selections' : 'View Selections'}
                  </button>
                </div>

                {selectionMenuId === menu._id && (
                  <div className="mt-6 border-t border-gray-200 pt-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                      <h4 className="text-lg font-semibold text-gray-900">Customer Selections</h4>
                      <button
                        onClick={() => handleDownloadSelections(menu)}
                        disabled={selectionLoading || menuSelections.length === 0}
                        className="flex items-center gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-2 rounded-lg transition text-sm disabled:opacity-50"
                      >
                        <Download size={16} />
                        Download Excel
                      </button>
                    </div>

                    {selectionLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Loader className="animate-spin" size={16} />
                        Loading selections...
                      </div>
                    )}

                    {selectionError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                        {selectionError}
                      </div>
                    )}

                    {!selectionLoading && !selectionError && menuSelections.length === 0 && (
                      <div className="text-gray-500 text-sm">No selections yet.</div>
                    )}

                    {menuSelections.length > 0 && (
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Search customers..."
                          value={selectionSearch}
                          onChange={(e) => setSelectionSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {!selectionLoading && !selectionError && menuSelections.length > 0 && (
                      <div className="space-y-3">
                        {menuSelections
                          .filter((cust) => {
                            const q = selectionSearch.toLowerCase();
                            if (!q) return true;
                            const name = `${cust.firstName || ''} ${cust.lastName || ''}`.toLowerCase();
                            const email = (cust.email || '').toLowerCase();
                            return name.includes(q) || email.includes(q);
                          })
                          .map((customer) => (
                          <div 
                            key={customer._id} 
                            onClick={() => setSelectedCustomerDetail(customer)}
                            className="bg-white rounded-lg p-4 border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-indigo-300"
                          >
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                  {(() => {
                                    const firstName = customer.firstName || '';
                                    const lastName = customer.lastName || '';
                                    return `${firstName.charAt(0) || ''}${lastName.charAt(0) || 'C'}`.toUpperCase();
                                  })()}
                                </div>
                                <div>
                                  <div className="font-bold text-base text-gray-900">
                                    {`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unnamed Customer'}
                                  </div>
                                  <div className="text-sm text-gray-600">{customer.email || 'No email'}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                  {(() => {
                                    // Calculate total meals accounting for quantity
                                    const total = (customer.selectedMeals || []).reduce((sum, meal) => 
                                      sum + (meal.quantity || 1), 0
                                    );
                                    return total;
                                  })()} meal{(() => {
                                    const total = (customer.selectedMeals || []).reduce((sum, meal) => 
                                      sum + (meal.quantity || 1), 0
                                    );
                                    return total === 1 ? '' : 's';
                                  })()}
                                </div>
                                {customer.lastMenuSelectionDate && (
                                  <div className="text-right">
                                    <div className="text-xs text-gray-500">
                                      {new Date(customer.lastMenuSelectionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {new Date(customer.lastMenuSelectionDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCustomerSelection(selectionMenuId, customer); }}
                                  className="text-red-500 hover:bg-red-50 border border-red-200 rounded-lg p-1.5 transition-colors"
                                  title="Delete selection"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {Array.isArray(selectionDates) && selectionDates.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {selectionDates.map((date) => {
                                  const key = getDateKey(date);
                                  const mealsForDate = (customer.selectedMeals || []).filter(m => {
                                    const mealDate = m.date || m.menuItemId?.itemDate;
                                    return getDateKey(mealDate) === key;
                                  });
                                  
                                  // Consolidate duplicate meals
                                  const consolidatedMap = new Map();
                                  mealsForDate.forEach(meal => {
                                    const itemId = String(meal.menuItemId?._id || meal.menuItemId || meal.mealName || '');
                                    if (consolidatedMap.has(itemId)) {
                                      const existing = consolidatedMap.get(itemId);
                                      existing.quantity += (meal.quantity || 1);
                                    } else {
                                      consolidatedMap.set(itemId, {
                                        ...meal,
                                        quantity: meal.quantity || 1
                                      });
                                    }
                                  });
                                  
                                  const mealsFor = Array.from(consolidatedMap.values());
                                  const currentMenuDeadlines = menus.find(m => m._id === selectionMenuId)?.selectionDeadlines || [];
                                  // If day is locked AND customer submitted AFTER the deadline → they never
                                  // had a chance to select it → "Closed Day".
                                  // If day is locked AND customer submitted BEFORE the deadline → they
                                  // deliberately left it empty → "No meal selection".
                                  const dayIsLocked = isDateKeyLocked(key, currentMenuDeadlines);
                                  const submittedAt = customer.lastMenuSelectionDate ? new Date(customer.lastMenuSelectionDate) : null;
                                  const deadlineForDay = getDeadlineDate(key, currentMenuDeadlines);
                                  const submittedBeforeDeadline = submittedAt && deadlineForDay && submittedAt <= deadlineForDay;
                                  const dayLocked = dayIsLocked && !submittedBeforeDeadline;
                                  const dayClass = mealsFor.length === 0
                                    ? (dayLocked ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200')
                                    : 'bg-white';
                                  
                                  // Helper function to get meal type styling and icon
                                  const getMealStyle = (mealType) => {
                                    const type = (mealType || '').toLowerCase();
                                    if (type.includes('breakfast')) {
                                      return {
                                        bg: 'bg-amber-50',
                                        border: 'border-amber-200',
                                        text: 'text-amber-800',
                                        badge: 'bg-amber-100 text-amber-700',
                                        icon: Coffee
                                      };
                                    } else if (type.includes('lunch')) {
                                      return {
                                        bg: 'bg-green-50',
                                        border: 'border-green-200',
                                        text: 'text-green-800',
                                        badge: 'bg-green-100 text-green-700',
                                        icon: Sandwich
                                      };
                                    } else if (type.includes('dinner')) {
                                      return {
                                        bg: 'bg-blue-50',
                                        border: 'border-blue-200',
                                        text: 'text-blue-800',
                                        badge: 'bg-blue-100 text-blue-700',
                                        icon: Pizza
                                      };
                                    } else if (type.includes('snack')) {
                                      return {
                                        bg: 'bg-purple-50',
                                        border: 'border-purple-200',
                                        text: 'text-purple-800',
                                        badge: 'bg-purple-100 text-purple-700',
                                        icon: Cookie
                                      };
                                    }
                                    return {
                                      bg: 'bg-gray-50',
                                      border: 'border-gray-200',
                                      text: 'text-gray-800',
                                      badge: 'bg-gray-100 text-gray-700',
                                      icon: Sandwich
                                    };
                                  };
                                  
                                  return (
                                    <div key={key} className={`${dayClass} rounded-lg border-2 p-3 shadow-sm`}> 
                                      <div className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-500" />
                                        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                      </div>
                                      {mealsFor.length === 0 ? (
                                        dayLocked ? (
                                          <div className="text-sm text-gray-500 font-medium flex items-center gap-1 py-1">
                                            🔒 Closed Day
                                          </div>
                                        ) : (
                                          <div className="text-sm text-red-600 font-medium flex items-center gap-1 py-1">
                                            <AlertCircle className="w-4 h-4" />
                                            No meal selection
                                          </div>
                                        )
                                      ) : (
                                        <div className="space-y-2">
                                          {mealsFor.map((meal, idx) => {
                                            const mealStyle = getMealStyle(meal.mealType || meal.menuItemId?.mealType);
                                            const MealIcon = mealStyle.icon;
                                            return (
                                              <div
                                                key={idx}
                                                className={`${mealStyle.bg} ${mealStyle.border} border-l-4 rounded-lg p-2.5 ${meal.conflict ? 'ring-2 ring-yellow-400' : ''}`}
                                              >
                                                <div className="flex items-start gap-2">
                                                  <MealIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${mealStyle.text}`} />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-sm text-gray-900 break-words">
                                                      {meal.mealName || meal.menuItemId?.mealName || 'Meal'}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${mealStyle.badge}`}>
                                                        {meal.mealType || meal.menuItemId?.mealType || 'meal'}
                                                      </span>
                                                      {meal.quantity > 1 && (
                                                        <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                                          Qty: {meal.quantity}
                                                        </span>
                                                      )}
                                                      {meal.carbVegAction === 'replace' && (
                                                        <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                                          🔄 Replace carb/veg
                                                        </span>
                                                      )}
                                                      {meal.carbVegAction === 'kept' && (
                                                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                                          ✓ Keep carb/veg
                                                        </span>
                                                      )}
                                                      {meal.conflict && (
                                                        <span className="text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                                                          ⚠️ Exclusion
                                                        </span>
                                                      )}
                                                    </div>
                                                    {meal.carbVegConflict?.length > 0 && (
                                                      <div className="text-xs text-gray-500 mt-1">
                                                        Conflicting: {meal.carbVegConflict.join(', ')}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomerDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedCustomerDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div ref={modalContentRef}>
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-white font-bold text-xl">
                      {(() => {
                        const firstName = selectedCustomerDetail.firstName || '';
                        const lastName = selectedCustomerDetail.lastName || '';
                        return `${firstName.charAt(0) || ''}${lastName.charAt(0) || 'C'}`.toUpperCase();
                      })()}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold mb-1">
                        {`${selectedCustomerDetail.firstName || ''} ${selectedCustomerDetail.lastName || ''}`.trim() || 'Unnamed Customer'}
                      </h2>
                      <p className="text-indigo-100">{selectedCustomerDetail.email || 'No email'}</p>
                      {selectedCustomerDetail.customerId && (
                        <p className="text-indigo-200 text-sm mt-1">ID: {selectedCustomerDetail.customerId}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadAsImage}
                      disabled={isDownloadingImage || isDownloadingPDF}
                      className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg px-3 py-2 transition-colors flex items-center gap-2 disabled:opacity-50"
                      title="Download as JPEG"
                    >
                      {isDownloadingImage ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-5 h-5" />
                      )}
                      <span className="text-sm font-medium">JPEG</span>
                    </button>
                    <button
                      onClick={handleDownloadAsPDF}
                      disabled={isDownloadingImage || isDownloadingPDF || isDownloadingKitchenPaper}
                      className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg px-3 py-2 transition-colors flex items-center gap-2 disabled:opacity-50"
                      title="Download as PDF"
                    >
                      {isDownloadingPDF ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                      <span className="text-sm font-medium">PDF</span>
                    </button>
                    <button
                      onClick={() => {
                        const existing = selectedCustomerDetail?.macros?.presets || {};
                        setPresetMacroForm({
                          breakfast: {
                            C: existing.breakfast?.C ?? '',
                            P: existing.breakfast?.P ?? '',
                            F: existing.breakfast?.F ?? ''
                          },
                          snack: {
                            C: existing.snack?.C ?? '',
                            P: existing.snack?.P ?? '',
                            F: existing.snack?.F ?? ''
                          }
                        });
                        setShowPresetMacroModal(true);
                      }}
                      className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
                      title="Set breakfast & snack macro presets"
                    >
                      <Coffee className="w-5 h-5" />
                      <span className="text-sm font-medium">Presets</span>
                    </button>
                    <button
                      onClick={handleDownloadKitchenPaperPdf}
                      disabled={isDownloadingImage || isDownloadingPDF || isDownloadingKitchenPaper}
                      className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg px-3 py-2 transition-colors flex items-center gap-2 disabled:opacity-50"
                      title="Download kitchen paper PDF"
                    >
                      {isDownloadingKitchenPaper ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                      <span className="text-sm font-medium">Kitchen Paper</span>
                    </button>
                    <button
                      onClick={() => handleDeleteCustomerSelection(selectionMenuId, selectedCustomerDetail)}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
                      title="Delete selection"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="text-sm font-medium">Delete</span>
                    </button>
                    <button
                      onClick={async () => {
                        setEditDraft(JSON.parse(JSON.stringify(selectedCustomerDetail.selectedMeals || [])));
                        setIsEditingSelections(true);
                        setEditOpenSlot(null);
                        setEditMenuLoading(true);
                        try {
                          const [menuRes, profileRes] = await Promise.all([
                            (!editMenuData || editMenuData._id !== selectionMenuId)
                              ? api.get(`/menus/${selectionMenuId}`)
                              : Promise.resolve(null),
                            api.get(`/menus/customers/${selectedCustomerDetail.customerId}/meal-profile`)
                          ]);
                          if (menuRes?.data?.success) setEditMenuData(menuRes.data.data);
                          if (profileRes?.data?.success) {
                            const p = profileRes.data.data;
                            setSelectedCustomerDetail(prev => ({
                              ...prev,
                              mealPerDay: p.mealPerDay ?? prev.mealPerDay,
                              breakfastInclude: p.breakfastInclude ?? prev.breakfastInclude
                            }));
                          }
                        } catch (e) { console.error('Failed to load data for editing', e); }
                        finally { setEditMenuLoading(false); }
                      }}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
                      title="Edit selections"
                    >
                      <span className="text-sm font-medium">Edit Selections</span>
                    </button>
                    <button
                      onClick={() => setSelectedCustomerDetail(null)}
                      className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="bg-white bg-opacity-20 px-4 py-2 rounded-lg">
                    <div className="text-sm text-indigo-100">Total Meals</div>
                    <div className="text-2xl font-bold">
                      {(selectedCustomerDetail.selectedMeals || []).reduce((sum, meal) => sum + (meal.quantity || 1), 0)}
                    </div>
                  </div>
                  <div className="bg-white bg-opacity-20 px-4 py-2 rounded-lg">
                    <div className="text-sm text-indigo-100">Days with Selections</div>
                    <div className="text-2xl font-bold">
                      {(() => {
                        const uniqueDates = new Set();
                        (selectedCustomerDetail.selectedMeals || []).forEach(meal => {
                          const mealDate = meal.date || meal.menuItemId?.itemDate;
                          if (mealDate) uniqueDates.add(getDateKey(mealDate));
                        });
                        return uniqueDates.size;
                      })()}
                    </div>
                  </div>
                  {selectedCustomerDetail.lastMenuSelectionDate && (
                    <div className="bg-white bg-opacity-20 px-4 py-2 rounded-lg">
                      <div className="text-sm text-indigo-100">Submitted</div>
                      <div className="text-sm font-semibold mt-0.5">
                        {new Date(selectedCustomerDetail.lastMenuSelectionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="text-xs text-indigo-200">
                        {new Date(selectedCustomerDetail.lastMenuSelectionDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 240px)' }}>
                {isEditingSelections ? (
                  <div className="space-y-5" onClick={() => setEditOpenSlot(null)}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">Edit Meal Selections</h3>
                      <span className="text-xs text-gray-400">Bypasses allergen blocks</span>
                    </div>
                    {editMenuLoading && <p className="text-sm text-gray-400 italic">Loading menu…</p>}
                    {!editMenuLoading && (() => {
                      // Build date list from menu or existing selections
                      const mealPerDay = selectedCustomerDetail?.mealPerDay || 1;
                      const breakfastInclude = selectedCustomerDetail?.breakfastInclude || false;

                      // Collect all dates from the menu + draft
                      const allDates = new Set();
                      (editMenuData?.meals || []).forEach(m => {
                        if (m.date) allDates.add(m.date.split('T')[0]);
                      });
                      editDraft.forEach(m => {
                        const d = m.date ? (typeof m.date === 'string' ? m.date.split('T')[0] : new Date(m.date).toISOString().split('T')[0]) : null;
                        if (d) allDates.add(d);
                      });
                      const sortedDates = Array.from(allDates).sort();

                      if (sortedDates.length === 0) return <p className="text-gray-400 italic text-sm">No dates found.</p>;

                      // Build lookup: dateKey → { main: [items], breakfast: [items] } from menu
                      const menuItemsByDate = {};
                      (editMenuData?.meals || []).forEach(meal => {
                        const dk = meal.date ? meal.date.split('T')[0] : null;
                        if (!dk) return;
                        if (!menuItemsByDate[dk]) menuItemsByDate[dk] = { main: [], breakfast: [] };
                        const mealType = (meal.mealType || '').toLowerCase();
                        if (mealType === 'breakfast') {
                          (meal.items || []).forEach(it => menuItemsByDate[dk].breakfast.push(it));
                        } else if (mealType !== 'snack') {
                          (meal.items || []).forEach(it => menuItemsByDate[dk].main.push(it));
                        }
                      });

                      return sortedDates.map(dateKey => {
                        const dateLabel = (() => {
                          const [y, mo, d] = dateKey.split('-').map(Number);
                          return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        })();

                        const mainItems = menuItemsByDate[dateKey]?.main || [];
                        const bfItems = menuItemsByDate[dateKey]?.breakfast || [];

                        // Meals selected on this date (non-breakfast)
                        const mainDraft = editDraft.filter(m => {
                          const dk = m.date ? (typeof m.date === 'string' ? m.date.split('T')[0] : new Date(m.date).toISOString().split('T')[0]) : null;
                          return dk === dateKey && (m.mealType || '').toLowerCase() !== 'breakfast';
                        });
                        const bfDraft = editDraft.filter(m => {
                          const dk = m.date ? (typeof m.date === 'string' ? m.date.split('T')[0] : new Date(m.date).toISOString().split('T')[0]) : null;
                          return dk === dateKey && (m.mealType || '').toLowerCase() === 'breakfast';
                        });

                        const mainSlots = Array.from({ length: mealPerDay }, (_, i) => mainDraft[i] || null);
                        const bfSlots = breakfastInclude ? [bfDraft[0] || null] : [];

                        const renderSlot = (slotMeal, slotIndex, mealType, availableItems) => {
                          const slotKey = `${dateKey}|${mealType}|${slotIndex}`;
                          const isOpen = editOpenSlot === slotKey;
                          const isEmpty = !slotMeal;

                          return (
                            <div key={slotKey} className="relative" onClick={e => e.stopPropagation()}>
                              <div
                                onClick={() => setEditOpenSlot(isOpen ? null : slotKey)}
                                className={`rounded-xl border-2 p-3 cursor-pointer transition-all ${
                                  isEmpty
                                    ? 'border-dashed border-gray-300 bg-gray-50 text-gray-400'
                                    : 'border-indigo-200 bg-indigo-50 text-gray-800 hover:border-indigo-400'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2 min-h-[48px]">
                                  <div className="flex-1">
                                    {isEmpty ? (
                                      <span className="text-sm italic">Empty slot — click to add</span>
                                    ) : (
                                      <>
                                        <p className="text-sm font-bold leading-tight">{slotMeal.mealName}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 capitalize">{slotMeal.mealType}</p>
                                      </>
                                    )}
                                  </div>
                                  {!isEmpty && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setEditDraft(prev => {
                                          const copy = [...prev];
                                          const globalIdx = prev.indexOf(slotMeal);
                                          if (globalIdx !== -1) copy.splice(globalIdx, 1);
                                          return copy;
                                        });
                                        setEditOpenSlot(null);
                                      }}
                                      className="text-red-400 hover:text-red-600 flex-shrink-0 p-0.5"
                                      title="Remove"
                                    >✕</button>
                                  )}
                                </div>
                                <div className="text-xs text-indigo-500 mt-1">{isOpen ? '▲ close' : '▼ change'}</div>
                              </div>

                              {isOpen && (
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                                  {availableItems.length === 0 && (
                                    <p className="text-sm text-gray-400 p-3 italic">No items in menu for this day</p>
                                  )}
                                  {availableItems.map(menuItem => (
                                    <button
                                      key={menuItem._id}
                                      type="button"
                                      onClick={() => {
                                        setEditDraft(prev => {
                                          const copy = [...prev];
                                          if (isEmpty) {
                                            // Add new entry
                                            copy.push({
                                              date: dateKey,
                                              mealType: menuItem.mealType || mealType,
                                              menuItemId: String(menuItem._id),
                                              mealName: menuItem.mealName,
                                              quantity: 1
                                            });
                                          } else {
                                            // Replace existing
                                            const globalIdx = prev.indexOf(slotMeal);
                                            if (globalIdx !== -1) {
                                              copy[globalIdx] = {
                                                ...copy[globalIdx],
                                                menuItemId: String(menuItem._id),
                                                mealName: menuItem.mealName,
                                                mealType: menuItem.mealType || mealType
                                              };
                                            }
                                          }
                                          return copy;
                                        });
                                        setEditOpenSlot(null);
                                      }}
                                      className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-gray-100 last:border-0"
                                    >
                                      <p className="text-sm font-semibold text-gray-800">{menuItem.mealName}</p>
                                      <p className="text-xs text-gray-500 capitalize">{menuItem.mealType}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        };

                        return (
                          <div key={dateKey} className="border border-gray-200 rounded-xl p-4">
                            <h4 className="text-sm font-bold text-gray-700 mb-3">{dateLabel}</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {mainSlots.map((slot, i) => renderSlot(slot, i, 'lunch', mainItems))}
                              {bfSlots.map((slot, i) => renderSlot(slot, i, 'breakfast', bfItems))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={async () => {
                          setEditSaving(true);
                          try {
                            const res = await api.put(
                              `/menus/${selectionMenuId}/selections/${encodeURIComponent(selectedCustomerDetail.email)}`,
                              { selections: editDraft }
                            );
                            if (res.data?.success) {
                              setSelectedCustomerDetail(prev => ({ ...prev, selectedMeals: editDraft }));
                              setIsEditingSelections(false);
                            } else {
                              alert(res.data?.message || 'Failed to save');
                            }
                          } catch (err) {
                            alert(err.response?.data?.message || 'Network error');
                          } finally {
                            setEditSaving(false);
                          }
                        }}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                      >
                        {editSaving ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsEditingSelections(false); setEditOpenSlot(null); }}
                        className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="space-y-4">
                  {(() => {
                    const sourceDateKeys = Array.isArray(selectionDates) && selectionDates.length > 0
                      ? selectionDates.map((date) => getDateKey(date)).filter(Boolean)
                      : Array.from(new Set(
                          (selectedCustomerDetail.selectedMeals || []).map((meal) => {
                            const mealDate = meal.date || meal.menuItemId?.itemDate;
                            return getDateKey(mealDate);
                          }).filter(Boolean)
                        )).sort();

                    if (sourceDateKeys.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <p>No date information available</p>
                        </div>
                      );
                    }

                    return sourceDateKeys.map((key) => {
                      const mealsForDate = (selectedCustomerDetail.selectedMeals || []).filter(m => {
                        const mealDate = m.date || m.menuItemId?.itemDate;
                        return getDateKey(mealDate) === key;
                      });
                      
                      // Consolidate duplicate meals
                      const consolidatedMap = new Map();
                      mealsForDate.forEach(meal => {
                        const itemId = String(meal.menuItemId?._id || meal.menuItemId || meal.mealName || '');
                        if (consolidatedMap.has(itemId)) {
                          const existing = consolidatedMap.get(itemId);
                          existing.quantity += (meal.quantity || 1);
                        } else {
                          consolidatedMap.set(itemId, {
                            ...meal,
                            quantity: meal.quantity || 1
                          });
                        }
                      });
                      
                      const mealsFor = Array.from(consolidatedMap.values());
                      const modalMenuDeadlines = menus.find(m => m._id === selectionMenuId)?.selectionDeadlines || [];
                      const modalDayIsLocked = isDateKeyLocked(key, modalMenuDeadlines);
                      const modalSubmittedAt = selectedCustomerDetail.lastMenuSelectionDate ? new Date(selectedCustomerDetail.lastMenuSelectionDate) : null;
                      const modalDeadlineForDay = getDeadlineDate(key, modalMenuDeadlines);
                      const modalSubmittedBeforeDeadline = modalSubmittedAt && modalDeadlineForDay && modalSubmittedAt <= modalDeadlineForDay;
                      const modalDayLocked = modalDayIsLocked && !modalSubmittedBeforeDeadline;
                      
                      // Helper function to get meal type styling and icon
                      const getMealStyle = (mealType) => {
                        const type = (mealType || '').toLowerCase();
                        if (type.includes('breakfast')) {
                          return {
                            bg: 'bg-amber-50',
                            border: 'border-amber-200',
                            text: 'text-amber-800',
                            badge: 'bg-amber-100 text-amber-700',
                            icon: Coffee
                          };
                        } else if (type.includes('lunch')) {
                          return {
                            bg: 'bg-green-50',
                            border: 'border-green-200',
                            text: 'text-green-800',
                            badge: 'bg-green-100 text-green-700',
                            icon: Sandwich
                          };
                        } else if (type.includes('dinner')) {
                          return {
                            bg: 'bg-blue-50',
                            border: 'border-blue-200',
                            text: 'text-blue-800',
                            badge: 'bg-blue-100 text-blue-700',
                            icon: Pizza
                          };
                        } else if (type.includes('snack')) {
                          return {
                            bg: 'bg-purple-50',
                            border: 'border-purple-200',
                            text: 'text-purple-800',
                            badge: 'bg-purple-100 text-purple-700',
                            icon: Cookie
                          };
                        }
                        return {
                          bg: 'bg-gray-50',
                          border: 'border-gray-200',
                          text: 'text-gray-800',
                          badge: 'bg-gray-100 text-gray-700',
                          icon: Sandwich
                        };
                      };
                      
                      return (
                        <div key={key} className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-sm"> 
                          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-lg font-bold text-gray-900">
                              {new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </h3>
                            <span className="ml-auto bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold">
                              {mealsFor.reduce((sum, m) => sum + (m.quantity || 1), 0)} meal{mealsFor.reduce((sum, m) => sum + (m.quantity || 1), 0) === 1 ? '' : 's'}
                            </span>
                          </div>
                          {mealsFor.length === 0 ? (
                            modalDayLocked ? (
                              <div className="text-sm text-gray-500 font-medium flex items-center gap-1 py-1">
                                🔒 Closed Day
                              </div>
                            ) : (
                              <div className="text-sm text-red-600 font-medium flex items-center gap-1 py-1">
                                <AlertCircle className="w-4 h-4" />
                                No meal selection
                              </div>
                            )
                          ) : (
                          <div className="grid gap-3">
                            {mealsFor.map((meal, idx) => {
                              const mealStyle = getMealStyle(meal.mealType || meal.menuItemId?.mealType);
                              const MealIcon = mealStyle.icon;
                              const ingredients = meal.menuItemId?.ingredients || meal.ingredients || '';
                              const carbs = meal.menuItemId?.carbs || meal.carbs || '';
                              const veg = meal.menuItemId?.veg || meal.veg || '';
                              
                              return (
                                <div
                                  key={idx}
                                  className={`${mealStyle.bg} ${mealStyle.border} border-l-4 rounded-lg p-4 shadow-sm`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`${mealStyle.bg} p-2 rounded-lg`}>
                                      <MealIcon className={`w-6 h-6 ${mealStyle.text}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <h4 className="font-bold text-lg text-gray-900">
                                          {meal.mealName || meal.menuItemId?.mealName || 'Meal'}
                                        </h4>
                                        {meal.quantity > 1 && (
                                          <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-sm font-bold flex-shrink-0">
                                            Qty: {meal.quantity}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                                        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${mealStyle.badge}`}>
                                          {meal.mealType || meal.menuItemId?.mealType || 'meal'}
                                        </span>
                                        {meal.carbVegAction === 'replace' && (
                                          <span className="text-sm font-bold bg-red-100 text-red-700 px-3 py-1 rounded-full">
                                            🔄 Replace carb/veg
                                          </span>
                                        )}
                                        {meal.carbVegAction === 'kept' && (
                                          <span className="text-sm font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full">
                                            ✓ Keep carb/veg
                                          </span>
                                        )}
                                        {meal.conflict && (
                                          <span className="text-sm font-bold bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
                                            ⚠️ Exclusion
                                          </span>
                                        )}
                                      </div>
                                      {meal.carbVegConflict?.length > 0 && (
                                        <div className="flex gap-2 text-sm mb-2">
                                          <span className="font-semibold text-gray-700 min-w-[80px]">Conflict:</span>
                                          <span className="text-gray-600">{meal.carbVegConflict.join(', ')}</span>
                                        </div>
                                      )}
                                      {(ingredients || carbs || veg) && (
                                        <div className="space-y-1.5 text-sm">
                                          {ingredients && (
                                            <div className="flex gap-2">
                                              <span className="font-semibold text-gray-700 min-w-[80px]">Ingredients:</span>
                                              <span className="text-gray-600">{ingredients}</span>
                                            </div>
                                          )}
                                          {carbs && (
                                            <div className="flex gap-2">
                                              <span className="font-semibold text-gray-700 min-w-[80px]">Carbs:</span>
                                              <span className="text-gray-600">{carbs}</span>
                                            </div>
                                          )}
                                          {veg && (
                                            <div className="flex gap-2">
                                              <span className="font-semibold text-gray-700 min-w-[80px]">Vegetables:</span>
                                              <span className="text-gray-600">{veg}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                )}
            </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setSelectedCustomerDetail(null)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preset Macros Modal */}
      {showPresetMacroModal && selectedCustomerDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]" onClick={() => setShowPresetMacroModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <h3 className="text-lg font-bold">Breakfast & Snack Presets</h3>
              <button onClick={() => setShowPresetMacroModal(false)} className="hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {[
                { key: 'breakfast', label: 'Breakfast', icon: <Coffee className="w-4 h-4" /> },
                { key: 'snack', label: 'Snack', icon: <Cookie className="w-4 h-4" /> }
              ].map(({ key, label, icon }) => (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-3">
                    {icon}
                    <span className="font-semibold text-gray-800">{label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {['C', 'P', 'F'].map((macro) => (
                      <div key={macro}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {macro === 'C' ? 'Carbs (g)' : macro === 'P' ? 'Protein (g)' : 'Fat (g)'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={presetMacroForm[key][macro]}
                          onChange={(e) => setPresetMacroForm(prev => ({
                            ...prev,
                            [key]: { ...prev[key], [macro]: e.target.value }
                          }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowPresetMacroModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={savingPresetMacros}
                onClick={async () => {
                  setSavingPresetMacros(true);
                  try {
                    const toNum = (v) => v === '' ? undefined : Number(v);
                    const breakfast = {
                      C: toNum(presetMacroForm.breakfast.C),
                      P: toNum(presetMacroForm.breakfast.P),
                      F: toNum(presetMacroForm.breakfast.F)
                    };
                    const snack = {
                      C: toNum(presetMacroForm.snack.C),
                      P: toNum(presetMacroForm.snack.P),
                      F: toNum(presetMacroForm.snack.F)
                    };
                    await api.patch(
                      `/menus/${selectionMenuId}/selections/${encodeURIComponent(selectedCustomerDetail.email)}/macros-presets`,
                      { breakfast, snack }
                    );
                    setSelectedCustomerDetail(prev => ({
                      ...prev,
                      macros: {
                        ...prev.macros,
                        presets: { breakfast, snack }
                      }
                    }));
                    setShowPresetMacroModal(false);
                  } catch (err) {
                    alert('Failed to save presets: ' + (err.response?.data?.message || err.message));
                  } finally {
                    setSavingPresetMacros(false);
                  }
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {savingPresetMacros ? 'Saving…' : 'Save Presets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
