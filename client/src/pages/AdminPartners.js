import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  Plus, X, Edit, Trash2, ChevronDown, ChevronUp, Building2, Search,
  Loader, CheckCircle, XCircle, ClipboardList, Calendar, UtensilsCrossed,
  ToggleLeft, ToggleRight, Lock, FileText, BarChart2, Leaf, Download,
  DollarSign, Settings, AlertCircle, RefreshCw
} from 'lucide-react';
import api from '../utils/api';

const fmt = (n) => Number(n || 0).toFixed(2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_TYPE_COLORS = {
  breakfast: 'bg-amber-100 text-amber-700',
  lunch: 'bg-green-100 text-green-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-pink-100 text-pink-700'
};
const TYPE_COLORS = { cafe: 'bg-amber-100 text-amber-700', gym: 'bg-blue-100 text-blue-700', restaurant: 'bg-green-100 text-green-700', other: 'bg-gray-100 text-gray-600' };
const ORDER_STATUS_PILL = { draft: 'bg-gray-100 text-gray-700', submitted: 'bg-blue-100 text-blue-700', locked: 'bg-purple-100 text-purple-700' };
const WASTE_REASONS = ['over-order', 'spoilage', 'returns', 'prep-error'];

const exportCsv = (headers, rows, filename) => {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ═══════════════════════════════ MODALS ═══════════════════════════════════════

const Modal = ({ title, accent = 'indigo', onClose, children }) => {
  const headerCls = accent === 'green'
    ? 'bg-gradient-to-r from-green-600 to-green-700'
    : 'bg-gradient-to-r from-indigo-600 to-indigo-700';
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className={`${headerCls} text-white px-6 py-4 rounded-t-xl flex items-center justify-between`}>
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const PartnerFormModal = ({ onClose, onSaved, initial = null }) => {
  const isEdit = !!initial;
  const [form, setForm] = useState(isEdit
    ? { businessName: initial.businessName, businessType: initial.businessType, contactName: initial.contactName, phone: initial.phone || '', address: initial.address || '', minimumOrder: initial.minimumOrder ?? 0 }
    : { businessName: '', businessType: 'cafe', contactName: '', email: '', password: '', phone: '', address: '', minimumOrder: 0 }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (e) => { const { name, value } = e.target; setForm(p => ({ ...p, [name]: value })); setError(''); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const res = isEdit
        ? await api.patch(`/admin/partners/${initial._id}`, form)
        : await api.post('/admin/partners', form);
      onSaved(res.data.data); onClose();
    } catch (err) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={isEdit ? 'Edit Space' : 'Add Space'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
            <input name="businessName" required value={form.businessName} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Café Bella" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select name="businessType" value={form.businessType} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
              {['cafe', 'gym', 'restaurant', 'other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
            <input name="contactName" required value={form.contactName} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="John Smith" />
          </div>
          {!isEdit && <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input name="email" type="email" required value={form.email} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="partner@cafe.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input name="password" type="password" required minLength={6} value={form.password} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Min. 6 chars" />
            </div>
          </>}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input name="phone" value={form.phone} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="+971 50 000 0000" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input name="address" value={form.address} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Dubai, UAE" /></div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order (AED)</label>
            <input name="minimumOrder" type="number" min="0" step="0.01" value={form.minimumOrder} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="0" />
            <p className="text-xs text-gray-400 mt-1">Partners must reach this amount before placing an order. Set to 0 for no minimum.</p>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Space'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const toDateInput = (d) => d ? new Date(d).toISOString().split('T')[0] : '';

const MenuItemModal = ({ onClose, onSaved, initial = null }) => {
  const isEdit = !!initial;
  const [form, setForm] = useState(isEdit
    ? { name: initial.name, mealType: initial.mealType, description: initial.description || '', price: initial.price, category: initial.category || '', isAvailable: initial.isAvailable, availableFrom: toDateInput(initial.availableFrom), availableTo: toDateInput(initial.availableTo), ingredients: (initial.ingredients || []).join(', ') }
    : { name: '', mealType: 'lunch', description: '', price: '', category: '', isAvailable: true, availableFrom: '', availableTo: '', ingredients: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (e) => { const { name, value, type, checked } = e.target; setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value })); setError(''); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        availableFrom: form.availableFrom || null,
        availableTo: form.availableTo || null,
        ingredients: form.ingredients ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      const res = isEdit
        ? await api.patch(`/admin/partners/menu/${initial._id}`, payload)
        : await api.post('/admin/partners/menu', payload);
      onSaved(res.data.data); onClose();
    } catch (err) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={isEdit ? 'Edit Item' : 'Add Item'} accent="green" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm">{error}</div>}
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
          <input name="name" required value={form.name} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" placeholder="Grilled Chicken Bowl" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Meal Type *</label>
            <select name="mealType" value={form.mealType} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
              {MEAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Default Price (AED) *</label>
            <input name="price" type="number" required min="0" step="0.01" value={form.price} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" placeholder="25.00" /></div>
        </div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <input name="category" value={form.category} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" placeholder="High Protein, Vegan…" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea name="description" rows={2} value={form.description} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Ingredients <span className="text-gray-400 font-normal">(comma-separated)</span></label>
          <textarea name="ingredients" rows={2} value={form.ingredients} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500" placeholder="Chicken, Rice, Olive Oil, Garlic…" /></div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Availability Window <span className="text-gray-400 font-normal">(optional — leave blank for always available)</span></label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input name="availableFrom" type="date" value={form.availableFrom} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input name="availableTo" type="date" value={form.availableTo} onChange={set} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="isAvailable" checked={form.isAvailable} onChange={set} className="w-4 h-4 text-green-600 rounded" />
          <span className="text-sm text-gray-700">Available for ordering</span>
        </label>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Item'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Empty = ({ icon: Icon, text }) => (
  <div className="text-center py-16 text-gray-400"><Icon className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">{text}</p></div>
);

// ═══════════════════════════════ MAIN ═════════════════════════════════════════

const AdminPartners = () => {
  const currentUser = useSelector(state => state.auth.user);
  const isKitchen = currentUser?.role === 'kitchen';
  const [tab, setTab] = useState(isKitchen ? 'orders' : 'spaces');

  // ── Spaces state ───────────────────────────────────────────────────────────
  const [spaces, setSpaces] = useState([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [expandedSpace, setExpandedSpace] = useState(null);
  const [spaceOrders, setSpaceOrders] = useState({});

  // ── Master items state ─────────────────────────────────────────────────────
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // ── Space Setup state ──────────────────────────────────────────────────────
  const [selectedSetupSpace, setSelectedSetupSpace] = useState('');
  const [setupItems, setSetupItems] = useState([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [priceEdits, setPriceEdits] = useState({});
  const [costEdits, setCostEdits] = useState({});
  const [setupSaving, setSetupSaving] = useState({});

  // ── Orders state ───────────────────────────────────────────────────────────
  const [allOrders, setAllOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [orderSpaceFilter, setOrderSpaceFilter] = useState('');
  const [orderFrom, setOrderFrom] = useState('');
  const [orderTo, setOrderTo] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [lockingOrder, setLockingOrder] = useState(null);

  // ── Invoices state ─────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceType, setInvoiceType] = useState('partner');
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState({});

  // ── Waste state ────────────────────────────────────────────────────────────
  const [wasteLogs, setWasteLogs] = useState([]);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [wastePartyFilter, setWastePartyFilter] = useState('');
  const [wasteSpaceFilter, setWasteSpaceFilter] = useState('');
  const [wasteForm, setWasteForm] = useState({ spaceId: '', deliveryDate: '', menuItemId: '', quantity: '', reason: '', note: '' });
  const [wasteSubmitting, setWasteSubmitting] = useState(false);
  const [wasteError, setWasteError] = useState('');

  // ── Reports state ──────────────────────────────────────────────────────────
  const [reports, setReports] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try { const r = await api.get('/admin/partners', { params: { limit: 100 } }); setSpaces(r.data.data || []); }
    catch { } finally { setSpacesLoading(false); }
  }, []);

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    try { const r = await api.get('/admin/partners/menu'); setMenuItems(r.data.data || []); }
    catch { } finally { setMenuLoading(false); }
  }, []);

  const loadSetupItems = useCallback(async (spaceId) => {
    if (!spaceId) { setSetupItems([]); return; }
    setSetupLoading(true);
    try { const r = await api.get(`/admin/partners/${spaceId}/menu`); setSetupItems(r.data.data || []); }
    catch { } finally { setSetupLoading(false); }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const r = await api.get('/admin/partners/orders/all', { params: {
        status: orderStatusFilter || undefined,
        spaceId: orderSpaceFilter || undefined,
        from: orderFrom || undefined,
        to: orderTo || undefined
      }});
      setAllOrders(r.data.data || []);
    } catch { } finally { setOrdersLoading(false); }
  }, [orderStatusFilter, orderSpaceFilter, orderFrom, orderTo]);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try { const r = await api.get('/admin/partners/invoices/all', { params: { type: invoiceType } }); setInvoices(r.data.data || []); }
    catch { } finally { setInvoicesLoading(false); }
  }, [invoiceType]);

  const loadWaste = useCallback(async () => {
    setWasteLoading(true);
    try { const r = await api.get('/admin/partners/waste/all', { params: { party: wastePartyFilter || undefined, spaceId: wasteSpaceFilter || undefined } }); setWasteLogs(r.data.data || []); }
    catch { } finally { setWasteLoading(false); }
  }, [wastePartyFilter, wasteSpaceFilter]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try { const r = await api.get('/admin/partners/reports/consolidated', { params: { from: reportFrom || undefined, to: reportTo || undefined } }); setReports(r.data.data); }
    catch { } finally { setReportsLoading(false); }
  }, [reportFrom, reportTo]);

  useEffect(() => { loadSpaces(); loadMenu(); }, [loadSpaces, loadMenu]);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);
  useEffect(() => { if (tab === 'invoices') loadInvoices(); }, [tab, loadInvoices]);
  useEffect(() => { if (tab === 'waste') loadWaste(); }, [tab, loadWaste]);
  useEffect(() => { if (tab === 'reports') loadReports(); }, [tab, loadReports]);
  useEffect(() => { if (tab === 'setup' && selectedSetupSpace) loadSetupItems(selectedSetupSpace); }, [tab, selectedSetupSpace, loadSetupItems]);

  // ── Space actions ──────────────────────────────────────────────────────────
  const toggleActive = async (space) => {
    try {
      const r = await api.patch(`/admin/partners/${space._id}`, { isActive: !space.isActive });
      setSpaces(prev => prev.map(p => p._id === space._id ? r.data.data : p));
    } catch { alert('Failed to update status'); }
  };

  const deleteSpace = async (space) => {
    if (!window.confirm(`Delete "${space.businessName}"?`)) return;
    try { await api.delete(`/admin/partners/${space._id}`); setSpaces(prev => prev.filter(p => p._id !== space._id)); }
    catch { alert('Failed to delete'); }
  };

  const loadSpaceOrders = async (spaceId) => {
    if (spaceOrders[spaceId]) return;
    try { const r = await api.get(`/admin/partners/${spaceId}/orders`); setSpaceOrders(prev => ({ ...prev, [spaceId]: r.data.data || [] })); }
    catch { }
  };

  // ── Space setup actions ────────────────────────────────────────────────────
  const isAssigned = (menuItemId) => setupItems.some(a => String(a.menuItem?._id) === String(menuItemId) && a.isActive);

  const toggleAssignment = async (menuItemId, currentlyAssigned) => {
    if (!selectedSetupSpace) return;
    try {
      if (currentlyAssigned) {
        await api.delete(`/admin/partners/${selectedSetupSpace}/menu/${menuItemId}`);
      } else {
        await api.post(`/admin/partners/${selectedSetupSpace}/menu`, { menuItemId });
      }
      loadSetupItems(selectedSetupSpace);
    } catch (err) { alert(err.response?.data?.message || 'Failed to update assignment'); }
  };

  const savePrice = async (menuItemId) => {
    const price = priceEdits[menuItemId];
    if (price === undefined || price === '') return;
    setSetupSaving(p => ({ ...p, [menuItemId]: true }));
    try { await api.patch('/admin/partners/prices', { spaceId: selectedSetupSpace, menuItemId, price: Number(price) }); loadSetupItems(selectedSetupSpace); }
    catch (err) { alert(err.response?.data?.message || 'Failed to set price'); }
    finally { setSetupSaving(p => ({ ...p, [menuItemId]: false })); }
  };

  const saveCost = async (menuItemId) => {
    const cost = costEdits[menuItemId];
    if (cost === undefined || cost === '') return;
    setSetupSaving(p => ({ ...p, [`cost_${menuItemId}`]: true }));
    try { await api.post('/admin/partners/costs', { menuItemId, cost: Number(cost) }); loadSetupItems(selectedSetupSpace); }
    catch (err) { alert(err.response?.data?.message || 'Failed to set cost'); }
    finally { setSetupSaving(p => ({ ...p, [`cost_${menuItemId}`]: false })); }
  };

  // ── Order actions ──────────────────────────────────────────────────────────
  const lockOrder = async (orderId) => {
    if (!window.confirm('Lock this order and generate invoices? This cannot be undone.')) return;
    setLockingOrder(orderId);
    try { await api.patch(`/admin/partners/orders/${orderId}/lock`); loadOrders(); }
    catch (err) { alert(err.response?.data?.message || 'Failed to lock order'); }
    finally { setLockingOrder(null); }
  };

  // ── Invoice actions ────────────────────────────────────────────────────────
  const fetchInvoiceLines = async (invId) => {
    if (invoiceLines[invId]) { setExpandedInvoice(expandedInvoice === invId ? null : invId); return; }
    try {
      const r = await api.get(`/admin/partners/invoices/${invId}`);
      setInvoiceLines(prev => ({ ...prev, [invId]: r.data.data.lines || [] }));
      setExpandedInvoice(invId);
    } catch { setExpandedInvoice(invId); }
  };

  const downloadInvoicePdf = (inv) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const m = 15; let y = m;
    const isMatter = inv.type === 'matter';
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.setTextColor(isMatter ? 16 : 79, isMatter ? 185 : 70, isMatter ? 129 : 229);
    doc.text('Matter Delivery', m, y); y += 7;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(isMatter ? 'Internal Reconciliation Statement' : 'Partner Invoice', m, y); y += 10;
    doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`${isMatter ? 'Statement' : 'Invoice'}: ${inv.invoiceNumber}`, m, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Space: ${inv.space?.businessName || ''}`, m, y); y += 5;
    doc.text(`Delivery Date: ${fmtDate(inv.order?.deliveryDate)}`, m, y); y += 8;
    const lines = invoiceLines[inv._id] || [];
    const head = isMatter
      ? [['Item', 'Qty', 'Unit Price', 'Unit Cost', 'Revenue', 'Cost', 'Margin']]
      : [['Item', 'Qty', 'Unit Price (AED)', 'Total (AED)']];
    const body = lines.map(l => isMatter
      ? [l.itemName, l.quantity, fmt(l.unitPrice), fmt(l.unitCost), fmt(l.lineRevenue), fmt(l.lineCost), fmt(l.lineMargin)]
      : [l.itemName, l.quantity, fmt(l.unitPrice), fmt(l.lineRevenue)]
    );
    const foot = isMatter
      ? [['', '', '', '', fmt(inv.totalRevenue), fmt(inv.totalCost), fmt(inv.totalMargin)]]
      : [['', '', 'TOTAL', `${fmt(inv.totalRevenue)} AED`]];
    doc.autoTable({ startY: y, head, body, foot, styles: { fontSize: 9 }, headStyles: { fillColor: isMatter ? [16, 185, 129] : [79, 70, 229] }, footStyles: { fontStyle: 'bold', fillColor: [243, 244, 246] } });
    doc.save(`${inv.invoiceNumber}.pdf`);
  };

  // ── Waste submit ──────────────────────────────────────────────────────────
  const submitWaste = async (e) => {
    e.preventDefault(); setWasteError('');
    setWasteSubmitting(true);
    try {
      await api.post('/admin/partners/waste', { ...wasteForm, quantity: Number(wasteForm.quantity) });
      setWasteForm({ spaceId: '', deliveryDate: '', menuItemId: '', quantity: '', reason: '', note: '' });
      loadWaste();
    } catch (err) { setWasteError(err.response?.data?.message || 'Failed to log waste'); }
    finally { setWasteSubmitting(false); }
  };

  const filteredSpaces = useMemo(() => {
    if (!search) return spaces;
    const q = search.toLowerCase();
    return spaces.filter(p => p.businessName?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.contactName?.toLowerCase().includes(q));
  }, [spaces, search]);

  const TABS = [
    { id: 'spaces',   label: 'Spaces',       icon: <Building2 className="w-4 h-4" /> },
    { id: 'items',    label: 'Master Items',  icon: <UtensilsCrossed className="w-4 h-4" /> },
    { id: 'setup',    label: 'Space Setup',   icon: <Settings className="w-4 h-4" /> },
    { id: 'orders',   label: 'Orders',        icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'invoices', label: 'Invoices',      icon: <FileText className="w-4 h-4" /> },
    { id: 'waste',    label: 'Waste',         icon: <Leaf className="w-4 h-4" /> },
    { id: 'reports',  label: 'Reports',       icon: <BarChart2 className="w-4 h-4" /> }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Building2 className="w-6 h-6 text-indigo-600" />Partner Management</h1>
        <p className="text-gray-500 text-sm mt-1">Manage spaces, menus, orders, invoices and waste</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px flex-shrink-0 ${tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══ SPACES TAB ══ */}
      {tab === 'spaces' && (
        <>
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search spaces…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            {!isKitchen && (
              <button onClick={() => setShowAddSpace(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />Add Space
              </button>
            )}
          </div>

          {spacesLoading ? <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-indigo-600" /></div>
            : filteredSpaces.length === 0 ? <Empty icon={Building2} text={search ? 'No spaces match your search.' : 'No spaces yet. Add the first one.'} />
            : (
              <div className="space-y-2">
                {filteredSpaces.map(space => (
                  <div key={space._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-4 flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {space.businessName?.charAt(0)?.toUpperCase() || 'S'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{space.businessName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[space.businessType] || 'bg-gray-100 text-gray-600'}`}>{space.businessType}</span>
                          {space.isActive ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />Active</span>
                            : <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3 h-3" />Inactive</span>}
                          {space.minimumOrder > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              Min AED {space.minimumOrder}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 truncate">{space.contactName} · {space.email}{space.phone ? ` · ${space.phone}` : ''}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => { setExpandedSpace(expandedSpace === space._id ? null : space._id); loadSpaceOrders(space._id); }}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
                          <ClipboardList className="w-3.5 h-3.5" />Orders
                          {expandedSpace === space._id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {!isKitchen && (
                          <>
                            <button onClick={() => setEditingSpace(space)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => toggleActive(space)} className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${space.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                              {space.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => deleteSpace(space)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedSpace === space._id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                            {!spaceOrders[space._id] ? <div className="flex items-center gap-2 text-sm text-gray-400"><Loader className="w-4 h-4 animate-spin" />Loading…</div>
                              : spaceOrders[space._id].length === 0 ? <p className="text-sm text-gray-400 italic">No orders yet.</p>
                              : (
                                <table className="w-full text-sm">
                                  <thead><tr className="text-gray-500 text-xs">
                                    <th className="text-left pb-2">Delivery Date</th>
                                    <th className="text-left pb-2">Status</th>
                                    <th className="text-left pb-2">Created</th>
                                  </tr></thead>
                                  <tbody>
                                    {spaceOrders[space._id].map(o => (
                                      <tr key={o._id} className="border-t border-gray-200">
                                        <td className="py-2">{fmtDate(o.deliveryDate)}</td>
                                        <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ORDER_STATUS_PILL[o.status] || 'bg-gray-100 text-gray-600'}`}>{o.status}</span></td>
                                        <td className="py-2 text-gray-500">{fmtDate(o.createdAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      {/* ══ MASTER ITEMS TAB ══ */}
      {tab === 'items' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Master item database. Assign items to individual spaces in Space Setup.</p>
            <button onClick={() => setShowAddItem(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />Add Item
            </button>
          </div>
          {menuLoading ? <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-green-600" /></div>
            : menuItems.length === 0 ? <Empty icon={UtensilsCrossed} text="No items yet." />
            : (
              <div className="space-y-6">
                {MEAL_TYPES.filter(t => menuItems.some(i => i.mealType === t)).map(type => (
                  <div key={type}>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${MEAL_TYPE_COLORS[type]}`}>{type}</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {menuItems.filter(i => i.mealType === type).map(item => (
                        <div key={item._id} className={`bg-white rounded-xl border p-4 ${item.isAvailable ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-gray-900 text-sm">{item.name}</div>
                              {item.category && <div className="text-xs text-gray-400 mt-0.5">{item.category}</div>}
                              <div className="mt-1 font-bold text-indigo-700 text-sm">{fmt(item.price)} AED</div>
                              {(item.availableFrom || item.availableTo) && (
                                <div className="mt-1 text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {item.availableFrom ? fmtDate(item.availableFrom) : '∞'} → {item.availableTo ? fmtDate(item.availableTo) : '∞'}
                                </div>
                              )}
                            </div>
                            {!isKitchen && (
                              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                <button onClick={() => setEditingItem(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50"><Edit className="w-3.5 h-3.5" /></button>
                                <button onClick={async () => {
                                  try { const r = await api.patch(`/admin/partners/menu/${item._id}`, { isAvailable: !item.isAvailable }); setMenuItems(prev => prev.map(i => i._id === item._id ? r.data.data : i)); } catch { }
                                }} className={`p-1.5 rounded-lg transition-colors ${item.isAvailable ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                                  {item.isAvailable ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                </button>
                                <button onClick={async () => {
                                  if (!window.confirm(`Delete "${item.name}"?`)) return;
                                  try { await api.delete(`/admin/partners/menu/${item._id}`); setMenuItems(prev => prev.filter(i => i._id !== item._id)); } catch { }
                                }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      {/* ══ SPACE SETUP TAB ══ */}
      {tab === 'setup' && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Space</label>
              <select value={selectedSetupSpace} onChange={e => { setSelectedSetupSpace(e.target.value); setPriceEdits({}); setCostEdits({}); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="">Choose a space…</option>
                {spaces.map(s => <option key={s._id} value={s._id}>{s.businessName}</option>)}
              </select>
            </div>
            {selectedSetupSpace && <button onClick={() => loadSetupItems(selectedSetupSpace)} className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mt-5"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>}
          </div>

          {!selectedSetupSpace && <Empty icon={Settings} text="Select a space to manage its menu and pricing." />}
          {selectedSetupSpace && setupLoading && <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-indigo-600" /></div>}

          {selectedSetupSpace && !setupLoading && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">Check items to include them in this space's menu. Set the sell price (shown to partner) and COGS (internal only, for margin calculation).</p>
              <div className="space-y-4">
                {MEAL_TYPES.filter(t => menuItems.some(i => i.mealType === t)).map(type => (
                  <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${MEAL_TYPE_COLORS[type]}`}>{type}</div>
                    <div className="divide-y divide-gray-100">
                      {menuItems.filter(i => i.mealType === type).map(item => {
                        const assigned = isAssigned(item._id);
                        const setupEntry = setupItems.find(a => String(a.menuItem?._id) === String(item._id));
                        const currentPrice = setupEntry?.price ?? '';
                        const currentCost = setupEntry?.cost ?? '';
                        return (
                          <div key={item._id} className={`px-4 py-3 flex items-center gap-4 ${!assigned ? 'opacity-50' : ''}`}>
                            <input type="checkbox" checked={assigned} onChange={() => toggleAssignment(item._id, assigned)}
                              className="w-4 h-4 text-indigo-600 rounded" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm">{item.name}</div>
                              {item.category && <div className="text-xs text-gray-400">{item.category}</div>}
                            </div>
                            {assigned && (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <DollarSign className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                                  <input type="number" min="0" step="0.01"
                                    value={priceEdits[item._id] !== undefined ? priceEdits[item._id] : currentPrice}
                                    onChange={e => setPriceEdits(p => ({ ...p, [item._id]: e.target.value }))}
                                    placeholder={currentPrice !== '' ? String(currentPrice) : 'Sell price'}
                                    className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500" />
                                  <button onClick={() => savePrice(item._id)} disabled={setupSaving[item._id]}
                                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded px-2 py-1 disabled:opacity-40">
                                    {setupSaving[item._id] ? '…' : 'Set'}
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-400 flex-shrink-0">COGS</span>
                                  <input type="number" min="0" step="0.01"
                                    value={costEdits[item._id] !== undefined ? costEdits[item._id] : currentCost}
                                    onChange={e => setCostEdits(p => ({ ...p, [item._id]: e.target.value }))}
                                    placeholder={currentCost !== '' ? String(currentCost) : 'Cost'}
                                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-green-500" />
                                  <button onClick={() => saveCost(item._id)} disabled={setupSaving[`cost_${item._id}`]}
                                    className="text-xs bg-green-600 hover:bg-green-700 text-white rounded px-2 py-1 disabled:opacity-40">
                                    {setupSaving[`cost_${item._id}`] ? '…' : 'Set'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ ORDERS TAB ══ */}
      {tab === 'orders' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Space</label>
              <select value={orderSpaceFilter} onChange={e => setOrderSpaceFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="">All spaces</option>
                {spaces.map(s => <option key={s._id} value={s._id}>{s.businessName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="locked">Locked</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div><label className="block text-xs text-gray-500 mb-1">From</label>
                <input type="date" value={orderFrom} onChange={e => setOrderFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">To</label>
                <input type="date" value={orderTo} onChange={e => setOrderTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <button onClick={loadOrders} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">Apply</button>
          </div>

          {ordersLoading ? <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-indigo-600" /></div>
            : allOrders.length === 0 ? <Empty icon={Calendar} text="No orders found." />
            : (
              <div className="space-y-2">
                {allOrders.map(order => (
                  <div key={order._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{order.space?.businessName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_PILL[order.status] || 'bg-gray-100 text-gray-700'}`}>{order.status}</span>
                          {order.isLocked && order.status !== 'locked' && <span className="text-xs text-amber-600 flex items-center gap-0.5"><Lock className="w-3 h-3" />In lock window</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Delivery: {fmtDate(order.deliveryDate)} · {order.lines?.length || 0} items</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {order.status === 'submitted' && (
                          <button onClick={() => lockOrder(order._id)} disabled={lockingOrder === order._id}
                            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-40">
                            {lockingOrder === order._id ? <Loader className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}Lock & Invoice
                          </button>
                        )}
                        <button onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)} className="p-1.5 text-gray-400 hover:text-gray-700">
                          {expandedOrder === order._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedOrder === order._id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                            <table className="w-full text-sm">
                              <thead><tr className="text-gray-500 text-xs">
                                <th className="text-left pb-2">Item</th>
                                <th className="text-left pb-2">Type</th>
                                <th className="text-center pb-2">Qty</th>
                              </tr></thead>
                              <tbody>
                                {(order.lines || []).map((l, i) => (
                                  <tr key={i} className="border-t border-gray-200">
                                    <td className="py-1.5">{l.menuItem?.name || '—'}</td>
                                    <td className="py-1.5 text-gray-500 capitalize">{l.menuItem?.mealType}</td>
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
            )}
        </>
      )}

      {/* ══ INVOICES TAB ══ */}
      {tab === 'invoices' && (
        <>
          <div className="flex gap-3 mb-4">
            {['partner', 'matter'].map(t => (
              <button key={t} onClick={() => setInvoiceType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${invoiceType === t ? 'bg-indigo-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {t === 'partner' ? 'Partner Invoices' : 'Matter Statements'}
              </button>
            ))}
          </div>

          {invoicesLoading ? <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-indigo-600" /></div>
            : invoices.length === 0 ? <Empty icon={FileText} text={`No ${invoiceType === 'matter' ? 'matter statements' : 'partner invoices'} yet.`} />
            : (
              <div className="space-y-2">
                {invoices.map(inv => (
                  <div key={inv._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{inv.invoiceNumber}</div>
                        <div className="text-xs text-gray-500">{inv.space?.businessName} · Delivery: {fmtDate(inv.order?.deliveryDate)}</div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="font-bold text-indigo-700 text-sm">{fmt(inv.totalRevenue)} AED</div>
                          {invoiceType === 'matter' && <div className="text-xs text-green-600">Margin: {fmt(inv.totalMargin)}</div>}
                        </div>
                        <button onClick={() => { fetchInvoiceLines(inv._id); }} className="p-1.5 text-gray-400 hover:text-gray-700">
                          {expandedInvoice === inv._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedInvoice === inv._id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm min-w-[400px]">
                                <thead><tr className="text-gray-500 text-xs">
                                  <th className="text-left pb-2">Item</th>
                                  <th className="text-center pb-2">Qty</th>
                                  <th className="text-right pb-2">Unit Price</th>
                                  {invoiceType === 'matter' && <>
                                    <th className="text-right pb-2">Unit Cost</th>
                                    <th className="text-right pb-2">Margin</th>
                                  </>}
                                  <th className="text-right pb-2">Total</th>
                                </tr></thead>
                                <tbody>
                                  {(invoiceLines[inv._id] || []).map((l, i) => (
                                    <tr key={i} className="border-t border-gray-200">
                                      <td className="py-1.5">{l.itemName}</td>
                                      <td className="py-1.5 text-center">{l.quantity}</td>
                                      <td className="py-1.5 text-right">{fmt(l.unitPrice)}</td>
                                      {invoiceType === 'matter' && <>
                                        <td className="py-1.5 text-right text-gray-500">{fmt(l.unitCost)}</td>
                                        <td className="py-1.5 text-right text-green-600">{fmt(l.lineMargin)}</td>
                                      </>}
                                      <td className="py-1.5 text-right font-medium">{fmt(l.lineRevenue)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot><tr className="border-t-2 border-gray-300 font-bold">
                                  <td colSpan={invoiceType === 'matter' ? 5 : 3} className="py-2 text-right">Total</td>
                                  <td className="py-2 text-right text-indigo-700">{fmt(inv.totalRevenue)} AED</td>
                                </tr></tfoot>
                              </table>
                            </div>
                            {invoiceType === 'matter' && (
                              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                                {[['Revenue', inv.totalRevenue, 'text-indigo-700'], ['Cost', inv.totalCost, 'text-red-600'], ['Margin', inv.totalMargin, 'text-green-600']].map(([l, v, c]) => (
                                  <div key={l} className="bg-white rounded-lg border border-gray-200 p-2">
                                    <div className={`font-bold text-sm ${c}`}>{fmt(v)} AED</div>
                                    <div className="text-xs text-gray-500">{l}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button onClick={() => downloadInvoicePdf(inv)}
                              className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                              <Download className="w-4 h-4" />Download PDF
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      {/* ══ WASTE TAB ══ */}
      {tab === 'waste' && (
        <div className="space-y-8">
          {/* Log form */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-3">Log Matter-Side Waste</h3>
            <form onSubmit={submitWaste} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Space *</label>
                  <select value={wasteForm.spaceId} onChange={e => setWasteForm(p => ({ ...p, spaceId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select space…</option>
                    {spaces.map(s => <option key={s._id} value={s._id}>{s.businessName}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date *</label>
                  <input type="date" value={wasteForm.deliveryDate} onChange={e => setWasteForm(p => ({ ...p, deliveryDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Item *</label>
                  <select value={wasteForm.menuItemId} onChange={e => setWasteForm(p => ({ ...p, menuItemId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select item…</option>
                    {menuItems.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Quantity *</label>
                  <input type="number" min="1" value={wasteForm.quantity} onChange={e => setWasteForm(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
                  <select value={wasteForm.reason} onChange={e => setWasteForm(p => ({ ...p, reason: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select reason…</option>
                    {WASTE_REASONS.map(r => <option key={r} value={r}>{r.replace(/-/g, ' ')}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                  <input value={wasteForm.note} onChange={e => setWasteForm(p => ({ ...p, note: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Optional detail…" /></div>
              </div>
              {wasteError && <p className="text-red-600 text-xs mt-3 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{wasteError}</p>}
              <button type="submit" disabled={wasteSubmitting}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 px-5 text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-2">
                {wasteSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <Leaf className="w-4 h-4" />}Log Matter Waste
              </button>
            </form>
          </div>

          {/* Waste log */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-base font-bold text-gray-900 flex-1">All Waste Logs</h3>
              <select value={wastePartyFilter} onChange={e => setWastePartyFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500">
                <option value="">All parties</option>
                <option value="partner">Partner</option>
                <option value="matter">Matter</option>
              </select>
              <select value={wasteSpaceFilter} onChange={e => setWasteSpaceFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500">
                <option value="">All spaces</option>
                {spaces.map(s => <option key={s._id} value={s._id}>{s.businessName}</option>)}
              </select>
              <button onClick={loadWaste} className="text-xs text-indigo-600 hover:underline">Refresh</button>
              <button onClick={() => exportCsv(
                ['Date', 'Space', 'Item', 'Qty', 'Party', 'Reason', 'Note'],
                wasteLogs.map(l => [fmtDate(l.deliveryDate), l.space?.businessName || '', l.itemName, l.quantity, l.party, l.reason, l.note])
              , 'waste-log.csv')} className="flex items-center gap-1 text-xs text-green-700 hover:underline"><Download className="w-3 h-3" />CSV</button>
            </div>

            {wasteLoading ? <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-indigo-600" /></div>
              : wasteLogs.length === 0 ? <Empty icon={Leaf} text="No waste entries." />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px] bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <thead className="bg-gray-50"><tr>
                      {['Date', 'Space', 'Item', 'Qty', 'Party', 'Reason', 'Note'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {wasteLogs.map((l, i) => (
                        <tr key={l._id} className={`border-t border-gray-100 ${i % 2 === 1 ? 'bg-gray-50' : ''}`}>
                          <td className="px-4 py-2 whitespace-nowrap">{fmtDate(l.deliveryDate)}</td>
                          <td className="px-4 py-2">{l.space?.businessName || '—'}</td>
                          <td className="px-4 py-2">{l.itemName}</td>
                          <td className="px-4 py-2 text-center">{l.quantity}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${l.party === 'matter' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{l.party}</span></td>
                          <td className="px-4 py-2 capitalize text-gray-500">{l.reason?.replace(/-/g, ' ')}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{l.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      )}

      {/* ══ REPORTS TAB ══ */}
      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <button onClick={loadReports} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium">Refresh</button>
          </div>

          {reportsLoading && <div className="flex justify-center py-16"><Loader className="w-7 h-7 animate-spin text-indigo-600" /></div>}
          {!reportsLoading && reports && (
            <>
              {/* KPI totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Revenue', value: `${fmt(reports.totals?.revenue)} AED`, color: 'text-indigo-700' },
                  { label: 'Total Cost', value: `${fmt(reports.totals?.cost)} AED`, color: 'text-red-600' },
                  { label: 'Total Margin', value: `${fmt(reports.totals?.margin)} AED`, color: 'text-green-600' },
                  { label: 'Locked Invoices', value: reports.totals?.invoices || 0, color: 'text-gray-900' }
                ].map(kpi => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-space breakdown */}
              {reports.spaceStats?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm">Revenue by Space</h3>
                    <button onClick={() => exportCsv(
                      ['Space', 'Revenue (AED)', 'Cost (AED)', 'Margin (AED)', 'Invoices'],
                      reports.spaceStats.map(s => [s.spaceName, fmt(s.totalRevenue), fmt(s.totalCost), fmt(s.totalMargin), s.count])
                    , 'space-revenue.csv')} className="flex items-center gap-1 text-xs text-green-700 hover:underline"><Download className="w-3 h-3" />Export CSV</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        {['Space', 'Revenue', 'Cost', 'Margin', 'Margin %', 'Invoices'].map(h => (
                          <th key={h} className={`px-4 py-3 font-medium text-gray-600 text-xs ${h === 'Space' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {reports.spaceStats.map((s, i) => {
                          const marginPct = s.totalRevenue > 0 ? (s.totalMargin / s.totalRevenue * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-900">{s.spaceName || '—'}</td>
                              <td className="px-4 py-2.5 text-right text-indigo-700">{fmt(s.totalRevenue)}</td>
                              <td className="px-4 py-2.5 text-right text-red-600">{fmt(s.totalCost)}</td>
                              <td className="px-4 py-2.5 text-right text-green-600 font-semibold">{fmt(s.totalMargin)}</td>
                              <td className="px-4 py-2.5 text-right">{marginPct}%</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{s.count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Top items */}
                {reports.topItems?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 text-sm mb-3">Top Items by Quantity</h3>
                    <div className="space-y-2">
                      {reports.topItems.slice(0, 10).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-700 truncate flex-1 mr-3">{item._id}</span>
                          <span className="font-medium flex-shrink-0">{item.totalQty} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waste summary */}
                {reports.wasteStats?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 text-sm mb-3">Waste by Party & Space</h3>
                    <div className="space-y-2">
                      {reports.wasteStats.map((w, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-700">{w.spaceName || 'Unknown'} — <span className={`capitalize font-medium ${w.party === 'matter' ? 'text-red-600' : 'text-blue-600'}`}>{w.party}</span></span>
                          <span className="font-medium">{w.totalQty} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddSpace && <PartnerFormModal onClose={() => setShowAddSpace(false)} onSaved={s => setSpaces(prev => [s, ...prev])} />}
      {editingSpace && <PartnerFormModal initial={editingSpace} onClose={() => setEditingSpace(null)} onSaved={u => { setSpaces(prev => prev.map(p => p._id === u._id ? u : p)); setEditingSpace(null); }} />}
      {showAddItem && <MenuItemModal onClose={() => setShowAddItem(false)} onSaved={item => setMenuItems(prev => [...prev, item])} />}
      {editingItem && <MenuItemModal initial={editingItem} onClose={() => setEditingItem(null)} onSaved={u => { setMenuItems(prev => prev.map(i => i._id === u._id ? u : i)); setEditingItem(null); }} />}
    </div>
  );
};

export default AdminPartners;
