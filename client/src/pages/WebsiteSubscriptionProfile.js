import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Mail, Phone, MessageCircle, MapPin, Truck, Package,
  Utensils, ShoppingBag, Flame, Calendar, PauseCircle, Wallet, CreditCard,
  Clock, User, Receipt, CheckCircle2, Tag, ChevronDown,
} from 'lucide-react';
import api from '../utils/api';
import DeliveryCalendar from '../components/DeliveryCalendar';
import { Card, Field, StatTile, StatusBadge, CycleEndBadge, matchLabels, statusColors } from '../components/subscriptionUi';
import { formatDate, formatMoney, isCycleEnded } from '../utils/subscriptionFormat';

function MacroBar({ label, grams, max, color }) {
  const pct = max > 0 ? Math.round(((grams || 0) / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className="font-medium text-gray-700">{grams !== undefined ? `${grams} g` : '—'}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const WebsiteSubscriptionProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [match, setMatch] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [mealProfile, setMealProfile] = useState(null);
  const [mealLoading, setMealLoading] = useState(false);
  const [mealError, setMealError] = useState('');

  const loadProfile = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    setInvoice(null);
    setInvoiceError('');
    api.get(`/matter/subscriptions/${id}`)
      .then((res) => {
        if (!mounted) return;
        setProfile(res.data?.data?.data || null);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('Failed to load subscription profile:', err);
        setError(err.response?.data?.message || 'Failed to load this subscription.');
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => loadProfile(), [loadProfile]);

  useEffect(() => {
    if (!profile) return;
    let mounted = true;
    setMatchLoading(true);
    api.get('/customers/match', { params: { email: profile.email, phone: profile.phone, name: profile.name } })
      .then((res) => { if (mounted) setMatch(res.data?.data || null); })
      .catch((err) => {
        console.error('Customer match failed:', err);
        if (mounted) setMatch(null);
      })
      .finally(() => mounted && setMatchLoading(false));
    return () => { mounted = false; };
  }, [profile]);

  useEffect(() => {
    const customerId = match?.customer?.customerId;
    if (!customerId) {
      setMealProfile(null);
      return;
    }
    let mounted = true;
    setMealLoading(true);
    setMealError('');
    api.get(`/menus/customers/${customerId}/meal-profile`)
      .then((res) => { if (mounted) setMealProfile(res.data?.data || null); })
      .catch((err) => {
        console.error('Failed to load meal selections:', err);
        if (mounted) setMealError('Could not load meal selections.');
      })
      .finally(() => mounted && setMealLoading(false));
    return () => { mounted = false; };
  }, [match]);

  const handleCreateInvoice = async () => {
    setInvoiceLoading(true);
    setInvoiceError('');
    try {
      const res = await api.post(`/xero/invoices/from-subscription/${id}`);
      setInvoice(res.data?.data || null);
    } catch (err) {
      console.error('Failed to create Xero invoice:', err);
      setInvoiceError(err.response?.data?.message || 'Failed to create invoice in Xero.');
    } finally {
      setInvoiceLoading(false);
    }
  };

  // Reconcile website (Matter) exclusions with the matched internal
  // customer's exclusions for display only. Internal-only exclusions are
  // shown as an addition; website-only exclusions are never dropped.
  const websiteExclusions = profile?.exclusions || [];
  const internalExclusionNames = (match?.customer?.mealExclusion || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const websiteTitlesLower = new Set(websiteExclusions.map((ex) => ex.title.toLowerCase()));
  const missingFromWebsite = internalExclusionNames.filter((name) => !websiteTitlesLower.has(name.toLowerCase()));

  const mealsByDate = (mealProfile?.selectedMeals || []).reduce((acc, meal) => {
    const key = meal.date ? String(meal.date).slice(0, 10) : 'Unknown date';
    if (!acc[key]) acc[key] = [];
    acc[key].push(meal);
    return acc;
  }, {});
  const groupedMealDates = Object.entries(mealsByDate).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/website-subscriptions')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Website Subscriptions
        </button>
        <button
          onClick={loadProfile}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && <div className="text-center py-24 text-gray-400 animate-pulse">Loading profile…</div>}
      {!loading && error && <div className="text-center py-24 text-rose-600">{error}</div>}

      {!loading && !error && profile && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-bold flex-shrink-0">
                {initialsOf(profile.name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 truncate">{profile.name}</h1>
                <p className="text-sm text-gray-400">Subscription #{profile.subscription_id} · Customer #{profile.customer_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={profile.subscription_status} />
              {isCycleEnded(profile.cycle_end_date) && <CycleEndBadge cycleEndDate={profile.cycle_end_date} />}
              {profile.plan?.name && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {profile.plan.name}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatTile icon={Truck} label="Total Deliveries" value={profile.total_deliveries} color="bg-blue-100 text-blue-600" />
            <StatTile icon={Package} label="Remaining" value={profile.remaining_deliveries} color="bg-indigo-100 text-indigo-600" />
            <StatTile icon={Utensils} label="Total Meals" value={profile.total_meals} color="bg-orange-100 text-orange-600" />
            <StatTile icon={ShoppingBag} label="Snacks / Day" value={profile.snacks_per_day} color="bg-pink-100 text-pink-600" />
            <StatTile icon={Flame} label="Calories" value={profile.total_calories} sub="kcal / day" color="bg-rose-100 text-rose-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <Card title="Internal Customer Match" icon={User}>
                {matchLoading ? (
                  <p className="text-sm text-gray-400">Checking…</p>
                ) : match?.customer ? (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {match.customer.firstName} {match.customer.lastName}
                      </p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {matchLabels[match.matchedBy] || 'Matched'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <Field label="Internal Customer Id" value={match.customer.customerId} />
                      <Field label="Email" value={match.customer.email} />
                      <Field label="Phone" value={match.customer.phone} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No matching internal customer found (checked email, phone, name).</p>
                )}
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Card title="Contact" icon={Mail}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{profile.email || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      {profile.phone || '—'}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      {profile.whatsapp || '—'}
                    </div>
                  </div>
                </Card>

                <Card title="Delivery Address" icon={MapPin}>
                  {profile.customer_addresses?.length > 0 ? (
                    <div className="space-y-4">
                      {profile.customer_addresses.map((addr) => (
                        <div key={addr.id} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-gray-900">{addr.label || '—'}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${addr.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {addr.status || 'unknown'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Type" value={addr.type} />
                            <Field label="Emirate" value={addr.emirate} />
                            <Field label="Area" value={addr.area} />
                            <Field label="Building" value={addr.building} />
                            <Field label="Unit" value={addr.unit} />
                            <Field label="Floor" value={addr.floor} />
                          </div>
                          {addr.coordinates?.lat && addr.coordinates?.lng && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs text-gray-400 mb-1">Coordinates</p>
                              <a
                                href={`https://www.google.com/maps?q=${addr.coordinates.lat},${addr.coordinates.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                {addr.coordinates.lat}, {addr.coordinates.lng}
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No address on file.</p>
                  )}
                </Card>
              </div>

              <Card title="Nutrition" icon={Flame}>
                <div className="space-y-3">
                  <MacroBar label="Protein" grams={profile.macros?.protein} max={Math.max(profile.macros?.protein || 0, profile.macros?.carbohydrates || 0, profile.macros?.fat || 0, 1)} color="bg-rose-400" />
                  <MacroBar label="Carbohydrates" grams={profile.macros?.carbohydrates} max={Math.max(profile.macros?.protein || 0, profile.macros?.carbohydrates || 0, profile.macros?.fat || 0, 1)} color="bg-amber-400" />
                  <MacroBar label="Fat" grams={profile.macros?.fat} max={Math.max(profile.macros?.protein || 0, profile.macros?.carbohydrates || 0, profile.macros?.fat || 0, 1)} color="bg-sky-400" />
                </div>
              </Card>

              <Card title="Meal Selection (from Menu)" icon={Utensils}>
                {!match?.customer ? (
                  <p className="text-sm text-gray-400">No internal customer match — meal selections unavailable.</p>
                ) : mealLoading ? (
                  <p className="text-sm text-gray-400">Loading meal selections…</p>
                ) : mealError ? (
                  <p className="text-sm text-rose-500">{mealError}</p>
                ) : groupedMealDates.length === 0 ? (
                  <p className="text-sm text-gray-400">No meal selections found for this customer.</p>
                ) : (
                  <div className="space-y-2">
                    {groupedMealDates.map(([date, meals]) => (
                      <details key={date} className="group border border-gray-100 rounded-lg">
                        <summary className="cursor-pointer list-none flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                          <span className="text-xs font-semibold text-gray-600">{formatDate(date)}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400">{meals.length} meal{meals.length !== 1 ? 's' : ''}</span>
                            <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-1.5">
                          {meals.map((meal, idx) => (
                            <div key={`${date}-${idx}`} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{meal.mealName}</p>
                                <p className="text-xs text-gray-400 capitalize truncate">
                                  {meal.mealType}
                                  {meal.proteinChoice ? ` · ${meal.proteinChoice}` : ''}
                                  {meal.carbChoice ? ` · ${meal.carbChoice}` : ''}
                                </p>
                              </div>
                              {meal.quantity > 1 && (
                                <span className="text-xs font-semibold text-gray-500 flex-shrink-0 ml-2">×{meal.quantity}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Schedule" icon={Calendar}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Starting Date" value={formatDate(profile.starting_date)} />
                  <Field label="Cycle Start" value={formatDate(profile.cycle_start_date)} />
                  <Field label="Cycle End" value={formatDate(profile.cycle_end_date)} />
                  <Field label="Next Delivery" value={formatDate(profile.next_delivery_date)} />
                  <Field label="Renewal Eligible" value={profile.renewal_eligible ? 'Yes' : 'No'} />
                  <Field label="Renewal Due" value={formatDate(profile.renewal_due_date)} />
                </div>
              </Card>

              <Card title="Pauses" icon={PauseCircle}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Paused Days" value={profile.pauses?.paused_days?.length ? profile.pauses.paused_days.join(', ') : 'None'} />
                  <Field label="Resumed Days" value={profile.pauses?.resumed_days?.length ? profile.pauses.resumed_days.join(', ') : 'None'} />
                </div>
              </Card>

              {(websiteExclusions.length > 0 || missingFromWebsite.length > 0) && (
                <Card title="Exclusions" icon={Tag}>
                  <div className="flex flex-wrap gap-2">
                    {websiteExclusions.map((ex) => (
                      <span key={ex.id} className="text-xs px-2 py-1 bg-rose-50 text-rose-600 rounded-full">{ex.title}</span>
                    ))}
                    {missingFromWebsite.map((name) => (
                      <span
                        key={`internal-${name}`}
                        title="In the internal customer record but not yet reflected on the website subscription"
                        className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-full border border-dashed border-amber-300"
                      >
                        {name} (from Customer page)
                      </span>
                    ))}
                  </div>
                  {missingFromWebsite.length > 0 && (
                    <p className="text-xs text-gray-400 mt-2">
                      Dashed chips are exclusions found on the internal Customer page but not yet on the website subscription.
                    </p>
                  )}
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Pricing" icon={Wallet}>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Base Price" value={formatMoney(profile.base_price, profile.currency)} />
                  <Field label="Bag Price" value={formatMoney(profile.bag_price, profile.currency)} />
                  <Field label="Discount" value={profile.discount?.amount ? `${profile.discount.amount}${profile.discount.type || ''} (${profile.discount.code || '—'})` : '—'} />
                  <Field label="VAT" value={`${formatMoney(profile.vat, profile.currency)} (${profile.vat_percentage ?? 0}%)`} />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Gross Paid</p>
                  <p className="text-2xl font-bold text-gray-900">{formatMoney(profile.gross_paid, profile.currency)}</p>
                </div>

                <div className="mt-4">
                  {invoice ? (
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg px-3 py-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        Invoice {invoice.InvoiceNumber} created in Xero
                        {invoice.InvoiceID && (
                          <>
                            {' · '}
                            <a
                              href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.InvoiceID}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline font-medium"
                            >
                              View in Xero
                            </a>
                          </>
                        )}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateInvoice}
                      disabled={invoiceLoading}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
                    >
                      <Receipt className={`w-4 h-4 ${invoiceLoading ? 'animate-pulse' : ''}`} />
                      {invoiceLoading ? 'Creating invoice…' : 'Create Xero Invoice'}
                    </button>
                  )}
                  {invoiceError && <p className="text-xs text-rose-600 mt-2">{invoiceError}</p>}
                </div>
              </Card>

              {profile.payments?.length > 0 && (
                <Card title="Payments" icon={CreditCard}>
                  <div className="space-y-2">
                    {profile.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{formatMoney(p.amount, p.currency)}</p>
                          <p className="text-xs text-gray-400 truncate">{p.method} · {formatDate(p.date)} · txn {p.transaction_id}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Delivery Window" icon={Clock}>
                <Field label="Window" value={profile.delivery_window ? `${profile.delivery_window.label} (${profile.delivery_window.timezone})` : '—'} />
              </Card>
            </div>
          </div>

          <Card title="Delivery Calendar" icon={Calendar}>
            <DeliveryCalendar
              cycleStartDate={profile.cycle_start_date}
              pauses={profile.pauses}
              deliverySchedule={profile.delivery_schedule}
              customerId={match?.customer?.customerId}
            />
          </Card>

          <p className="text-xs text-gray-300 text-center">Last updated {formatDate(profile.updated_at)}</p>
        </>
      )}
    </div>
  );
};

export default WebsiteSubscriptionProfile;
