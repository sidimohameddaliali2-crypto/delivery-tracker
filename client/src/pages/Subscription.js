import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Users, TrendingUp, Calendar, Download, Search, RefreshCw, Package, Gift } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../utils/api';

const MACRO_PLAN_MAP = [
  { C: 70,  P: 60,  F: 31,  plan: 'Lean 2 Meal' },
  { C: 115, P: 90,  F: 42,  plan: 'Lean 3 Meal' },
  { C: 130, P: 80,  F: 40,  plan: 'Thrive 2 Meal' },
  { C: 180, P: 120, F: 67,  plan: 'Thrive 3 Meal' },
  { C: 180, P: 100, F: 66,  plan: 'Perform 2 Meal' },
  { C: 225, P: 150, F: 100, plan: 'Perform 3 Meal' },
];
function getMealPlanFromMacros(C, P, F) {
  const c = Math.round(Number(C) || 0);
  const p = Math.round(Number(P) || 0);
  const f = Math.round(Number(F) || 0);
  if (!c && !p && !f) return null;
  const match = MACRO_PLAN_MAP.find(m => m.C === c && m.P === p && m.F === f);
  return match ? match.plan : 'Customized';
}

const planColors = {
  'Lean 2 Meal':    'bg-sky-100 text-sky-700',
  'Lean 3 Meal':    'bg-sky-100 text-sky-700',
  'Thrive 2 Meal':  'bg-teal-100 text-teal-700',
  'Thrive 3 Meal':  'bg-teal-100 text-teal-700',
  'Perform 2 Meal': 'bg-indigo-100 text-indigo-700',
  'Perform 3 Meal': 'bg-indigo-100 text-indigo-700',
  'Customized':     'bg-orange-100 text-orange-700',
  'Standard':       'bg-gray-100 text-gray-600',
};

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const Subscription = () => {
  const [customers, setCustomers] = useState([]);
  const [deliveryCountMap, setDeliveryCountMap] = useState({});
  const [allTimeCountMap, setAllTimeCountMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);   end.setHours(23, 59, 59, 999);

      const allTimeEnd = new Date(); allTimeEnd.setHours(23, 59, 59, 999);
      const allTimeStart = new Date('2020-01-01T00:00:00.000Z');

      const [custRes, delivRes, allTimeRes] = await Promise.all([
        api.get('/customers', { params: { limit: 10000 } }),
        api.get('/deliveries', {
          params: {
            dateFrom: start.toISOString(),
            dateTo: end.toISOString(),
            limit: 10000,
          }
        }),
        api.get('/deliveries', {
          params: {
            dateFrom: allTimeStart.toISOString(),
            dateTo: allTimeEnd.toISOString(),
            limit: 50000,
          }
        }),
      ]);

      const dbCustomers = custRes.data?.data || [];
      const allDeliveries = delivRes.data?.data?.deliveries || [];
      const allTimeDeliveries = allTimeRes.data?.data?.deliveries || [];

      // Count today's deliveries per customer — skip cancelled
      const countMap = {};
      allDeliveries.forEach(d => {
        if (d.status === 'cancelled') return;
        const id = d.customerId || d.customerID;
        if (id) countMap[id] = (countMap[id] || 0) + 1;
      });

      // Count all-time deliveries per customer — skip cancelled (for compensation calculation)
      const totalMap = {};
      allTimeDeliveries.forEach(d => {
        if (d.status === 'cancelled') return;
        const id = d.customerId || d.customerID;
        if (id) totalMap[id] = (totalMap[id] || 0) + 1;
      });

      setCustomers(dbCustomers);
      setDeliveryCountMap(countMap);
      setAllTimeCountMap(totalMap);
    } catch (err) {
      console.error('Subscription fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build enriched rows
  const rows = customers.map(c => {
    const amountPaid = parseFloat(String(c.amountPaid || '0').replace(/,/g, '')) || 0;
    const cycleDuration = Number(c.cycleDuration) || 0;
    const dailyRate = cycleDuration > 0 ? amountPaid / cycleDuration : 0;
    const deliveriesOnDay = deliveryCountMap[c.customerId] || 0;
    const revenueToday = dailyRate * deliveriesOnDay;
    const totalDeliveries = allTimeCountMap[c.customerId] || 0;
    const compensationDays = cycleDuration > 0 ? Math.max(0, totalDeliveries - cycleDuration) : 0;
    const plan = getMealPlanFromMacros(c.macros?.C, c.macros?.P, c.macros?.F) || c.mealPlan || 'Standard';
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.customerId;
    return { ...c, fullName, amountPaid, cycleDuration, dailyRate, deliveriesOnDay, revenueToday, totalDeliveries, compensationDays, plan };
  });

  // Filter
  const uniquePlans = [...new Set(rows.map(r => r.plan).filter(Boolean))].sort();
  const filtered = rows.filter(r => {
    if (planFilter !== 'all' && r.plan !== planFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return r.fullName.toLowerCase().includes(q) || r.customerId?.toLowerCase().includes(q);
    }
    return true;
  });

  // Active customers: plan end date is today or in the future
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const activeCustomers = rows.filter(r => {
    if (!r.planStartDate || !r.cycleDuration) return false;
    const endDate = new Date(new Date(r.planStartDate).getTime() + r.cycleDuration * 86400000);
    return endDate >= todayMidnight;
  });

  // KPI stats — always computed from full unfiltered rows so search/filter don't change card values
  const deliveredTodayRows = rows.filter(r => r.deliveriesOnDay > 0);
  const totalRevenueToday = deliveredTodayRows.reduce((s, r) => s + r.revenueToday, 0);
  const totalSubscriptionValue = rows.filter(r => r.amountPaid > 0).reduce((s, r) => s + r.amountPaid, 0);
  const allWithPlan = rows.filter(r => r.amountPaid > 0 && r.cycleDuration > 0);
  const avgDailyRate = allWithPlan.length > 0
    ? allWithPlan.reduce((s, r) => s + r.dailyRate, 0) / allWithPlan.length
    : 0;

  // For display in table footer
  const activeToday = filtered.filter(r => r.deliveriesOnDay > 0);

  // Compensation summary
  const customersWithCompensation = rows.filter(r => r.compensationDays > 0);
  const totalCompensationDays = rows.reduce((s, r) => s + r.compensationDays, 0);

  // Plan breakdown
  const planBreakdown = {};
  rows.forEach(r => {
    if (!planBreakdown[r.plan]) planBreakdown[r.plan] = { count: 0, revenue: 0 };
    planBreakdown[r.plan].count++;
    planBreakdown[r.plan].revenue += r.amountPaid;
  });

  const exportExcel = () => {
    if (!activeToday.length) { alert('No deliveries on this date.'); return; }
    const sheetData = [
      ['Subscription Report'],
      [`Date: ${selectedDate}`],
      [`Generated: ${new Date().toLocaleDateString()}`],
      [],
      ['#', 'Customer Name', 'Meal Plan', 'Deliveries Today', 'Cycle Duration', 'Total Deliveries', 'Amount Paid (AED)', 'Daily Rate (AED)', 'Compensation Days', 'Revenue Today (AED)'],
    ];
    activeToday.forEach((r, i) => sheetData.push([
      i + 1, r.fullName, r.plan, r.deliveriesOnDay,
      r.cycleDuration || '—',
      r.totalDeliveries || 0,
      r.amountPaid ? r.amountPaid.toFixed(2) : '—',
      r.dailyRate ? r.dailyRate.toFixed(2) : '—',
      r.compensationDays || 0,
      r.revenueToday.toFixed(2),
    ]));
    sheetData.push([]);
    sheetData.push(['', 'TOTAL', '', activeToday.reduce((s, r) => s + r.deliveriesOnDay, 0), '', '', '', '', activeToday.reduce((s, r) => s + r.compensationDays, 0), totalRevenueToday.toFixed(2)]);
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [5, 28, 16, 16, 16, 16, 22, 18, 18, 22].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subscription');
    const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `subscription-${selectedDate}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Daily revenue and subscription overview</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Revenue Today"
          value={`AED ${totalRevenueToday.toFixed(0)}`}
          sub={`${activeToday.length} customer${activeToday.length !== 1 ? 's' : ''} delivered`}
          color="bg-purple-100 text-purple-600"
        />
        <StatCard
          icon={Users}
          label="Active Customers"
          value={activeCustomers.length}
          sub={`${deliveredTodayRows.length} delivered today`}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Daily Rate"
          value={`AED ${avgDailyRate.toFixed(0)}`}
          sub="per customer"
          color="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          icon={Calendar}
          label="Total Subscriptions"
          value={`AED ${(totalSubscriptionValue / 1000).toFixed(1)}k`}
          sub="combined plan value"
          color="bg-orange-100 text-orange-600"
        />
        <StatCard
          icon={Gift}
          label="Compensation Days"
          value={totalCompensationDays}
          sub={`${customersWithCompensation.length} customer${customersWithCompensation.length !== 1 ? 's' : ''} over limit`}
          color="bg-rose-100 text-rose-600"
        />
      </div>

      {/* Plan Breakdown */}
      {Object.keys(planBreakdown).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Plan Breakdown</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(planBreakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([plan, data]) => (
                <div key={plan} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planColors[plan] || 'bg-gray-100 text-gray-600'}`}>
                    {plan}
                  </span>
                  <span className="text-sm font-bold text-gray-900">{data.count}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">AED {data.revenue.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">All Plans</option>
          {uniquePlans.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <p className="text-xs text-gray-400 ml-auto">
          {deliveredTodayRows.length} delivered today · {filtered.length} shown
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 animate-pulse">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No customers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Today</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cycle</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Deliveries</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Daily Rate</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-rose-600 uppercase">Compensation</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-purple-600 uppercase">Revenue Today</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map((r, i) => (
                  <tr key={r.customerId || i} className={`hover:bg-gray-50 transition ${r.deliveriesOnDay > 0 ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.fullName}</p>
                      <p className="text-xs text-gray-400">{r.customerId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planColors[r.plan] || 'bg-gray-100 text-gray-600'}`}>
                        {r.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.deliveriesOnDay > 0
                        ? <span className="font-bold text-blue-700">{r.deliveriesOnDay}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{r.cycleDuration || '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {r.amountPaid ? `AED ${r.amountPaid.toFixed(0)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {r.totalDeliveries > 0 ? r.totalDeliveries : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {r.dailyRate ? `AED ${r.dailyRate.toFixed(2)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.compensationDays > 0
                        ? <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">+{r.compensationDays} days</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.revenueToday > 0
                        ? <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full font-bold">AED {r.revenueToday.toFixed(2)}</span>
                        : <span className="text-gray-300 text-xs">No delivery</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-center font-bold text-blue-700">
                    {filtered.reduce((s, r) => s + r.deliveriesOnDay, 0)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500 font-semibold">
                    {filtered.reduce((s, r) => s + r.totalDeliveries, 0)}
                  </td>
                  <td />
                  <td className="px-4 py-3 text-center">
                    {filtered.some(r => r.compensationDays > 0) && (
                      <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">
                        +{filtered.reduce((s, r) => s + r.compensationDays, 0)} days
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-3 py-1 bg-purple-600 text-white rounded-full font-bold">
                      AED {filtered.reduce((s, r) => s + r.revenueToday, 0).toFixed(2)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Subscription;
