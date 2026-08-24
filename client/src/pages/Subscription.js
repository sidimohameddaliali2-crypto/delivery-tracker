import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, Wallet, Users, RefreshCw as RenewIcon } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import { isCycleEnded } from '../utils/subscriptionFormat';

const toISODateLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function TrendPill({ value }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${up ? 'bg-matter-green/25 text-matter-navy' : 'bg-matter-red/10 text-matter-red'}`}>
      <span className="material-symbols-outlined text-[13px]">{up ? 'trending_up' : 'trending_down'}</span>
      {up ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, trend, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-matter-dust/40 shadow-md p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
        <Icon className="w-4 h-4 text-gray-300" />
      </div>
      <p className="font-serif-mgmt text-2xl font-bold text-matter-navy leading-tight">{value}</p>
      <div className="flex items-center gap-2 mt-2">
        <TrendPill value={trend} />
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

const Subscription = () => {
  const [customers, setCustomers] = useState([]);
  const [matterSubscriptions, setMatterSubscriptions] = useState([]);
  const [matterFinancials, setMatterFinancials] = useState([]);
  const [windowDeliveries, setWindowDeliveries] = useState([]);
  const [prevMonthDeliveries, setPrevMonthDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 6); sevenDaysAgo.setHours(0, 0, 0, 0);
      const windowStart = monthStart < sevenDaysAgo ? monthStart : sevenDaysAgo;

      const dayOfMonth = now.getDate();
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthSameDayEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
      prevMonthSameDayEnd.setHours(23, 59, 59, 999);

      // /subscriptions/financials fetches full detail per active subscription
      // (hundreds of calls) to get real amount-paid — noticeably slower than
      // the rest of this fetch, but the plan/amount/cycle data has to come
      // from Matter, not the internal Customer record.
      const [custRes, windowRes, prevMonthRes, matterSubsRes, matterFinRes] = await Promise.all([
        api.get('/customers', { params: { limit: 10000 } }),
        api.get('/deliveries', { params: { dateFrom: windowStart.toISOString(), dateTo: todayEnd.toISOString(), limit: 20000 } }),
        api.get('/deliveries', { params: { dateFrom: prevMonthStart.toISOString(), dateTo: prevMonthSameDayEnd.toISOString(), limit: 20000 } }),
        api.get('/matter/subscriptions/all'),
        api.get('/matter/subscriptions/financials'),
      ]);

      const dbCustomers = custRes.data?.data || [];
      const windowList = windowRes.data?.data?.deliveries || [];
      const prevMonthList = prevMonthRes.data?.data?.deliveries || [];

      setCustomers(dbCustomers);
      setWindowDeliveries(windowList);
      setPrevMonthDeliveries(prevMonthList);
      setMatterSubscriptions(matterSubsRes.data?.data || []);
      setMatterFinancials(matterFinRes.data?.data || []);
    } catch (err) {
      console.error('Subscription fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Plan/amount-paid/cycle now come from the real Matter subscription data
  // (matched by email) instead of the internal Customer record's own
  // amountPaid/cycleDuration/mealPlan fields, which are often stale or blank.
  const matterByEmail = useMemo(() => {
    const financialsBySubId = new Map(matterFinancials.map((f) => [String(f.subscription_id), f]));
    const map = new Map();
    matterSubscriptions.forEach((s) => {
      const email = String(s.email || '').trim().toLowerCase();
      if (!email) return;
      const financial = financialsBySubId.get(String(s.subscription_id));
      const cycleDuration = s.starting_date && s.cycle_end_date
        ? Math.max(0, Math.round((new Date(s.cycle_end_date) - new Date(s.starting_date)) / 86400000) + 1)
        : 0;
      map.set(email, {
        plan: s.plan?.name || 'Standard',
        startingDate: s.starting_date || null,
        cycleEndDate: s.cycle_end_date || null,
        cycleDuration,
        subscriptionStatus: s.subscription_status,
        amountPaid: financial?.gross_paid ?? null
      });
    });
    return map;
  }, [matterSubscriptions, matterFinancials]);

  // Per-customer daily rate lookup
  const dailyRateMap = useMemo(() => {
    const map = {};
    customers.forEach((c) => {
      const sub = matterByEmail.get(String(c.email || '').trim().toLowerCase());
      const amountPaid = sub?.amountPaid || 0;
      const cycleDuration = sub?.cycleDuration || 0;
      map[c.customerId] = cycleDuration > 0 ? amountPaid / cycleDuration : 0;
    });
    return map;
  }, [customers, matterByEmail]);

  // dayKey -> revenue / orders, built from windowDeliveries (skips cancelled)
  const perDayStats = useMemo(() => {
    const stats = {};
    windowDeliveries.forEach((d) => {
      if (d.status === 'cancelled') return;
      const id = d.customerId || d.customerID;
      if (!id) return;
      const dayKey = toISODateLocal(new Date(d.scheduledTime));
      if (!stats[dayKey]) stats[dayKey] = { revenue: 0, orders: 0 };
      stats[dayKey].revenue += dailyRateMap[id] || 0;
      stats[dayKey].orders += 1;
    });
    return stats;
  }, [windowDeliveries, dailyRateMap]);

  const prevMonthRevenue = useMemo(() => {
    let total = 0;
    prevMonthDeliveries.forEach((d) => {
      if (d.status === 'cancelled') return;
      const id = d.customerId || d.customerID;
      if (id) total += dailyRateMap[id] || 0;
    });
    return total;
  }, [prevMonthDeliveries, dailyRateMap]);

  const now = new Date();
  const todayKey = toISODateLocal(now);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = toISODateLocal(yesterday);
  const monthStartKey = toISODateLocal(new Date(now.getFullYear(), now.getMonth(), 1));

  const salesToday = perDayStats[todayKey]?.revenue || 0;
  const ordersToday = perDayStats[todayKey]?.orders || 0;
  const salesYesterday = perDayStats[yesterdayKey]?.revenue || 0;
  const salesTodayTrend = salesYesterday > 0 ? ((salesToday - salesYesterday) / salesYesterday) * 100 : null;

  const mtdRevenue = Object.entries(perDayStats)
    .filter(([day]) => day >= monthStartKey && day <= todayKey)
    .reduce((sum, [, v]) => sum + v.revenue, 0);
  const mtdTrend = prevMonthRevenue > 0 ? ((mtdRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : null;

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = toISODateLocal(d);
      days.push({
        label: DAY_LABELS[d.getDay()],
        revenue: Math.round((perDayStats[key]?.revenue || 0) * 100) / 100,
        orders: perDayStats[key]?.orders || 0,
      });
    }
    return days;
  }, [perDayStats, now]);

  const ordersThisWeek = last7Days.reduce((s, d) => s + d.orders, 0);
  const weekRevenueFirstHalf = last7Days.slice(0, 4).reduce((s, d) => s + d.revenue, 0);
  const weekRevenueSecondHalf = last7Days.slice(4).reduce((s, d) => s + d.revenue, 0);
  const weekRevenueTrend = weekRevenueFirstHalf > 0 ? ((weekRevenueSecondHalf - weekRevenueFirstHalf) / weekRevenueFirstHalf) * 100 : null;

  // Build enriched customer rows (for filters/table + plan breakdown).
  // Only customers with a matching real Matter subscription (by email) are
  // included — without one there's no real plan/amount/cycle data to show.
  const sevenDaysAgoKey = last7Days.length ? toISODateLocal(new Date(new Date(now).setDate(now.getDate() - 6))) : todayKey;
  const rows = customers.map(c => {
    const sub = matterByEmail.get(String(c.email || '').trim().toLowerCase());
    if (!sub) return null;
    const amountPaid = sub.amountPaid || 0;
    const plan = sub.plan;
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.customerId;
    const isNewThisWeek = sub.startingDate ? sub.startingDate >= sevenDaysAgoKey : false;
    const isActiveSubscription = sub.subscriptionStatus === 'active' && !isCycleEnded(sub.cycleEndDate);
    return { ...c, fullName, amountPaid, plan, isNewThisWeek, isActiveSubscription };
  }).filter(Boolean);

  const activeCustomers = rows.filter(r => r.isActiveSubscription);
  const newThisWeekCount = rows.filter(r => r.isNewThisWeek).length;

  // Renewal Rate = active-and-mid-cycle / (active-and-mid-cycle + cycle-ended).
  // Matches the "Active" vs "Cycle ended" split used on the Customer
  // Management page (same subscription_status + cycle_end_date fields).
  const renewalActiveCount = matterSubscriptions.filter((s) => s.subscription_status === 'active' && !isCycleEnded(s.cycle_end_date)).length;
  const renewalCycleEndedCount = matterSubscriptions.filter((s) => isCycleEnded(s.cycle_end_date)).length;
  const renewalRate = (renewalActiveCount + renewalCycleEndedCount) > 0
    ? (renewalActiveCount / (renewalActiveCount + renewalCycleEndedCount)) * 100
    : null;

  const planBreakdown = {};
  activeCustomers.forEach(r => {
    if (!planBreakdown[r.plan]) planBreakdown[r.plan] = { count: 0, revenue: 0 };
    planBreakdown[r.plan].count++;
    planBreakdown[r.plan].revenue += r.amountPaid;
  });
  const planPerformance = Object.entries(planBreakdown)
    .map(([plan, data]) => ({ plan, ...data }))
    .sort((a, b) => b.revenue - a.revenue);
  const planRevenueTotal = planPerformance.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="customer-mgmt min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-6 border-b border-black/10">
        <div>
          <h1 className="font-serif-mgmt text-3xl font-bold text-matter-navy">Subscription & Sales Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">How the plans are selling and what they are earning.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <RenewIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Sales Today" value={`AED ${salesToday.toFixed(0)}`} trend={salesTodayTrend} sub={`${ordersToday} order${ordersToday !== 1 ? 's' : ''}`} />
        <KpiCard icon={Wallet} label="Total Earnings (MTD)" value={`AED ${mtdRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} trend={mtdTrend} sub="vs same period last month" />
        <KpiCard icon={Users} label="Active Subscriptions" value={activeCustomers.length} trend={null} sub={`+${newThisWeekCount} this week`} />
        <KpiCard icon={RenewIcon} label="Renewal Rate" value={renewalRate !== null ? `${renewalRate.toFixed(0)}%` : '—'} trend={null} sub={`${renewalActiveCount} of ${renewalActiveCount + renewalCycleEndedCount}`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-matter-dust/40 shadow-md p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Daily Sales</p>
              <p className="font-serif-mgmt text-lg font-bold text-matter-navy">Last 7 days</p>
            </div>
            <TrendPill value={weekRevenueTrend} />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={last7Days} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip formatter={(v) => [`AED ${Number(v).toFixed(0)}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#4d9eff" strokeWidth={2} fill="#4d9eff" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-matter-dust/40 shadow-md p-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Orders Per Day</p>
          <p className="font-serif-mgmt text-lg font-bold text-matter-navy mb-4">{ordersThisWeek} this week</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={last7Days} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, 'Orders']} />
              <Bar dataKey="orders" fill="#bcf679" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Meal Plan Performance */}
      {planPerformance.length > 0 && (
        <div className="bg-white rounded-2xl border border-matter-dust/40 shadow-md p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Meal Plan Performance</p>
              <p className="font-serif-mgmt text-lg font-bold text-matter-navy">Which plans drive the revenue</p>
            </div>
            <p className="text-sm text-gray-500">Total AED {planRevenueTotal.toLocaleString()} combined plan value</p>
          </div>
          <div className="space-y-3">
            {planPerformance.map((p) => {
              const pct = planRevenueTotal > 0 ? Math.round((p.revenue / planRevenueTotal) * 100) : 0;
              return (
                <div key={p.plan} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div>
                      <p className="font-serif-mgmt font-bold text-matter-navy">{p.plan}</p>
                      <p className="text-xs text-gray-400">{p.count} active subscriber{p.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-serif-mgmt font-bold text-matter-navy">AED {p.revenue.toLocaleString()}</p>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-matter-sky rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}% of total plan value</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default Subscription;
