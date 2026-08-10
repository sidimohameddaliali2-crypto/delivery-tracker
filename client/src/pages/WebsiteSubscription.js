import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Package, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import { StatusBadge, CycleEndBadge } from '../components/subscriptionUi';
import { formatDate, isCycleEnded } from '../utils/subscriptionFormat';

const WebsiteSubscription = () => {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [emailFilter, setEmailFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hideEnded, setHideEnded] = useState(false);
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [matchResults, setMatchResults] = useState({});
  const [deliveryDateFilter, setDeliveryDateFilter] = useState('');
  const [deliveryFilterResults, setDeliveryFilterResults] = useState(null);
  const [checkingDeliveryFilter, setCheckingDeliveryFilter] = useState(false);
  const [downloadingActiveContacts, setDownloadingActiveContacts] = useState(false);

  const downloadActiveCustomersExcel = async () => {
    setDownloadingActiveContacts(true);
    setError('');
    try {
      // If a delivery-date filter is active, export just those matches
      // (already have phone/address from that check) instead of refetching
      // every active customer.
      const contacts = deliveryFilterResults !== null
        ? deliveryFilterResults
        : (await api.get('/matter/subscriptions/active-contacts')).data?.data || [];

      const worksheet = XLSX.utils.json_to_sheet(
        contacts.map((c) => ({ Name: c.name, Email: c.email, Phone: c.phone, Address: c.address }))
      );
      worksheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 50 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Active Customers');
      const filenameSuffix = deliveryFilterResults !== null ? `delivery-${deliveryDateFilter}` : new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `active-customers-${filenameSuffix}.xlsx`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download active customers.');
    } finally {
      setDownloadingActiveContacts(false);
    }
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/matter/subscriptions', {
        params: { page, page_size: pageSize, email: emailFilter || undefined },
      });
      const payload = res.data?.data || {};
      setSubscriptions(payload.data || []);
      setMeta(payload.meta || null);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError(err.response?.data?.message || 'Failed to load subscriptions.');
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, emailFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // The active list is either the normal paginated subscriptions, or — when
  // a delivery-date filter has been run — that filter's results instead.
  const activeList = deliveryFilterResults !== null ? deliveryFilterResults : subscriptions;

  // The list endpoint doesn't return phone, so this only checks email/name —
  // matches the profile page's cascade minus the phone tier.
  useEffect(() => {
    const toCheck = activeList.filter((s) => matchResults[s.subscription_id] === undefined);
    if (toCheck.length === 0) return;
    let cancelled = false;
    Promise.all(
      toCheck.map((s) =>
        api.get('/customers/match', { params: { email: s.email, name: s.name } })
          .then((res) => ({ id: s.subscription_id, matched: !!res.data?.data?.customer }))
          .catch(() => ({ id: s.subscription_id, matched: null }))
      )
    ).then((results) => {
      if (cancelled) return;
      setMatchResults((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.matched; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [activeList, matchResults]);

  const submitSearch = (e) => {
    e.preventDefault();
    setDeliveryFilterResults(null);
    setPage(1);
    setEmailFilter(search.trim());
  };

  const runDeliveryDateFilter = async () => {
    if (!deliveryDateFilter) return;
    setCheckingDeliveryFilter(true);
    setError('');
    try {
      const res = await api.get('/matter/subscriptions/delivery-on-date', {
        params: { date: deliveryDateFilter },
      });
      const subs = res.data?.data || [];
      setDeliveryFilterResults(subs.map((s) => ({
        subscription_id: s.subscription_id,
        customer_id: s.customer_id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        subscription_status: s.subscription_status || 'active',
        plan: { name: s.plan_name },
        cycle_end_date: s.cycle_end_date,
        renewal_eligible: s.renewal_eligible,
        renewal_due_date: s.renewal_due_date,
      })));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to check deliveries for that date.');
    } finally {
      setCheckingDeliveryFilter(false);
    }
  };

  const clearDeliveryFilter = () => {
    setDeliveryFilterResults(null);
    setDeliveryDateFilter('');
  };

  const visibleSubscriptions = activeList.filter((s) => {
    if (hideEnded && isCycleEnded(s.cycle_end_date)) return false;
    if (showUnmatchedOnly && matchResults[s.subscription_id] !== false) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Website Subscription</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live subscriptions from Matter's website API</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={downloadActiveCustomersExcel}
            disabled={downloadingActiveContacts}
            title={deliveryFilterResults !== null
              ? `Downloads the ${deliveryFilterResults.length} customer(s) shown for ${deliveryDateFilter}`
              : 'Fetches full contact details for every active subscription from Matter — can take 15-30 seconds'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            <Download className={`w-4 h-4 ${downloadingActiveContacts ? 'animate-pulse' : ''}`} />
            {downloadingActiveContacts
              ? 'Preparing…'
              : deliveryFilterResults !== null
                ? `Download Customers for ${deliveryDateFilter}`
                : 'Download Active Customers'}
          </button>
          <button
            onClick={fetchList}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <form onSubmit={submitSearch} className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition">
          Search
        </button>
        {emailFilter && (
          <button
            type="button"
            onClick={() => { setSearch(''); setEmailFilter(''); setPage(1); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideEnded}
            onChange={(e) => setHideEnded(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          Hide ended cycles
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showUnmatchedOnly}
            onChange={(e) => setShowUnmatchedOnly(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          Show only unmatched
        </label>
        {deliveryFilterResults === null && meta && (
          <p className="text-xs text-gray-400 ml-auto">
            {(hideEnded || showUnmatchedOnly) ? `${visibleSubscriptions.length} of ${subscriptions.length} shown on this page · ` : ''}
            {meta.total_records} total subscriptions
          </p>
        )}
      </form>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Filter by delivery date</h3>
        <p className="text-xs text-gray-400 mb-3">
          Shows active, non-cycle-ended subscriptions with a scheduled delivery on the chosen date — checks every
          active subscription's delivery schedule directly from Matter, so it can take 10–30 seconds.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={deliveryDateFilter}
            onChange={(e) => setDeliveryDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="button"
            onClick={runDeliveryDateFilter}
            disabled={checkingDeliveryFilter || !deliveryDateFilter}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
          >
            <Search className={`w-4 h-4 ${checkingDeliveryFilter ? 'animate-pulse' : ''}`} />
            {checkingDeliveryFilter ? 'Checking…' : 'Filter by Delivery Date'}
          </button>
          {deliveryFilterResults !== null && (
            <button
              type="button"
              onClick={clearDeliveryFilter}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filter
            </button>
          )}
          {deliveryFilterResults !== null && (
            <p className="text-xs text-gray-400 ml-auto">
              {visibleSubscriptions.length} of {deliveryFilterResults.length} customer(s) with a delivery on {deliveryDateFilter}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 animate-pulse">Loading…</div>
        ) : error ? (
          <div className="text-center py-16 text-rose-600">{error}</div>
        ) : visibleSubscriptions.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">
              {deliveryFilterResults !== null
                ? 'No matching subscriptions found for this date'
                : showUnmatchedOnly
                  ? 'No unmatched subscriptions on this page'
                  : hideEnded
                    ? 'No subscriptions with an active cycle on this page'
                    : 'No subscriptions found'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {visibleSubscriptions.map((s) => (
              <button
                key={s.subscription_id}
                onClick={() => navigate(`/website-subscriptions/${s.subscription_id}`)}
                className="text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-4 transition"
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <StatusBadge status={s.subscription_status} />
                    {isCycleEnded(s.cycle_end_date) && <CycleEndBadge cycleEndDate={s.cycle_end_date} />}
                  </div>
                </div>
                <p className="text-xs text-gray-400 truncate">{s.email}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>{s.plan?.name}</span>
                  <span>#{s.subscription_id}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">Renews {formatDate(s.renewal_due_date)}</p>
                  {matchResults[s.subscription_id] === undefined ? (
                    <span className="text-[10px] text-gray-300">Checking…</span>
                  ) : matchResults[s.subscription_id] ? (
                    <span className="text-[10px] font-semibold text-emerald-600">Matched</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-rose-500">No match</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {deliveryFilterResults === null && meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-500">Page {meta.page} of {meta.total_pages}</span>
          <button
            onClick={() => setPage((p) => (meta.total_pages ? Math.min(meta.total_pages, p + 1) : p + 1))}
            disabled={page >= meta.total_pages}
            className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default WebsiteSubscription;
