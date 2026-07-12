import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Package, 
  ShoppingBag, 
  Clock, 
  Users, 
  AlertTriangle, 
  Target,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { fetchDashboardData, fetchDeliveries } from '../store/slices/deliverySlice';
import { fetchDrivers } from '../store/slices/driverSlice';
import { fetchBags } from '../store/slices/bagSlice';
import KPICard from '../components/dashboard/KPICard';
import DriverAvailability from '../components/dashboard/DriverAvailability';
import LateDeliveriesDashboard from '../components/dashboard/LateDeliveriesDashboardGrid';

import DriverMap from '../components/DriverMap';


const Dashboard = () => {
  const dispatch = useDispatch();
  const { dashboardData, isLoading } = useSelector(state => state.delivery);
  const [dateRange, setDateRange] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showKPIValues, setShowKPIValues] = useState(false);
  const { drivers } = useSelector(state => state.driver);
  const { deliveries = [] } = useSelector(state => state.delivery || {});
  const { bags: bagInventory = [] } = useSelector(state => state.bag || {});
  const navigate = useNavigate();

  // Debug logging for Dashboard data
  console.log('=== Dashboard Debug Information ===');
  console.log('Dashboard Redux State:', {
    dashboardData,
    deliveriesFromRedux: deliveries,
    deliveriesCount: deliveries?.length || 0,
    isLoadingDashboard: isLoading,
    driversCount: drivers?.length || 0
  });

  // Optimized useEffect for KPI data only - no page reload
  useEffect(() => {
    console.log('Dashboard useEffect - fetching dashboard data for KPI cards only:', dateRange);
    
    // Use a smooth transition without showing loading state
    const fetchKPIData = async () => {
      setIsRefreshing(true);
      try {
        await dispatch(fetchDashboardData(dateRange));
      } catch (error) {
        console.error('Error fetching KPI data:', error);
      } finally {
        // Add a small delay to show the smooth transition
        setTimeout(() => setIsRefreshing(false), 500);
      }
    };
    
    fetchKPIData();
  }, [dispatch, dateRange]);

  // Separate useEffect for deliveries and charts - only runs once
  useEffect(() => {
    console.log('Dashboard initial mount - fetching all deliveries and drivers for analytics');
    
    const fetchAnalyticsData = async () => {
      try {
        await Promise.all([
          dispatch(fetchDeliveries({ dateRange: 'all', limit: 5000 })),
          dispatch(fetchDrivers()),
          dispatch(fetchBags({ page: 1, limit: 500 }))
        ]);
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      }
    };
    
    fetchAnalyticsData();
  }, [dispatch]); // No dateRange dependency - only runs on mount

  // Additional useEffect to track when deliveries change
  useEffect(() => {
    console.log('=== Deliveries State Change ===');
    console.log('Current deliveries count:', deliveries?.length || 0);
    console.log('First 3 deliveries sample:', deliveries?.slice(0, 3) || []);
    console.log('Deliveries structure check:', {
      isArray: Array.isArray(deliveries),
      hasAddresses: deliveries?.[0]?.address || 'No address found',
      hasLocation: deliveries?.[0]?.location || 'No location found',
      hasEmirate: deliveries?.[0]?.emirate || 'No emirate found',
    });
  }, [deliveries]);

  // Ensure dashboardData exists and has required properties
  const safeDashboardData = dashboardData || {};
  const safeDrivers = Array.isArray(safeDashboardData.drivers) ? safeDashboardData.drivers : [];
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  // Add these functions:


  
   const todaysDeliveries = deliveries.filter(delivery => {
    if (!delivery.scheduledTime) return false;
    const deliveryDate = new Date(delivery.scheduledTime);
    const today = new Date();
    return deliveryDate.toDateString() === today.toDateString();
  });

  const todayDeliveriesCount = safeDashboardData?.todayDeliveries ?? safeDashboardData?.totalDeliveries ?? 0;

const kpiCards = [
    {
      title: 'Today Deliveries',
      value: todayDeliveriesCount,
      icon: Package,
      color: 'blue'
    },
    {
      title: 'Available Bags',
      value: safeDashboardData?.availableBags || 0,
      icon: ShoppingBag,
      color: 'green'
    },
    {
      title: 'Late Deliveries',
      value: safeDashboardData?.lateDeliveries || 0,
      icon: Clock,
      color: 'red'
    },
    {
      title: 'Avg Deliveries per Agent',
      value: safeDashboardData?.avgDeliveriesPerAgent || 0,
      icon: Users,
      color: 'purple'
    },
    {
      title: 'Complaints This Month',
      value: safeDashboardData?.monthlyComplaints || 0,
      icon: AlertTriangle,
      color: 'orange'
    },
    {
      title: 'Accuracy Rate',
      value: `${safeDashboardData?.accuracyRate || 0}%`,
      icon: Target,
      color: 'teal'
    },
    {
      title: 'Avg Late Time',
      value: `${safeDashboardData?.avgLateTime || 0}m`,
      icon: TrendingUp,
      color: 'yellow'
    }
  ];

  // Enhanced KPI cards with loading states
  const enhancedKpiCards = kpiCards.map((card, index) => ({
    ...card,
    isLoading: isRefreshing || (isLoading && dateRange !== 'today') // Show loading during refresh
  }));

  // Don't show full page loading - use subtle indicators instead
  const showPageLoading = isLoading && !dashboardData && dateRange === 'today';

  if (showPageLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          className="flex items-center space-x-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <span className="text-lg font-medium text-gray-700">Loading dashboard...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      {/* Late Deliveries Dashboard */}
      <LateDeliveriesDashboard />
    </div>
  );
};

export default Dashboard;
