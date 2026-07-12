import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, ShoppingCart, ClipboardList, Loader, ChevronDown, ChevronUp,
  Plus, Minus, Building2, CheckCircle, Download, X, FileText, Trash2,
  AlertCircle, BarChart2, Send, Save, Edit, ChevronLeft, ChevronRight, Calendar, Ban, Clock
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { partnerLogout, updatePartnerProfile } from '../store/slices/partnerAuthSlice';
import partnerApi from '../utils/partnerApi';

const fmt = (n) => Number(n || 0).toFixed(2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const MEAL_TYPE_BADGE = {
  breakfast: 'bg-amber-100 text-amber-700',
  lunch: 'bg-green-100 text-green-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-pink-100 text-pink-700'
};
const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

const STATUS_PILL = {
  draft:     'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  locked:    'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-600'
};

// MIN_ORDER is now dynamic — read from partner.minimumOrder

const minOrderDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString('en-CA');
};

const getCalendarDays = (month) => {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const last = new Date(year, m + 1, 0);
  const startDow = (first.getDay() + 6) % 7; // Mon=0, Sun=6
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, m, d));
  return days;
};

// ─── Invoice PDF ─────────────────────────────────────────────────────────────
const generateInvoicePdf = (invoice, partner) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const m = 15;
  let y = m;
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(79, 70, 229);
  doc.text('Matter Delivery', m, y); y += 7;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
  doc.text('Partner Invoice', m, y); y += 10;
  doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`Invoice: ${invoice.invoiceNumber}`, m, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Business: ${partner?.businessName || ''}`, m, y); y += 5;
  doc.text(`Delivery Date: ${fmtDate(invoice.order?.deliveryDate)}`, m, y); y += 5;
  doc.text(`Generated: ${fmtDate(invoice.lockedAt || invoice.createdAt)}`, m, y); y += 8;
  doc.autoTable({
    startY: y,
    head: [['Item', 'Qty', 'Unit Price (AED)', 'Total (AED)']],
    body: (invoice.lines || []).map(l => [l.itemName, l.quantity, fmt(l.unitPrice), fmt(l.lineRevenue)]),
    foot: [['', '', 'TOTAL', `${fmt(invoice.totalRevenue)} AED`]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [79, 70, 229] },
    footStyles: { fontStyle: 'bold', fillColor: [243, 244, 246] }
  });
  if (invoice.order?.notes) {
    const after = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text(`Notes: ${invoice.order.notes}`, m, after);
  }
  doc.save(`${invoice.invoiceNumber}.pdf`);
};

// ─── Shared empty state ──────────────────────────────────────────────────────
const Empty = ({ icon: Icon, text }) => (
  <div className="text-center py-16 text-gray-400">
    <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
    <p className="text-sm">{text}</p>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
const PartnerPortal = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const partner = useSelector(state => state.partnerAuth.partner);
  const MIN_ORDER = partner?.minimumOrder ?? 0;

  const [tab, setTab] = useState('order');

  // ── Calendar ordering state ───────────────────────────────────────────────
  const [menu, setMenu] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [dayOrders, setDayOrders] = useState({}); // { [dateStr]: { [itemId]: { qty, price, name } } }
  const [dayNotes, setDayNotes] = useState({});
  const [dayTiming, setDayTiming] = useState({});
  const [activeDay, setActiveDay] = useState(null);
  const [orderView, setOrderView] = useState('calendar'); // 'calendar' | 'dayMenu' | 'checkout'
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [checkoutResults, setCheckoutResults] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);

  // ── History tab state ────────────────────────────────────────────────────
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [expandedWeekGroup, setExpandedWeekGroup] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState({});

  // ── Reports tab state ────────────────────────────────────────────────────
  const [reports, setReports] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadMenu = useCallback(async (date) => {
    setMenuLoading(true); setMenuError('');
    try {
      const url = date ? `/partner/menu?date=${date}` : '/partner/menu';
      const res = await partnerApi.get(url);
      setMenu(res.data.data || []);
    } catch (err) {
      setMenuError(err.response?.data?.message || 'Failed to load menu');
    } finally { setMenuLoading(false); }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await partnerApi.get('/partner/orders');
      setOrders(res.data.data || []);
    } catch { } finally { setOrdersLoading(false); }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await partnerApi.get('/partner/invoices');
      setInvoices(res.data.data || []);
    } catch { } finally { setInvoicesLoading(false); }
  }, []);


  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await partnerApi.get('/partner/reports');
      setReports(res.data.data);
    } catch { } finally { setReportsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeDay) { loadMenu(activeDay); }
    else setMenu([]);
  }, [activeDay]);

  useEffect(() => {
    if (tab === 'history') { loadOrders(); loadInvoices(); }
    if (tab === 'reports') { loadReports(); }
  }, [tab, loadOrders, loadInvoices, loadReports]);

  // ── Menu grouping ─────────────────────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const g = {};
    menu.forEach(item => {
      const t = item.mealType || 'other';
      if (!g[t]) g[t] = [];
      g[t].push(item);
    });
    return g;
  }, [menu]);

  const activeDayCart = useMemo(() => activeDay ? (dayOrders[activeDay] || {}) : {}, [activeDay, dayOrders]);
  const activeDayTotal = useMemo(
    () => Object.values(activeDayCart).reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0),
    [activeDayCart]
  );
  const daysWithOrders = useMemo(
    () => Object.keys(dayOrders).filter(d => Object.keys(dayOrders[d] || {}).length > 0).sort(),
    [dayOrders]
  );
  const grandTotal = useMemo(
    () => daysWithOrders.reduce((s, d) =>
      s + Object.values(dayOrders[d] || {}).reduce((ds, i) => ds + (Number(i.price) || 0) * i.qty, 0), 0),
    [daysWithOrders, dayOrders]
  );

  // ── Group orders into weekly batches vs single orders ────────────────────
  const { weekGroups, singleOrders } = useMemo(() => {
    const groups = {};
    const singles = [];
    orders.forEach(order => {
      if (order.orderType === 'weekly' && order.weekGroupId) {
        if (!groups[order.weekGroupId]) groups[order.weekGroupId] = [];
        groups[order.weekGroupId].push(order);
      } else {
        singles.push(order);
      }
    });
    Object.values(groups).forEach(g => g.sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate)));
    // Sort groups by the first delivery date of each group (newest first)
    const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => new Date(b[0].deliveryDate) - new Date(a[0].deliveryDate));
    return { weekGroups: sortedGroups, singleOrders: singles };
  }, [orders]);

  // ── Calendar ordering actions ─────────────────────────────────────────────
  const setDayQty = (item, qty) => {
    if (!activeDay) return;
    setDayOrders(prev => {
      const day = { ...(prev[activeDay] || {}) };
      if (qty <= 0) delete day[item._id];
      else day[item._id] = { qty, price: Number(item.price) || 0, name: item.name };
      if (Object.keys(day).length === 0) {
        const next = { ...prev }; delete next[activeDay]; return next;
      }
      return { ...prev, [activeDay]: day };
    });
  };

  const selectDay = (dateStr) => {
    setActiveDay(dateStr);
    setOrderView('dayMenu');
    setCheckoutError('');
  };

  const removeDay = (dateStr) => {
    setDayOrders(prev => { const n = { ...prev }; delete n[dateStr]; return n; });
    setDayNotes(prev => { const n = { ...prev }; delete n[dateStr]; return n; });
    setDayTiming(prev => { const n = { ...prev }; delete n[dateStr]; return n; });
  };

  const handleCheckout = async () => {
    for (const dateStr of daysWithOrders) {
      const tot = Object.values(dayOrders[dateStr] || {}).reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
      if (tot < MIN_ORDER) {
        setCheckoutError(`Order for ${fmtDate(dateStr)} is below the AED ${MIN_ORDER} minimum (AED ${fmt(tot)}).`);
        return;
      }
    }
    setCheckoutSubmitting(true); setCheckoutError('');
    const results = [];
    for (const dateStr of daysWithOrders) {
      const items = dayOrders[dateStr];
      const lines = Object.entries(items).map(([id, i]) => ({ menuItemId: id, quantity: i.qty }));
      try {
        const r = await partnerApi.post('/partner/orders', { deliveryDate: dateStr, lines, notes: dayNotes[dateStr] || '', deliveryTime: dayTiming[dateStr] || null });
        await partnerApi.post(`/partner/orders/${r.data.data._id}/submit`);
        results.push({ date: dateStr, success: true });
      } catch (err) {
        results.push({ date: dateStr, success: false, message: err.response?.data?.message || 'Failed' });
      }
    }
    setCheckoutResults(results);
    setCheckoutSuccess(true);
    setCheckoutSubmitting(false);
    setDayOrders({}); setDayNotes({}); setDayTiming({}); setActiveDay(null); setOrderView('calendar');
    loadOrders();
  };

  const handleEditOrder = (order) => {
    const dateStr = order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '';
    if (!dateStr) return;
    const items = {};
    (order.lines || []).forEach(l => {
      const id = String(l.menuItem?._id || l.menuItem);
      if (id) items[id] = { qty: l.quantity, price: Number(l.unitPrice) || 0, name: l.itemName || l.menuItem?.name || '' };
    });
    setDayOrders({ [dateStr]: items });
    setDayNotes({ [dateStr]: order.notes || '' });
    setEditingOrder(order);
    setActiveDay(dateStr);
    setOrderView('dayMenu');
    setCheckoutError('');
    setTab('order');
  };

  const handleUpdateOrder = async () => {
    if (!activeDay || Object.keys(activeDayCart).length === 0) {
      setCheckoutError('Add at least one item.'); return;
    }
    if (activeDayTotal < MIN_ORDER) {
      setCheckoutError(`Minimum order is AED ${MIN_ORDER}. Current total: AED ${fmt(activeDayTotal)}.`); return;
    }
    setCheckoutSubmitting(true); setCheckoutError('');
    const lines = Object.entries(activeDayCart).map(([id, i]) => ({ menuItemId: id, quantity: i.qty }));
    try {
      const r = await partnerApi.post('/partner/orders', { deliveryDate: activeDay, lines, notes: dayNotes[activeDay] || '', deliveryTime: dayTiming[activeDay] || null });
      await partnerApi.post(`/partner/orders/${r.data.data._id}/submit`);
      setCheckoutResults([{ date: activeDay, success: true }]);
      setCheckoutSuccess(true);
      setEditingOrder(null);
      setDayOrders({}); setDayNotes({}); setDayTiming({}); setActiveDay(null); setOrderView('calendar');
      loadOrders();
    } catch (err) {
      setCheckoutError(err.response?.data?.message || 'Failed to update order.');
    } finally { setCheckoutSubmitting(false); }
  };

  const cancelEdit = () => {
    setEditingOrder(null);
    setDayOrders({}); setDayNotes({}); setDayTiming({}); setActiveDay(null);
    setOrderView('calendar'); setMenu([]); setCheckoutError('');
  };

  const handleCancelOrder = async (order) => {
    const dateLabel = fmtDate(order.deliveryDate);
    if (!window.confirm(`Cancel the order for ${dateLabel}?\n\nThis cannot be undone.`)) return;
    try {
      await partnerApi.post(`/partner/orders/${order._id}/cancel`);
      loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order.');
    }
  };

  const fetchInvoiceLines = async (invoiceId) => {
    if (invoiceLines[invoiceId]) { setExpandedInvoice(invoiceId === expandedInvoice ? null : invoiceId); return; }
    try {
      const res = await partnerApi.get(`/partner/invoices/${invoiceId}`);
      setInvoiceLines(prev => ({ ...prev, [invoiceId]: res.data.data.lines || [] }));
      setExpandedInvoice(invoiceId);
    } catch { setExpandedInvoice(invoiceId); }
  };


  const handleLogout = () => { dispatch(partnerLogout()); navigate('/partner/login'); };

  const goToCheckout = () => {
    if (partner?.defaultDeliveryTime) {
      setDayTiming(prev => {
        const filled = { ...prev };
        daysWithOrders.forEach(d => { if (!filled[d]) filled[d] = partner.defaultDeliveryTime; });
        return filled;
      });
    }
    setOrderView('checkout');
  };

  const handleSaveDefaultTime = async (time) => {
    if (!time) return;
    try {
      await partnerApi.patch('/partner/profile', { defaultDeliveryTime: time });
      dispatch(updatePartnerProfile({ defaultDeliveryTime: time }));
    } catch { /* silent */ }
  };


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-gray-900 truncate leading-tight">{partner?.businessName || 'Partner Portal'}</div>
              <div className="text-xs text-gray-500 capitalize hidden sm:block">{partner?.businessType}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 sm:px-3 py-1.5 rounded-lg hover:bg-red-50 flex-shrink-0">
            <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
        {/* Desktop tabs — hidden on mobile */}
        <div className="hidden sm:flex max-w-6xl mx-auto px-4 border-t border-gray-100 overflow-x-auto">
          {[
            { id: 'order',   label: 'Place Order', icon: <ShoppingCart className="w-4 h-4" /> },
            { id: 'history', label: 'Orders',      icon: <ClipboardList className="w-4 h-4" /> },
            { id: 'reports', label: 'Reports',     icon: <BarChart2 className="w-4 h-4" /> }
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 pb-24 sm:pb-6">

        {/* ══ ORDER TAB ══ */}
        {tab === 'order' && (
          <>
            {/* Checkout success screen */}
            <AnimatePresence>
              {checkoutSuccess && (
                <motion.div key="checkout-success"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="bg-white rounded-2xl border border-green-200 shadow-lg p-10 max-w-md w-full text-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                      className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                      <CheckCircle className="w-10 h-10 text-green-600" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Orders Placed!</h2>
                    {checkoutResults && (
                      <div className="mt-4 space-y-1.5 text-left w-full">
                        {checkoutResults.map((r, i) => (
                          <div key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${r.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                            {r.success ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                            <span className="font-medium">{fmtDate(r.date)}</span>
                            {!r.success && <span className="text-xs ml-auto opacity-75">{r.message}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-gray-400 text-xs mt-5 leading-relaxed">
                      Matter will review and lock your orders before each delivery date.<br />Track them under the <strong>Orders</strong> tab.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 mt-7">
                      <button onClick={() => { setCheckoutSuccess(false); setCheckoutResults(null); }}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors">
                        Place More Orders
                      </button>
                      <button onClick={() => { setCheckoutSuccess(false); setCheckoutResults(null); setTab('history'); }}
                        className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors">
                        View My Orders
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!checkoutSuccess && (
            <>
              {/* CALENDAR VIEW */}
              {orderView === 'calendar' && (() => {
                const calDays = getCalendarDays(calendarMonth);
                const minDate = minOrderDate();
                const todayStr = new Date().toLocaleDateString('en-CA');
                const monthName = calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                return (
                  <>
                    <div className="flex items-center justify-between mb-5 bg-white rounded-xl border border-gray-200 px-5 py-4">
                      <button onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                        <ChevronLeft className="w-5 h-5 text-gray-500" />
                      </button>
                      <div className="text-base font-bold text-gray-900 capitalize">{monthName}</div>
                      <button onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      </button>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                      <div className="grid grid-cols-7 border-b border-gray-100">
                        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-3">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7">
                        {calDays.map((day, idx) => {
                          if (!day) return <div key={idx} className="h-20 border-b border-r border-gray-50" />;
                          const dateStr = day.toLocaleDateString('en-CA');
                          const isToday = dateStr === todayStr;
                          const isClosed = dateStr > todayStr && dateStr < minDate;
                          const orderable = dateStr >= minDate;
                          const hasOrder = !!(dayOrders[dateStr] && Object.keys(dayOrders[dateStr]).length > 0);
                          const dayTot = hasOrder
                            ? Object.values(dayOrders[dateStr]).reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0)
                            : 0;
                          const meetsMin = dayTot >= MIN_ORDER;
                          return (
                            <button key={idx} disabled={!orderable} onClick={() => selectDay(dateStr)}
                              className={[
                                'relative flex flex-col items-center justify-start pt-2 pb-1 h-20 border-b border-r border-gray-100 transition-colors',
                                isClosed ? 'cursor-not-allowed bg-red-50' : '',
                                !isClosed && !orderable ? 'cursor-not-allowed bg-gray-50' : '',
                                orderable ? 'cursor-pointer' : '',
                                orderable && !hasOrder ? 'hover:bg-indigo-50' : '',
                                hasOrder && meetsMin ? 'bg-green-50' : '',
                                hasOrder && !meetsMin ? 'bg-amber-50' : '',
                              ].join(' ')}>
                              <span className={[
                                'w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold',
                                isToday ? 'bg-indigo-600 text-white' : '',
                                isClosed ? 'text-red-300' : '',
                                !isClosed && !orderable && !isToday ? 'text-gray-300' : '',
                                orderable && !isToday ? 'text-gray-700' : '',
                              ].join(' ')}>
                                {day.getDate()}
                              </span>
                              {isClosed && (
                                <span className="text-xs text-red-400 font-medium mt-1 leading-tight">Closed</span>
                              )}
                              {hasOrder && (
                                <span className={`text-xs font-medium mt-1 px-1 py-0.5 rounded-full leading-tight
                                  ${meetsMin ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {fmt(dayTot)}
                                </span>
                              )}
                              {!hasOrder && orderable && (
                                <Plus className="w-3 h-3 text-gray-300 mt-1" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mb-5 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block" /> Closed (preparation)</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white border border-gray-200 inline-block" /> Available to order</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-50 border border-green-200 inline-block" /> Order placed</span>
                    </div>

                    {daysWithOrders.length > 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="font-bold text-gray-900">
                              {daysWithOrders.length} day{daysWithOrders.length !== 1 ? 's' : ''} in cart
                            </div>
                            <div className="text-sm text-gray-500">
                              Total: <span className="font-semibold text-indigo-700">AED {fmt(grandTotal)}</span>
                            </div>
                          </div>
                          <button onClick={() => goToCheckout()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2">
                            Checkout <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {daysWithOrders.map(dateStr => {
                            const tot = Object.values(dayOrders[dateStr]).reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
                            const ok = tot >= MIN_ORDER;
                            return (
                              <button key={dateStr} onClick={() => selectDay(dateStr)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors
                                  ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                {ok ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                {fmtDate(dateStr)} &middot; AED {fmt(tot)}
                              </button>
                            );
                          })}
                        </div>
                        {daysWithOrders.some(d =>
                          Object.values(dayOrders[d]).reduce((s,i) => s + (Number(i.price)||0)*i.qty, 0) < MIN_ORDER
                        ) && (
                          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Some days are below the AED {MIN_ORDER} minimum. Tap a day to add more items.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-14 text-gray-400">
                        <Calendar className="w-14 h-14 mx-auto mb-4 opacity-20" />
                        <p className="text-base font-medium text-gray-500">Tap a date to start ordering</p>
                        <p className="text-sm mt-1">First available date: {fmtDate(minDate)}</p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* DAY MENU VIEW */}
              {orderView === 'dayMenu' && activeDay && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => { setActiveDay(null); setOrderView('calendar'); setMenu([]); setCheckoutError(''); if (editingOrder) setEditingOrder(null); }}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0">
                      <ChevronLeft className="w-4 h-4" /> Calendar
                    </button>
                    <div className="flex-1 text-center font-bold text-gray-900">
                      {editingOrder ? 'Editing — ' : ''}{fmtDate(activeDay)}
                    </div>
                    {!editingOrder && (
                      <button onClick={() => { setActiveDay(null); setOrderView('calendar'); setMenu([]); }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex-shrink-0">
                        + Another day
                      </button>
                    )}
                  </div>

                  {menuLoading && <div className="flex justify-center py-20"><Loader className="w-8 h-8 animate-spin text-indigo-600" /></div>}
                  {menuError && <div className="text-center py-16 text-red-600">{menuError}</div>}

                  {!menuLoading && !menuError && (
                    <>
                      {menu.length === 0 && <Empty icon={ShoppingCart} text={`No items available for ${fmtDate(activeDay)}.`} />}
                      <div className="space-y-8">
                        {MEAL_TYPE_ORDER.filter(t => groupedItems[t]).map(type => (
                          <div key={type}>
                            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${MEAL_TYPE_BADGE[type]}`}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {groupedItems[type].map(item => {
                                const qty = activeDayCart[item._id]?.qty || 0;
                                return (
                                  <div key={item._id} className="bg-white rounded-xl border border-gray-200 p-4">
                                    <div className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</div>
                                    {item.category && <div className="text-xs text-gray-400 mt-0.5">{item.category}</div>}
                                    {item.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</div>}
                                    {item.ingredients?.length > 0 && (
                                      <div className="text-xs text-gray-400 mt-1 leading-relaxed">
                                        <span className="font-medium text-gray-500">Ingredients: </span>{item.ingredients.join(', ')}
                                      </div>
                                    )}
                                    <div className="mt-2 font-bold text-indigo-700 text-sm">
                                      {item.price != null ? `${fmt(item.price)} AED` : 'Price TBD'}
                                    </div>
                                    <div className="mt-3">
                                      {qty === 0 ? (
                                        <button onClick={() => setDayQty(item, 1)}
                                          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors">
                                          Add
                                        </button>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => setDayQty(item, qty - 1)}
                                            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
                                            <Minus className="w-3.5 h-3.5" />
                                          </button>
                                          <span className="font-semibold text-gray-900 w-6 text-center">{qty}</span>
                                          <button onClick={() => setDayQty(item, qty + 1)}
                                            className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 transition-colors">
                                            <Plus className="w-3.5 h-3.5 text-white" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {Object.keys(activeDayCart).length > 0 && (
                        <div className="mt-6">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Notes for this day</label>
                          <textarea value={dayNotes[activeDay] || ''}
                            onChange={e => setDayNotes(prev => ({ ...prev, [activeDay]: e.target.value }))}
                            rows={2} placeholder="Special instructions..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      )}
                    </>
                  )}

                  {/* Spacer so last item clears the mobile fixed footer */}
                  <div className="sm:hidden h-56" />

                  {/* Desktop minimum bar */}
                  {MIN_ORDER > 0 && (
                    <div className="hidden sm:block mt-6 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-600">Daily minimum</span>
                        <span className={`font-bold ${activeDayTotal >= MIN_ORDER ? 'text-green-600' : 'text-gray-800'}`}>
                          AED {fmt(activeDayTotal)} / {MIN_ORDER}
                          {activeDayTotal >= MIN_ORDER && <CheckCircle className="inline w-3 h-3 ml-1 text-green-500" />}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full transition-all ${activeDayTotal >= MIN_ORDER ? 'bg-green-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min((activeDayTotal / MIN_ORDER) * 100, 100)}%` }} />
                      </div>
                      {checkoutError && (
                        <p className="text-red-600 text-xs mb-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />{checkoutError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Desktop action bar */}
                  <div className={`hidden sm:flex gap-3 ${MIN_ORDER > 0 ? '' : 'mt-6 pt-4 border-t border-gray-100'}`}>
                    {editingOrder ? (
                      <>
                        <button onClick={handleUpdateOrder} disabled={checkoutSubmitting || activeDayTotal < MIN_ORDER}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                          {checkoutSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Changes
                        </button>
                        <button onClick={cancelEdit} disabled={checkoutSubmitting}
                          className="px-5 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setActiveDay(null); setOrderView('calendar'); setMenu([]); }}
                          className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                          <Plus className="w-4 h-4" /> Add more days
                        </button>
                        <button onClick={() => goToCheckout()}
                          disabled={daysWithOrders.length === 0}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                          Checkout <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* CHECKOUT VIEW */}
              {orderView === 'checkout' && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => setOrderView('calendar')}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0">
                      <ChevronLeft className="w-4 h-4" /> Calendar
                    </button>
                    <h2 className="flex-1 text-center font-bold text-gray-900 text-lg">Checkout</h2>
                    <div className="w-20" />
                  </div>

                  <div className="space-y-4">
                    {daysWithOrders.map(dateStr => {
                      const items = dayOrders[dateStr];
                      const tot = Object.values(items).reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
                      const ok = tot >= MIN_ORDER;
                      return (
                        <div key={dateStr} className={`bg-white rounded-xl border p-5 ${ok ? 'border-gray-200' : 'border-amber-300'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="font-bold text-gray-900">{fmtDate(dateStr)}</div>
                              <div className={`text-sm font-semibold flex items-center gap-1 ${ok ? 'text-green-600' : 'text-amber-600'}`}>
                                AED {fmt(tot)}
                                {ok ? <CheckCircle className="w-3 h-3" /> : <span className="text-xs font-normal">/ AED {MIN_ORDER} min</span>}
                              </div>
                              {dayTiming[dateStr] && (
                                <div className="text-xs text-indigo-600 font-medium mt-0.5">
                                  {dayTiming[dateStr]}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-3">
                              <button onClick={() => selectDay(dateStr)}
                                className="text-xs text-indigo-600 hover:underline font-medium">Edit</button>
                              <button onClick={() => removeDay(dateStr)}
                                className="text-xs text-red-500 hover:underline font-medium">Remove</button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {Object.entries(items).map(([id, i]) => (
                              <div key={id} className="flex justify-between text-sm text-gray-600">
                                <span>{i.name} &times; {i.qty}</span>
                                <span className="font-medium text-gray-800">AED {fmt((Number(i.price) || 0) * i.qty)}</span>
                              </div>
                            ))}
                          </div>
                          {!ok && (
                            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Below AED {MIN_ORDER} minimum
                            </p>
                          )}
                          <div className="mt-3">
                            <label className="text-xs font-medium text-gray-600 block mb-1.5">Delivery time</label>
                            {partner?.defaultDeliveryTime && (
                              <button type="button"
                                onClick={() => setDayTiming(prev => ({ ...prev, [dateStr]: partner.defaultDeliveryTime }))}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium mb-2 transition-colors ${dayTiming[dateStr] === partner.defaultDeliveryTime ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                                <Clock className="w-3 h-3" /> Saved: {partner.defaultDeliveryTime}
                              </button>
                            )}
                            <div className="flex items-center gap-2">
                              <input type="time" value={dayTiming[dateStr] || ''}
                                onChange={e => setDayTiming(prev => ({ ...prev, [dateStr]: e.target.value }))}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                              {dayTiming[dateStr] && dayTiming[dateStr] !== partner?.defaultDeliveryTime && (
                                <button type="button" onClick={() => handleSaveDefaultTime(dayTiming[dateStr])}
                                  className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                                  Save as default
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="mt-2">
                            <textarea value={dayNotes[dateStr] || ''}
                              onChange={e => setDayNotes(prev => ({ ...prev, [dateStr]: e.target.value }))}
                              rows={1} placeholder="Notes for this day..."
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:ring-1 focus:ring-indigo-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {daysWithOrders.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-sm">No days in cart. Go back to add orders.</p>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900">Grand Total</div>
                      <div className="text-xs text-gray-400">{daysWithOrders.length} day{daysWithOrders.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-xl font-bold text-indigo-700">AED {fmt(grandTotal)}</div>
                  </div>

                  {checkoutError && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" /> {checkoutError}
                    </div>
                  )}

                  <div className="mt-6 pb-24 sm:pb-6">
                    <button onClick={handleCheckout}
                      disabled={checkoutSubmitting || daysWithOrders.length === 0 ||
                        daysWithOrders.some(d =>
                          Object.values(dayOrders[d] || {}).reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0) < MIN_ORDER
                        )}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-4 text-base font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                      {checkoutSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      {checkoutSubmitting ? 'Placing Orders...' : `Place ${daysWithOrders.length} Order${daysWithOrders.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              )}
            </>
            )}
          </>
        )}
        {/* ══ HISTORY TAB ══ */}
        {tab === 'history' && (
          <div className="space-y-8">
            {/* Orders */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">My Orders</h2>
              {ordersLoading && <div className="flex justify-center py-8"><Loader className="w-6 h-6 animate-spin text-indigo-600" /></div>}
              {!ordersLoading && orders.length === 0 && <Empty icon={ClipboardList} text="No orders yet." />}

              {!ordersLoading && orders.length > 0 && (
                <div className="space-y-6">

                  {/* ── Weekly order groups ── */}
                  {weekGroups.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ClipboardList className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Weekly Orders</h3>
                        <span className="text-xs text-gray-400">{weekGroups.length} week{weekGroups.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-3">
                        {weekGroups.map(([groupId, groupOrders]) => {
                          const first = groupOrders[0];
                          const last = groupOrders[groupOrders.length - 1];
                          const isOpen = expandedWeekGroup === groupId;
                          // Status summary counts
                          const statusCounts = groupOrders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
                          const allLocked = groupOrders.every(o => o.status === 'locked');
                          return (
                            <div key={groupId} className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-sm">
                              {/* Group header */}
                              <button
                                className="w-full text-left px-4 py-3.5 flex items-center justify-between hover:bg-indigo-50 transition-colors gap-3"
                                onClick={() => setExpandedWeekGroup(isOpen ? null : groupId)}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Calendar className="w-4 h-4 text-indigo-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-gray-900 text-sm">
                                      {fmtDate(first.deliveryDate)} – {fmtDate(last.deliveryDate)}
                                    </div>
                                    <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                                      <span>{groupOrders.length} day{groupOrders.length !== 1 ? 's' : ''}</span>
                                      {Object.entries(statusCounts).map(([st, n]) => (
                                        <span key={st} className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_PILL[st] || 'bg-gray-100 text-gray-600'}`}>
                                          {n} {st}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                              </button>

                              {/* Individual days within the group */}
                              <AnimatePresence>
                                {isOpen && (
                                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                    <div className="border-t border-indigo-100 divide-y divide-gray-100">
                                      {groupOrders.map(order => (
                                        <div key={order._id}>
                                          <button
                                            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors gap-2"
                                            onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}>
                                            <div className="flex items-center gap-3 min-w-0">
                                              <div className="text-sm font-medium text-gray-800">{fmtDate(order.deliveryDate)}</div>
                                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_PILL[order.status] || 'bg-gray-100'}`}>{order.status}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              {order.status !== 'locked' && order.status !== 'cancelled' && !order.isLocked && (
                                                <>
                                                  <button onClick={e => { e.stopPropagation(); handleEditOrder(order); }}
                                                    className="flex items-center gap-1 text-xs text-indigo-600 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 border border-indigo-200">
                                                    <Edit className="w-3 h-3" /> Edit
                                                  </button>
                                                  <button onClick={e => { e.stopPropagation(); handleCancelOrder(order); }}
                                                    className="flex items-center gap-1 text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50 border border-red-200">
                                                    <Ban className="w-3 h-3" /> Cancel
                                                  </button>
                                                </>
                                              )}
                                              {expandedOrder === order._id ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                            </div>
                                          </button>
                                          <AnimatePresence>
                                            {expandedOrder === order._id && (
                                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                                <div className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                                                  <table className="w-full text-sm">
                                                    <thead><tr className="text-gray-400 text-xs"><th className="text-left pb-1">Item</th><th className="text-center pb-1">Qty</th></tr></thead>
                                                    <tbody>
                                                      {(order.lines || []).map((l, i) => (
                                                        <tr key={i} className="border-t border-gray-100">
                                                          <td className="py-1.5">{l.menuItem?.name || l.menuItem}</td>
                                                          <td className="py-1.5 text-center">{l.quantity}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                  {order.notes && <p className="text-xs text-gray-400 mt-2">Notes: {order.notes}</p>}
                                                </div>
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Single day orders ── */}
                  {singleOrders.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Single Day Orders</h3>
                        <span className="text-xs text-gray-400">{singleOrders.length} order{singleOrders.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-2">
                        {singleOrders.map(order => (
                          <div key={order._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <button
                              className="w-full text-left px-4 py-4 flex items-center justify-between hover:bg-gray-50 gap-2"
                              onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}>
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 text-sm">{fmtDate(order.deliveryDate)}</div>
                                <div className="text-xs text-gray-400">{order.lines?.length || 0} items · {fmtDate(order.createdAt)}</div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_PILL[order.status] || 'bg-gray-100 text-gray-700'}`}>{order.status}</span>
                                {order.status !== 'locked' && order.status !== 'cancelled' && !order.isLocked && (
                                  <>
                                    <button onClick={e => { e.stopPropagation(); handleEditOrder(order); }}
                                      className="flex items-center gap-1 text-xs text-indigo-600 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 border border-indigo-200">
                                      <Edit className="w-3 h-3" /> Edit
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleCancelOrder(order); }}
                                      className="flex items-center gap-1 text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50 border border-red-200">
                                      <Ban className="w-3 h-3" /> Cancel
                                    </button>
                                  </>
                                )}
                                {expandedOrder === order._id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                              </div>
                            </button>
                            <AnimatePresence>
                              {expandedOrder === order._id && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                  <div className="border-t border-gray-100 px-4 py-4">
                                    <table className="w-full text-sm min-w-[280px]">
                                      <thead><tr className="text-gray-500 text-xs"><th className="text-left pb-2">Item</th><th className="text-center pb-2">Qty</th></tr></thead>
                                      <tbody>
                                        {(order.lines || []).map((l, i) => (
                                          <tr key={i} className="border-t border-gray-100">
                                            <td className="py-1.5">{l.menuItem?.name || l.menuItem}</td>
                                            <td className="py-1.5 text-center">{l.quantity}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    {order.notes && <p className="text-xs text-gray-500 mt-2">Notes: {order.notes}</p>}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Invoices */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Invoices</h2>
              {invoicesLoading && <div className="flex justify-center py-8"><Loader className="w-6 h-6 animate-spin text-indigo-600" /></div>}
              {!invoicesLoading && invoices.length === 0 && <Empty icon={FileText} text="No invoices yet. Invoices are generated when orders are locked by Matter." />}
              {!invoicesLoading && invoices.length > 0 && (
                <div className="space-y-2">
                  {invoices.map(inv => (
                    <div key={inv._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <button className="w-full text-left px-4 py-4 flex items-center justify-between hover:bg-gray-50 gap-2"
                        onClick={() => fetchInvoiceLines(inv._id)}>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 text-sm">{inv.invoiceNumber}</div>
                          <div className="text-xs text-gray-400">Delivery: {fmtDate(inv.order?.deliveryDate)}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-bold text-indigo-700 text-sm">{fmt(inv.totalRevenue)} AED</span>
                          {expandedInvoice === inv._id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedInvoice === inv._id && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="border-t border-gray-100 px-4 py-4">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[300px]">
                                  <thead><tr className="text-gray-500 text-xs">
                                    <th className="text-left pb-2">Item</th>
                                    <th className="text-center pb-2">Qty</th>
                                    <th className="text-right pb-2">Unit</th>
                                    <th className="text-right pb-2">Total</th>
                                  </tr></thead>
                                  <tbody>
                                    {(invoiceLines[inv._id] || []).map((l, i) => (
                                      <tr key={i} className="border-t border-gray-100">
                                        <td className="py-1.5">{l.itemName}</td>
                                        <td className="py-1.5 text-center">{l.quantity}</td>
                                        <td className="py-1.5 text-right whitespace-nowrap">{fmt(l.unitPrice)}</td>
                                        <td className="py-1.5 text-right font-medium whitespace-nowrap">{fmt(l.lineRevenue)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot><tr className="border-t-2 border-gray-200">
                                    <td colSpan="3" className="py-2 font-bold text-right">Total</td>
                                    <td className="py-2 font-bold text-right text-indigo-700 whitespace-nowrap">{fmt(inv.totalRevenue)} AED</td>
                                  </tr></tfoot>
                                </table>
                              </div>
                              <button onClick={() => generateInvoicePdf({ ...inv, lines: invoiceLines[inv._id] || [] }, partner)}
                                className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                                <Download className="w-4 h-4" /> Download Invoice PDF
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ REPORTS TAB ══ */}
        {tab === 'reports' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-gray-900">My Reports</h2>
            {reportsLoading && <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-indigo-600" /></div>}
            {!reportsLoading && reports && (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Orders', value: reports.orderCount || 0, suffix: '' },
                    { label: 'Invoices', value: reports.invoiceCount || 0, suffix: '' },
                    { label: 'Total Spend', value: `${fmt(reports.totalSpend)}`, suffix: ' AED' }
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-indigo-700">{kpi.value}<span className="text-sm font-normal text-gray-500">{kpi.suffix}</span></div>
                      <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Top items */}
                {reports.topItems?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm">Top Items by Quantity</h3>
                    <div className="space-y-2">
                      {reports.topItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item._id}</span>
                          <span className="font-medium">{item.totalQty} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waste summary */}
                {reports.waste?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm">Waste Summary</h3>
                    <div className="space-y-2">
                      {reports.waste.map((w, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="capitalize text-gray-600">{w._id} side</span>
                          <span className="font-medium">{w.totalQty} units ({w.count} entries)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-30 safe-area-inset-bottom">
        {[
          { id: 'order',   label: 'Place Order', icon: ShoppingCart },
          { id: 'history', label: 'Orders',      icon: ClipboardList },
          { id: 'reports', label: 'Reports',     icon: BarChart2 }
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center justify-center pt-3 pb-4 gap-1 transition-colors active:scale-95 ${
              tab === id ? 'text-indigo-600' : 'text-gray-400'}`}>
            <div className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-colors ${tab === id ? 'bg-indigo-50' : ''}`}>
              <Icon className="w-6 h-6" />
            </div>
            <span className={`text-xs font-medium leading-none ${tab === id ? 'text-indigo-600' : 'text-gray-500'}`}>{label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile fixed action footer — always visible above bottom nav when in day menu */}
      {tab === 'order' && !checkoutSuccess && orderView === 'dayMenu' && (
        <div className="sm:hidden fixed bottom-24 left-0 right-0 z-20 bg-white border-t border-gray-200 px-4 pt-3 pb-3 shadow-lg">
          {/* Progress */}
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-gray-600">Daily minimum</span>
            <span className={`font-bold ${activeDayTotal >= MIN_ORDER ? 'text-green-600' : 'text-gray-800'}`}>
              AED {fmt(activeDayTotal)} / {MIN_ORDER}
              {activeDayTotal >= MIN_ORDER && <CheckCircle className="inline w-3 h-3 ml-1 text-green-500" />}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2.5">
            <div className={`h-full rounded-full transition-all ${activeDayTotal >= MIN_ORDER ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min((activeDayTotal / MIN_ORDER) * 100, 100)}%` }} />
          </div>
          {checkoutError && (
            <p className="text-red-600 text-xs mb-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />{checkoutError}
            </p>
          )}
          {/* Action buttons */}
          {editingOrder ? (
            <div className="flex gap-2">
              <button onClick={handleUpdateOrder} disabled={checkoutSubmitting || activeDayTotal < MIN_ORDER}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {checkoutSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
              <button onClick={cancelEdit} disabled={checkoutSubmitting}
                className="px-4 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setActiveDay(null); setOrderView('calendar'); setMenu([]); }}
                className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> Add more days
              </button>
              <button onClick={() => goToCheckout()}
                disabled={daysWithOrders.length === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
                Checkout <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PartnerPortal;
