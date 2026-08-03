import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingBag,
  Clock,
  BarChart3,
  CreditCard,
  Menu,
  X,
  LogOut,
  MapPin,
  Motorbike,
  ReplaceAll,
  User,
  Calendar,
  AlertTriangle,
  Zap,
  MessageSquare,
  Building2,
  UtensilsCrossed,
  RefreshCw,
  Briefcase,
  FileText
} from 'lucide-react';
import { logout } from '../store/slices/authSlice';
import UserAvatar from './users/UserAvatar';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector(state => state.auth);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard', roles: ['super_admin', 'admin', 'manager', 'dispatcher', 'driver', 'viewer'] },
    { name: 'Drivers', href: '/drivers', icon: Motorbike, permission: 'drivers', roles: ['admin'] },
    { name: 'Deliveries', href: '/deliveries', icon: Package, permission: 'deliveries', roles: ['super_admin', 'admin', 'manager', 'dispatcher', 'driver'] },
    { name: 'Customers', href: '/customers', icon: User, permission: 'customers', roles: ['super_admin', 'admin', 'manager', 'dispatcher'] },
    { name: 'Events', href: '/events', icon: Calendar, permission: 'events', roles: ['super_admin', 'admin', 'dispatcher'] },
    { name: 'Bag Tracking', href: '/bags', icon: ShoppingBag, permission: 'bags', roles: ['super_admin', 'admin', 'manager', 'dispatcher'] },
    { name: 'Late Deliveries', href: '/late-deliveries', icon: Clock, permission: 'late_deliveries', roles: ['super_admin', 'admin', 'manager', 'dispatcher'] },
    { name: 'Complaints', href: '/complaints', icon: AlertTriangle, permission: 'complaints', roles: ['super_admin', 'admin', 'dispatcher'] },
    { name: 'Communication', href: '/communications', icon: MessageSquare, permission: 'communications', roles: ['super_admin', 'admin', 'manager', 'dispatcher'] },
    { name: 'Live Map', href: '/map', icon: MapPin, permission: 'live_map', roles: ['super_admin', 'admin', 'manager', 'dispatcher'] },
    { name: 'Delivery Changes', href: '/delivery-changes', icon: ReplaceAll, permission: 'delivery_changes', roles: ['super_admin', 'admin'] },
    { name: 'Users', href: '/users', icon: Users, permission: 'users', roles: ['super_admin', 'admin'] },
    { name: 'Employees', href: '/employees', icon: Briefcase, permission: 'employees', roles: ['super_admin', 'admin', 'manager'] },
    { name: 'Report', href: '/reports', icon: BarChart3, permission: 'reports', roles: ['super_admin', 'admin', 'manager', 'viewer'] },
    { name: 'Subscription', href: '/subscription', icon: CreditCard, roles: ['super_admin', 'admin', 'manager'] },
    { name: 'Renewal', href: '/renewal', icon: RefreshCw, roles: ['super_admin', 'admin', 'manager'] },
    { name: 'Menus', href: '/menus', icon: Menu, permission: 'menus', roles: ['super_admin', 'admin'] },
    { name: 'Matter Core', href: '/matter-core', icon: FileText, roles: ['super_admin', 'admin'] },
    { name: 'Partners', href: '/admin/partners', icon: Building2, roles: ['super_admin', 'admin', 'kitchen'] },
    { name: 'Kitchen List', href: '/kitchen-list', icon: UtensilsCrossed, roles: ['super_admin', 'admin', 'kitchen'] },
    { name: 'Store Keeper', href: '/store-keeper', icon: ShoppingBag, roles: ['store_keeper'] },
  ];

  // Check if a nav item should be visible for the current user
  const isNavItemVisible = (item) => {
    // Role check
    if (item.roles && !item.roles.includes(user?.role)) return false;
    // Super admin bypasses all permission checks
    if (user?.role === 'super_admin') return true;
    // If the nav item has a permission key, check it
    // Only hide if the permission is explicitly set to false; undefined = not yet set = show
    if (item.permission) {
      return user?.permissions?.[item.permission] !== false;
    }
    return true;
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  // Get current page title
  const getPageTitle = () => {
    const currentNav = navigation.find(
      item => isNavItemVisible(item) && item.href === location.pathname
    );
    if (currentNav) return currentNav.name;
    
    // Handle nested routes
    if (location.pathname.startsWith('/drivers/')) return 'Driver Details';
    if (location.pathname.startsWith('/deliveries/')) return 'Delivery Details';
    if (location.pathname === '/add-delivery') return 'Add Delivery';
    if (location.pathname === '/drivers/create') return 'Create Driver';
    if (location.pathname === '/complaints') return 'Complaints';
    if (location.pathname === '/store-keeper') return 'Store Keeper';
    
    return 'Dashboard';
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black bg-opacity-50"
              onClick={() => setSidebarOpen(false)}
            />
            
            {/* Sidebar */}
            <motion.div
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 z-[1001] w-64 bg-white shadow-xl"
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between flex-shrink-0 px-4 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <div className="flex items-center justify-center text-white font-bold">
                      <img
              className="w-17 h-6"
                          src="/images/matter-logo24-dark.png"
              alt="Matter"
            />
                    </div>
                    
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 rounded-md"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-2">
                  {navigation
                    .filter(item => isNavItemVisible(item))
                    .map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Icon className="w-5 h-5 mr-3" />
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>

                {/* User info in sidebar */}
                <div className="p-4 border-t border-gray-200">
                  <div className="flex items-center space-x-3">
                    <UserAvatar
                      user={user}
                      size="medium"
                      showStatus
                      className="shadow-sm"
                      fallbackName="Current User"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.profile?.firstName} {user?.profile?.lastName}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between flex-shrink-0 px-6 py-4 bg-white border-b border-gray-200">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 rounded-md "
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="ml-4">
              <h1 className="text-2xl font-semibold text-gray-900">
                {getPageTitle()}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Date would go here */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user?.profile?.firstName} {user?.profile?.lastName}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <div className="relative">
                <button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <UserAvatar
                    user={user}
                    size="medium"
                    showStatus
                    className="shadow-sm"
                    fallbackName="Current User"
                  />
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
