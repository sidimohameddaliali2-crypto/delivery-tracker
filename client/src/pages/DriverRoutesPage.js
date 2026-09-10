import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DriverRouteMap2GIS from '../components/DriverRouteMap2GIS';
import RouteOptimizationModal from '../components/RouteOptimizationModal';
import { fetchDeliveries } from '../store/slices/deliverySlice';
import { fetchDrivers } from '../store/slices/driverSlice';

// Owner (2026-09-09): "when I click on driver route it should not be a
// window but another page." Driver Routes used to be a modal opened from
// DispatcherDesktop; it's now its own route (/dispatcher/driver-routes) so it
// gets a real URL, a real back button, and isn't fighting a second modal
// (Optimize Routes) for the same overlay space.
const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
};

const DriverRoutesPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { deliveries = [] } = useSelector((state) => state.delivery);
  const { drivers = [] } = useSelector((state) => state.driver);

  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(dateParam || getTomorrowDate());
  const [optimizeOpen, setOptimizeOpen] = useState(false);

  const refresh = () => {
    const start = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dispatch(fetchDeliveries({
      dateRange: 'custom',
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      limit: 1000
    }));
  };

  useEffect(() => {
    refresh();
    dispatch(fetchDrivers({ includeInactive: false }));
  }, [dispatch, selectedDate]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', selectedDate);
      return next;
    }, { replace: true });
  }, [selectedDate, setSearchParams]);

  return (
    // DriverRouteMap2GIS itself is h-screen in asPage mode (its own scroll
    // regions are self-contained) — no extra height wrapper needed here.
    <>
      <DriverRouteMap2GIS
        asPage
        open
        onClose={() => navigate('/dispatcher')}
        deliveries={deliveries}
        drivers={drivers}
        date={selectedDate}
        onDateChange={setSelectedDate}
        onOptimizeRoutes={() => setOptimizeOpen(true)}
      />
      <RouteOptimizationModal
        open={optimizeOpen}
        onClose={() => setOptimizeOpen(false)}
        deliveries={deliveries}
        drivers={drivers}
        onApplied={() => {
          refresh();
          setOptimizeOpen(false);
        }}
      />
    </>
  );
};

export default DriverRoutesPage;
