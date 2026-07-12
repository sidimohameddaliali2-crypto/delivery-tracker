import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import {
  Flag, Package, AlertTriangle, X, RefreshCw,
  CheckCircle, Loader, Plus, Save,
  Search, User, Calendar, ChevronDown, Camera,
  AlertCircle, FileText
} from 'lucide-react';
import api from '../utils/api';

const TODAY = new Date().toISOString().slice(0, 10);

const ISSUE_TYPES = [
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'missing_item', label: 'Missing Item' },
  { value: 'late_delivery', label: 'Late Delivery' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'not_delivered', label: 'Not Delivered' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_CONFIG = {
  low: { label: 'Low', cls: 'bg-green-100 text-green-700' },
  medium: { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700' },
  high: { label: 'High', cls: 'bg-red-100 text-red-700' },
};

const ISSUE_TYPE_LABELS = Object.fromEntries(ISSUE_TYPES.map(t => [t.value, t.label]));

function formatDate(iso) {
  if (!iso) return 'â€”';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// â”€â”€â”€ Flagged Bags Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FlaggedBagsTab() {
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [flaggedBags, setFlaggedBags] = useState([]);
  const [loadingBags, setLoadingBags] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [notes, setNotes] = useState({});
  const [savedNoteIds, setSavedNoteIds] = useState({});
  const [savingNote, setSavingNote] = useState({});
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchBags = useCallback(async () => {
    setLoadingBags(true);
    setFetchError('');
    try {
      const res = await api.get('/bags?status=assigned&limit=1000');
      const allBags = Array.isArray(res.data)
        ? res.data
        : res.data?.bags || res.data?.data || [];
      setFlaggedBags(allBags);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load bags';
      setFetchError(msg);
      setFlaggedBags([]);
    } finally {
      setLoadingBags(false);
    }
  }, []);

  const fetchNotes = useCallback(async (date) => {
    try {
      const res = await api.get(`/bag-notes?date=${date}`);
      const noteList = res.data?.notes || [];
      const noteMap = {};
      const idMap = {};
      noteList.forEach(n => {
        noteMap[n.customerId] = n.note;
        idMap[n.customerId] = n._id;
      });
      setNotes(prev => ({ ...prev, ...noteMap }));
      setSavedNoteIds(idMap);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchBags();
    fetchNotes(selectedDate);
  }, [fetchBags, fetchNotes, selectedDate]);

  const FLAGGED_THRESHOLD = 3;
  const customerMap = {};
  flaggedBags.forEach(bag => {
    const customer = bag.assignedTo?.customer;
    if (!customer) return;
    const cid = (customer.customerId || customer.customerName || 'unassigned').trim().toLowerCase();
    const cname = customer.customerName?.trim() || 'Unnamed';
    const cidOriginal = customer.customerId?.trim() || cname;
    if (!customerMap[cid]) customerMap[cid] = { customerId: cidOriginal, customerName: cname, bags: [] };
    customerMap[cid].bags.push(bag);
  });
  const customerGroups = Object.values(customerMap)
    .filter(g => g.bags.length >= FLAGGED_THRESHOLD)
    .sort((a, b) => b.bags.length - a.bags.length);

  const saveNote = async (customerId, customerName, bagId) => {
    const note = notes[customerId];
    if (!note?.trim()) return;
    setSavingNote(prev => ({ ...prev, [customerId]: true }));
    try {
      await api.post('/bag-notes', { customerId, customerName, bagId, date: selectedDate, note: note.trim() });
      showToast(`Note saved for ${customerName}`);
      fetchNotes(selectedDate);
    } catch {
      showToast('Failed to save note');
    } finally {
      setSavingNote(prev => ({ ...prev, [customerId]: false }));
    }
  };

  return (
    <div className="p-6">
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[200] bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toastMsg}
        </div>
      )}


      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Flag className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Flagged Bag Notes</h2>
            <span className="bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full">{customerGroups.length} customers</span>
            <span className="text-xs text-gray-400">({flaggedBags.length} bags fetched)</span>
          </div>
          <button onClick={fetchBags} className="p-1.5 hover:bg-gray-100 rounded">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingBags ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-200">
          <Calendar className="w-4 h-4 text-gray-400" />
          <label className="text-sm text-gray-600 font-medium">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>
        <div className="space-y-4">
              {loadingBags ? (
                <div className="text-center py-12 text-gray-400">
                  <Loader className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Loading flagged bags…</p>
                </div>
              ) : fetchError ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
                  <p className="font-medium text-red-600">Failed to load flagged bags</p>
                  <p className="text-sm text-red-400 mt-1">{fetchError}</p>
                  <button onClick={fetchBags} className="mt-3 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700">Retry</button>
                </div>
              ) : customerGroups.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-300" />
                  <p className="font-medium text-gray-500">No flagged bags at the moment</p>
                </div>
              ) : (
                customerGroups.map(({ customerId, customerName, bags }) => (
                  <div key={customerId} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{customerName}</p>
                        <p className="text-xs text-gray-500">ID: {customerId}</p>
                      </div>
                      <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-full">
                        {bags.length} bag{bags.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {bags.map(bag => (
                      <div key={bag._id} className="mb-1.5 text-xs text-gray-600 flex items-center gap-2">
                        <Package className="w-3 h-3 text-orange-400 flex-shrink-0" />
                        <span className="font-mono font-medium">{bag.bagId}</span>
                        {bag.flagReason && <span className="text-gray-500">â€” {bag.flagReason}</span>}
                        {bag.flaggedAt && <span className="text-gray-400">({formatDate(bag.flaggedAt)})</span>}
                      </div>
                    ))}
                    <div className="mt-3">
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        Note for {selectedDate === TODAY ? 'today' : formatDate(selectedDate)}
                        {savedNoteIds[customerId] && <span className="ml-2 text-green-600">âœ“ Saved</span>}
                      </label>
                      <textarea
                        value={notes[customerId] || ''}
                        onChange={e => setNotes(prev => ({ ...prev, [customerId]: e.target.value }))}
                        placeholder="Add a note for this customerâ€¦"
                        rows={3}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => saveNote(customerId, customerName, bags[0]?.bagId)}
                          disabled={savingNote[customerId] || !notes[customerId]?.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingNote[customerId] ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Note
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Bag Collection Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CollectionStatusBadge({ delivery, onUpdate, updating }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isCollected = delivery.status === 'collected';
  const isNoBag = delivery.collectionDetails?.noBagsAvailable;

  let label, cls;
  if (isCollected && isNoBag) {
    label = 'No Bag Outside'; cls = 'bg-red-100 text-red-700 border-red-200';
  } else if (isCollected) {
    label = 'Collected'; cls = 'bg-green-100 text-green-700 border-green-200';
  } else {
    label = 'Not Collected'; cls = 'bg-yellow-100 text-yellow-700 border-yellow-200';
  }

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = [
    { label: 'Collected', action: () => onUpdate(delivery._id, { status: 'collected', collectionDetails: { ...(delivery.collectionDetails || {}), noBagsAvailable: false } }) },
    { label: 'No Bag Outside', action: () => onUpdate(delivery._id, { status: 'collected', collectionDetails: { ...(delivery.collectionDetails || {}), noBagsAvailable: true } }) },
    { label: 'Not Collected', action: () => onUpdate(delivery._id, { status: 'assigned', collectionDetails: { ...(delivery.collectionDetails || {}), noBagsAvailable: false } }) },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={updating}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border cursor-pointer hover:opacity-80 ${cls}`}
      >
        {updating && <Loader className="w-3 h-3 animate-spin" />}
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px]">
          {options.map(opt => (
            <button key={opt.label} onClick={() => { opt.action(); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg">
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BagCollectionTab() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState({});

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/deliveries?type=Collection&limit=500');
      setCollections(res.data?.data?.deliveries || res.data?.deliveries || []);
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const handleUpdate = async (id, fields) => {
    setUpdating(prev => ({ ...prev, [id]: true }));
    try {
      await api.put(`/deliveries/${id}`, fields);
      setCollections(prev => prev.map(d => d._id === id ? { ...d, ...fields } : d));
    } catch {
      // status stays unchanged on error
    } finally {
      setUpdating(prev => ({ ...prev, [id]: false }));
    }
  };

  const stats = {
    total: collections.length,
    collected: collections.filter(d => d.status === 'collected' && !d.collectionDetails?.noBagsAvailable).length,
    noBag: collections.filter(d => d.collectionDetails?.noBagsAvailable).length,
    pending: collections.filter(d => d.status !== 'collected').length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Bag Collection</h2>
          <p className="text-sm text-gray-500 mt-1">Track and update bag collection statuses</p>
        </div>
        <button onClick={fetchCollections} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, cls: 'bg-gray-50 border-gray-200 text-gray-700' },
          { label: 'Collected', value: stats.collected, cls: 'bg-green-50 border-green-200 text-green-600' },
          { label: 'No Bag Outside', value: stats.noBag, cls: 'bg-red-50 border-red-200 text-red-600' },
          { label: 'Not Collected', value: stats.pending, cls: 'bg-yellow-50 border-yellow-200 text-yellow-600' },
        ].map(s => (
          <div key={s.label} className={`border rounded-lg p-3 text-center ${s.cls}`}>
            <p className={`text-2xl font-bold ${s.cls.split(' ').find(c => c.startsWith('text-'))}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <Loader className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading collectionsâ€¦</p>
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">No bag collection deliveries found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {collections.map(delivery => (
                  <tr key={delivery._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{delivery.customerName}</p>
                      <p className="text-xs text-gray-400">{delivery.customerId}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{delivery.address || 'â€”'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {delivery.driver
                        ? `${delivery.driver.profile?.firstName || ''} ${delivery.driver.profile?.lastName || ''}`.trim() || 'â€”'
                        : 'â€”'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(delivery.scheduledTime)}
                      <span className="block text-xs text-gray-400">{formatTime(delivery.scheduledTime)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <CollectionStatusBadge delivery={delivery} onUpdate={handleUpdate} updating={!!updating[delivery._id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Delivery Issues Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ResolveModal({ issue, onClose, onResolved }) {
  const [resolveNotes, setResolveNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reopening = issue.status === 'resolved';

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.patch(`/delivery-issues/${issue._id}`, {
        status: reopening ? 'open' : 'resolved',
        resolvedNotes: resolveNotes.trim() || undefined,
      });
      onResolved();
    } catch {
      // keep modal open on error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{reopening ? 'Re-open Issue' : 'Resolve Issue'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div><span className="font-medium text-gray-500 text-xs">Customer: </span><span className="font-semibold">{issue.customerName}</span></div>
            <div><span className="font-medium text-gray-500 text-xs">Type: </span><span>{ISSUE_TYPE_LABELS[issue.issueType] || issue.issueType}</span></div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-500 text-xs">Priority: </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_CONFIG[issue.priority]?.cls}`}>{PRIORITY_CONFIG[issue.priority]?.label}</span>
            </div>
            <div><span className="font-medium text-gray-500 text-xs">Description: </span><p className="mt-1 text-gray-700">{issue.description}</p></div>
            {issue.photoUrl && <a href={issue.photoUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View photo â†’</a>}
          </div>
          {!reopening && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resolution notes <span className="text-gray-400">(optional)</span></label>
              <textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} rows={3} placeholder="Describe how the issue was resolvedâ€¦" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className={`px-4 py-2 text-sm text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${reopening ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'}`}>
            {submitting && <Loader className="w-4 h-4 animate-spin" />}
            {reopening ? 'Re-open Issue' : 'Mark Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliveryIssuesTab() {
  const { user } = useSelector(state => state.auth);
  const canResolve = user && ['admin', 'super_admin', 'dispatcher', 'manager'].includes(user.role);

  const [issues, setIssues] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [filter, setFilter] = useState('all');
  const [resolveTarget, setResolveTarget] = useState(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [issueType, setIssueType] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const searchRef = useRef(null);

  const fetchIssues = useCallback(async () => {
    setLoadingIssues(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await api.get(`/delivery-issues${params}`);
      setIssues(res.data?.issues || []);
    } catch {
      setIssues([]);
    } finally {
      setLoadingIssues(false);
    }
  }, [filter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) { setCustomerResults([]); setSearchOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/customers?search=${encodeURIComponent(customerSearch)}&limit=10`);
        const list = res.data?.data || [];
        setCustomerResults(list);
        setSearchOpen(list.length > 0);
      } catch { setCustomerResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post('/upload/delivery-photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoUrl(res.data?.url || '');
    } catch {
      setFormError('Photo upload failed. You can still submit without a photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    setFormError(''); setFormSuccess('');
    const nameToUse = selectedCustomer
      ? ([selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(' ') || selectedCustomer.customerId)
      : customerSearch.trim();
    const idToUse = selectedCustomer?.customerId || customerSearch.trim();
    if (!nameToUse) return setFormError('Please enter or select a customer.');
    if (!issueType) return setFormError('Please select an issue type.');
    if (!description.trim()) return setFormError('Please enter a description.');
    if (uploadingPhoto) return setFormError('Please wait for the photo to finish uploading.');
    setSubmitting(true);
    try {
      await api.post('/delivery-issues', { customerId: idToUse, customerName: nameToUse, issueType, description: description.trim(), photoUrl: photoUrl || undefined, priority });
      setFormSuccess('Issue reported successfully.');
      setSelectedCustomer(null); setCustomerSearch(''); setIssueType(''); setPriority('medium');
      setDescription(''); setPhotoPreview(null); setPhotoUrl('');
      fetchIssues();
    } catch {
      setFormError('Failed to submit issue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredIssues = issues.filter(i => filter === 'all' || i.status === filter);

  return (
    <div className="p-6">
      {resolveTarget && (
        <ResolveModal issue={resolveTarget} onClose={() => setResolveTarget(null)} onResolved={() => { setResolveTarget(null); fetchIssues(); }} />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Delivery Issues</h2>
          <p className="text-sm text-gray-500 mt-1">Report and track delivery issues per customer</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Issue List */}
        <div className="lg:col-span-2">
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
            {['all', 'open', 'resolved'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {f === 'all' ? `All (${issues.length})` : f === 'open' ? `Open (${issues.filter(i => i.status === 'open').length})` : `Resolved (${issues.filter(i => i.status === 'resolved').length})`}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {loadingIssues ? (
              <div className="text-center py-8 text-gray-400"><Loader className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : filteredIssues.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No issues found</p>
              </div>
            ) : (
              filteredIssues.map(issue => (
                <div key={issue._id} onClick={() => canResolve && setResolveTarget(issue)} className={`bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 ${canResolve ? 'cursor-pointer' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{issue.customerName}</p>
                      <p className="text-xs text-gray-500">{ISSUE_TYPE_LABELS[issue.issueType] || issue.issueType}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${issue.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{issue.status === 'resolved' ? 'Resolved' : 'Open'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_CONFIG[issue.priority]?.cls}`}>{PRIORITY_CONFIG[issue.priority]?.label}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{issue.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(issue.createdAt)}{issue.reportedByName && ` Â· ${issue.reportedByName}`}
                  </p>
                  {canResolve && <p className="text-xs text-blue-500 mt-1">Click to {issue.status === 'resolved' ? 're-open' : 'resolve'}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Create Form */}
        <div className="lg:col-span-3">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Report New Issue
            </h3>

            <div className="mb-4" ref={searchRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={selectedCustomer ? ([selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(' ') || selectedCustomer.customerId) : customerSearch}
                  onChange={e => { setSelectedCustomer(null); setCustomerSearch(e.target.value); }}
                  placeholder="Type name or search…"
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${selectedCustomer ? 'border-blue-300 bg-blue-50' : 'border-gray-300'}`}
                />
                {selectedCustomer && (
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }} className="absolute right-2 top-2 p-1 hover:bg-gray-100 rounded">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
                {searchOpen && customerResults.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {customerResults.map(c => (
                      <button key={c.customerId} onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setSearchOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                        <p className="text-sm font-medium">{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerId}</p>
                        <p className="text-xs text-gray-400">{c.customerId}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCustomer && <p className="text-xs text-blue-500 mt-1">ID: {selectedCustomer.customerId}</p>}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Type *</label>
              <select value={issueType} onChange={e => setIssueType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">Select issue typeâ€¦</option>
                {ISSUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority *</label>
              <div className="flex gap-3">
                {Object.entries(PRIORITY_CONFIG).map(([val, { label, cls }]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="priority" value={val} checked={priority === val} onChange={() => setPriority(val)} className="text-blue-600" />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe the delivery issue in detailâ€¦" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Photo <span className="text-gray-400">(optional)</span></label>
              {photoPreview ? (
                <div className="flex items-start gap-3">
                  <img src={photoPreview} alt="preview" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                  <div className="flex flex-col gap-1.5">
                    {uploadingPhoto && <div className="flex items-center gap-1.5 text-xs text-blue-600"><Loader className="w-3.5 h-3.5 animate-spin" /> Uploadingâ€¦</div>}
                    {!uploadingPhoto && photoUrl && <p className="text-xs text-green-600">âœ“ Uploaded</p>}
                    <button onClick={() => { setPhotoPreview(null); setPhotoUrl(''); }} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><X className="w-3 h-3" /> Remove</button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <Camera className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to attach a photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
              )}
            </div>

            {formError && (
              <div className="mb-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{formError}
              </div>
            )}
            {formSuccess && (
              <div className="mb-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />{formSuccess}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting || uploadingPhoto} className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {submitting ? 'Submittingâ€¦' : 'Submit Issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COMM_TABS = [
  { id: 'flagged-bags', label: 'Flagged Bags', icon: Flag },
  { id: 'bag-collection', label: 'Bag Collection', icon: Package },
  { id: 'delivery-issues', label: 'Delivery Issues', icon: AlertTriangle },
];

const Communication = () => {
  const [activeTab, setActiveTab] = useState('flagged-bags');
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Communication</h1>
        <p className="text-sm text-gray-500 mt-1">Bag notes, collection tracking, and delivery issue management</p>
      </div>
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex gap-1">
          {COMM_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div>
        {activeTab === 'flagged-bags' && <FlaggedBagsTab />}
        {activeTab === 'bag-collection' && <BagCollectionTab />}
        {activeTab === 'delivery-issues' && <DeliveryIssuesTab />}
      </div>
    </div>
  );
};

export default Communication;
