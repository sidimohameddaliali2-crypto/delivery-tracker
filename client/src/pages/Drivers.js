import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Grid } from 'react-window';
import { Phone, Star } from 'lucide-react';
import { fetchDrivers, toggleDriverStatus } from '../store/slices/driverSlice';
import UserAvatar from '../components/users/UserAvatar';

const STATUS_META = {
  available: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  busy: { label: 'Busy', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  offline: { label: 'Offline', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.offline;

const VEHICLE_TYPE_META = {
  bike: { label: 'Bike', icon: 'two_wheeler' },
  van: { label: 'Van', icon: 'airport_shuttle' },
  car: { label: 'Car', icon: 'directions_car' },
};

const getKpiColor = (score) => {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
};

const isOnVacation = (driver) => {
  const v = driver?.profile?.vacation;
  if (!v?.currentStart || !v?.currentEnd) return false;
  const today = new Date();
  return new Date(v.currentStart) <= today && today <= new Date(v.currentEnd);
};

// A driver is flagged for review when performance is poor, regardless of their
// available/busy/offline status — mirrors the mockup's amber "warning" card state
// using real KPI/complaint data instead of an invented status.
const needsReview = (driver) => {
  const score = driver?.kpi?.score || 0;
  const complaints = driver?.kpi?.complaintsCount || 0;
  return score > 0 && score < 70 || complaints >= 3;
};

// Virtualized Driver Grid Component for large lists
const VirtualizedDriverGrid = memo(({ drivers, onToggleStatus }) => {
  const columnCount = 3; // xl:grid-cols-3
  const rowCount = Math.ceil(drivers.length / columnCount);
  const cardWidth = 350; // approximate card width
  const cardHeight = 420; // approximate card height
  const gap = 24; // gap-6

  const Cell = useCallback(({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex;
    if (index >= drivers.length) return null;

    const driver = drivers[index];
    return (
      <div style={{ ...style, padding: gap / 2 }}>
        <DriverCard
          driver={driver}
          index={index}
          onToggleStatus={onToggleStatus}
        />
      </div>
    );
  }, [drivers, onToggleStatus]);

  return (
    <Grid
      columnCount={columnCount}
      columnWidth={cardWidth + gap}
      height={600}
      rowCount={rowCount}
      rowHeight={cardHeight + gap}
      width={1400}
      className="mx-auto"
    >
      {Cell}
    </Grid>
  );
});

const Drivers = () => {
  const dispatch = useDispatch();
  const { drivers, isLoading, error } = useSelector(state => state.driver);

  // Extract drivers array from response - handle both array and object responses
  const driversArray = Array.isArray(drivers)
    ? drivers
    : (drivers?.data || drivers?.drivers || []);

  useEffect(() => {
    dispatch(fetchDrivers());
  }, [dispatch]);

  const [search, setSearch] = useState('');

  const activeDriverCount = useMemo(
    () => driversArray.filter((d) => d?.isActive !== false).length,
    [driversArray]
  );

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return driversArray;
    return driversArray.filter((d) => {
      const name = `${d?.profile?.firstName || ''} ${d?.profile?.lastName || ''}`.toLowerCase();
      const phone = (d?.profile?.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [driversArray, search]);

  const handleToggleStatus = useCallback((driverId, currentStatus) => {
    const isActive = !currentStatus;
    dispatch(toggleDriverStatus({ id: driverId, isActive }));
  }, [dispatch]);

  if (isLoading && driversArray.length === 0) {
    return (
      <div className="matter-analytics flex items-center justify-center h-64 text-gray-500">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        Loading drivers...
      </div>
    );
  }

  return (
    <div className="matter-analytics p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Fleet Management</h1>
        <Link
          to="/drivers/create"
          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Driver
        </Link>
      </div>

      {/* Search + Total Active Drivers */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drivers by name or phone…"
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl px-5 py-3.5 min-w-[190px]">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide mb-1">Total Active Drivers</p>
          <p className="text-3xl font-bold text-gray-900 leading-tight">{activeDriverCount}</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Drivers Grid */}
      {filteredDrivers.length > 50 ? (
        <VirtualizedDriverGrid
          drivers={filteredDrivers}
          onToggleStatus={handleToggleStatus}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {filteredDrivers.map((driver, index) => (
            <DriverCard
              key={driver._id}
              driver={driver}
              index={index}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </motion.div>
      )}

      {filteredDrivers.length === 0 && driversArray.length > 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">No drivers match your search</div>
        </div>
      )}

      {filteredDrivers.length === 0 && driversArray.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">No drivers yet</div>
          <div className="text-gray-500 mt-2">Create your first driver to get started</div>
          <Link
            to="/drivers/create"
            className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90"
          >
            Create Driver
          </Link>
        </div>
      )}
    </div>
  );
};

// Driver Card Component
const DriverCard = memo(({ driver, index, onToggleStatus }) => {
  const driverData = useMemo(() => ({
    firstName: driver?.profile?.firstName || 'Unknown',
    lastName: driver?.profile?.lastName || 'Driver',
    phone: driver?.profile?.phone || 'No phone',
    status: driver?.profile?.status || 'offline',
    deliveriesCount: driver?.deliveriesCount || 0,
    avgLateTime: driver?.kpi?.avgLateTime || 0,
    kpiScore: driver?.kpi?.score || 0,
    complaintsCount: driver?.kpi?.complaintsCount || 0,
    isActive: driver?.isActive !== false,
    vacation: driver?.profile?.vacation || {}
  }), [driver]);

  const { firstName, lastName, phone, status, deliveriesCount, avgLateTime,
          kpiScore, complaintsCount, isActive, vacation } = driverData;

  const onVacation = isOnVacation(driver);
  const flagged = needsReview(driver);
  const statusMeta = getStatusMeta(status);
  const vehicleMeta = VEHICLE_TYPE_META[driver?.profile?.vehicleType];

  const topBarCls = !isActive
    ? 'bg-gray-300'
    : flagged || onVacation
      ? 'bg-amber-400'
      : 'bg-emerald-500';

  const handleToggle = useCallback(() => {
    onToggleStatus(driver._id, isActive);
  }, [onToggleStatus, driver._id, isActive]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.05 }}
      className={`group bg-white rounded-xl border overflow-hidden relative flex flex-col ${!isActive ? 'opacity-75' : ''} ${flagged ? 'border-amber-300' : 'border-gray-200'}`}
    >
      <div className={`absolute top-0 left-0 w-full h-1 ${topBarCls}`} />

      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar
              user={driver}
              sizePx={48}
              showStatus
              fallbackName={`${firstName} ${lastName}`}
              fallbackEmail={driver?.email || `${firstName}.${lastName}@drivers.local`}
              className="shadow-sm flex-shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{firstName} {lastName}</h3>
                {vehicleMeta && (
                  <span
                    title={vehicleMeta.label}
                    className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium"
                  >
                    <span className="material-symbols-outlined text-[13px] leading-none">{vehicleMeta.icon}</span>
                    {vehicleMeta.label}
                  </span>
                )}
              </div>
              <div className="flex items-center text-sm text-gray-500 gap-1">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{phone}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase border ${isActive ? statusMeta.cls : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {isActive ? statusMeta.label : 'Inactive'}
            </span>
            {flagged && isActive && (
              <span className="px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span> Review
              </span>
            )}
            {onVacation && (
              <span className="px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500 text-white">
                On Vacation
              </span>
            )}
          </div>
        </div>

        <div className={`grid grid-cols-2 gap-y-3 gap-x-2 rounded-lg p-3 border ${flagged ? 'bg-amber-50/50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">Total Deliveries</p>
            <p className="text-sm font-semibold text-gray-900">{deliveriesCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">KPI Score</p>
            <p className={`text-sm font-semibold flex items-center gap-1 ${getKpiColor(kpiScore)}`}>
              {kpiScore} <Star className="w-3.5 h-3.5 fill-current" />
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">Avg Late Time</p>
            <p className="text-sm font-medium text-gray-900">{avgLateTime}m</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">Complaints</p>
            <p className={`text-sm font-medium ${complaintsCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{complaintsCount}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] text-gray-500 mb-0.5">Vacation Days</p>
            <p className="text-sm font-medium text-gray-900">{vacation.usedDays || 0}/{vacation.allowanceDays ?? 30} Days Used</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggle}
            className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">block</span>
            {isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
        <Link
          to={`/drivers/${driver._id}`}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
            flagged ? 'bg-amber-500 text-white hover:opacity-90' : 'bg-blue-600 text-white hover:opacity-90'
          }`}
        >
          {flagged ? 'Intervene' : 'View Profile'}
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </div>
    </motion.div>
  );
});

export default Drivers;
