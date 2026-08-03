import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store/store';
import { Toaster } from './components/ui/toaster';
import { refreshCurrentUser } from './store/slices/authSlice';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Drivers from './pages/Drivers';
import DriverDetail from './pages/DriverDetail';
import Deliveries from './pages/Deliveries';
import DeliveryDetail from './pages/DeliveryDetail';
import AddDelivery from './pages/AddDelivery';
import BagTracking from './pages/BagTracking';
import LateDeliveries from './pages/LateDeliveries';
import Reports from './pages/Reports';
import CreateDriver from './pages/CreateDriver';
import LiveMap from './pages/LiveMap';
import DriverMobile from './pages/DriverMobile';
import Users from './pages/Users'
import DeliveryChanges from './pages/DeliveryChanges';
import DispatcherMobile from './pages/DispatcherMobile';
import DispatcherDesktop from './pages/DispatcherDesktop';
import StoreKeeper from './pages/StoreKeeper';
import Customers from './pages/Customers';
import Events from './pages/Events';
import Complaints from './pages/Complaints';
import Communication from './pages/Communication';
import BatchAutoAssign from './pages/BatchAutoAssign';
import TestAPI from './pages/TestAPI';
import MenuManagement from './pages/MenuManagement';
import KitchenList from './pages/KitchenList';
import MenuSelectPage from './pages/MenuSelectPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import YellowblockApp from './pages/YellowblockApp';
import PartnerLogin from './pages/PartnerLogin';
import PartnerPortal from './pages/PartnerPortal';
import AdminPartners from './pages/AdminPartners';
import Subscription from './pages/Subscription';
import Renewal from './pages/Renewal';

// Layout
import Layout from './components/Layout';

// Protected Route Component
const AccessDenied = ({ 
  redirectPath = '/driver-mobile',
  title = 'Access Denied',
  message = 'Drivers can only use the mobile delivery portal. Please return to the driver workspace to continue.',
  ctaLabel = 'Go to Driver Portal'
}) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-4 max-w-md w-full">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 text-red-600 flex items-center justify-center text-3xl font-bold">
          !
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        <p className="text-gray-600">{message}</p>
        <button
          onClick={() => navigate(redirectPath, { replace: true })}
          className="inline-flex items-center justify-center px-5 py-3 bg-blue-600 text-white rounded-xl font-medium shadow hover:bg-blue-500 transition"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
};

// Responsive Dispatcher Component - Shows desktop or mobile based on screen size
const ResponsiveDispatcher = () => {
  const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 1024);

  React.useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isDesktop ? <DispatcherDesktop /> : <DispatcherMobile />;
};

const safeGetUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch (error) {
    console.error('Failed to parse user from storage:', error);
    localStorage.removeItem('user');
    return {};
  }
};

const hasPermission = (user, permissionKey) => {
  if (!permissionKey) return true;
  if (user?.role === 'super_admin') return true;
  if (user?.role === 'yellowblock_user' && permissionKey === 'events') return true;
  return user?.permissions?.[permissionKey] !== false;
};

const getFirstAvailablePath = (user) => {
  if (!user?.role) return '/login';

  if (user.role === 'driver') return '/driver-mobile';
  if (user.role === 'dispatcher') return '/dispatcher';
  if (user.role === 'store_keeper') return '/store-keeper';
  if (user.role === 'yellowblock_user') return '/yellowblock';

  const candidates = [
    { path: '/dashboard', permission: 'dashboard', roles: ['super_admin', 'admin', 'manager', 'viewer'] },
    { path: '/deliveries', permission: 'deliveries', roles: ['super_admin', 'admin', 'manager', 'viewer'] },
    { path: '/customers', permission: 'customers', roles: ['super_admin', 'admin', 'manager'] },
    { path: '/events', permission: 'events', roles: ['super_admin', 'admin'] },
    { path: '/bags', permission: 'bags', roles: ['super_admin', 'admin', 'manager'] },
    { path: '/late-deliveries', permission: 'late_deliveries', roles: ['super_admin', 'admin', 'manager'] },
    { path: '/complaints', permission: 'complaints', roles: ['super_admin', 'admin'] },
    { path: '/map', permission: 'live_map', roles: ['super_admin', 'admin', 'manager'] },
    { path: '/delivery-changes', permission: 'delivery_changes', roles: ['super_admin', 'admin'] },
    { path: '/users', permission: 'users', roles: ['super_admin', 'admin'] },
    { path: '/reports', permission: 'reports', roles: ['super_admin', 'admin', 'manager', 'viewer'] },
    { path: '/menus', permission: 'menus', roles: ['super_admin', 'admin'] }
  ];

  const firstAllowed = candidates.find((item) => item.roles.includes(user.role) && hasPermission(user, item.permission));
  return firstAllowed?.path || '/login';
};

const AuthBootstrap = () => {
  const dispatch = useDispatch();
  const authToken = useSelector((state) => state.auth.token);

  React.useEffect(() => {
    const token = authToken || localStorage.getItem('token');
    if (token) {
      dispatch(refreshCurrentUser());
    }
  }, [authToken, dispatch]);

  return null;
};

const ProtectedRoute = ({ children, allowDrivers = false, allowDispatchers = false, allowStoreKeepers = false, allowYellowblock = false, allowKitchen = false }) => {
  const authUser = useSelector((state) => state.auth.user);
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" />;
  }
  const user = authUser || safeGetUser();
  
  // Redirect drivers to driver mobile
  if (user.role === 'driver' && !allowDrivers) {
    return <AccessDenied />;
  }
  
  // Redirect dispatchers to dispatcher page
  if (user.role === 'dispatcher' && !allowDispatchers) {
    return <Navigate to="/dispatcher" replace />;
  }
  
  // Redirect store keepers to store-keeper page only
  if (user.role === 'store_keeper' && !allowStoreKeepers) {
    return <Navigate to="/store-keeper" replace />;
  }

  // Redirect yellowblock users to yellowblock page only
  if (user.role === 'yellowblock_user' && !allowYellowblock) {
    return <Navigate to="/yellowblock" replace />;
  }

  // Redirect kitchen users to partner management only
  if (user.role === 'kitchen' && !allowKitchen) {
    return <Navigate to="/admin/partners" replace />;
  }

  return children;
};

const RoleBasedRoute = ({ children, allowedRoles }) => {
  const authUser = useSelector((state) => state.auth.user);
  const user = authUser || safeGetUser();
  return allowedRoles.includes(user.role) ? children : <Navigate to={getFirstAvailablePath(user)} replace />;
};

// Blocks access if user's permission for a given key is false (super_admin always passes)
const PermissionBasedRoute = ({ children, permission }) => {
  const authUser = useSelector((state) => state.auth.user);
  const user = authUser || safeGetUser();
  if (!hasPermission(user, permission)) {
    return <Navigate to={getFirstAvailablePath(user)} replace />;
  }
  return children;
};

// Separate guard for partner portal — uses partnerToken, not internal user token
const PartnerRoute = ({ children }) => {
  const partnerToken = localStorage.getItem('partnerToken');
  if (!partnerToken) return <Navigate to="/partner/login" replace />;
  return children;
};

function App() {
  return (
    <Provider store={store}>
      <Router>
        <AuthBootstrap />
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/partner/login" element={<PartnerLogin />} />
            <Route path="/partner/portal" element={<PartnerRoute><PartnerPortal /></PartnerRoute>} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            } />
            
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <PermissionBasedRoute permission="dashboard">
                  <Layout>
                    <Dashboard />
                  </Layout>
                </PermissionBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/map" element={
  <ProtectedRoute>
    <PermissionBasedRoute permission="live_map">
      <Layout>
        <LiveMap />
      </Layout>
    </PermissionBasedRoute>
  </ProtectedRoute>
} />
            
            <Route path="/drivers" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['admin']}>
                  <PermissionBasedRoute permission="drivers">
                    <Layout>
                      <Drivers />
                    </Layout>
                  </PermissionBasedRoute>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
            
            <Route path="/drivers/create" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['admin']}>
                  <Layout>
                    <CreateDriver />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
            
            <Route path="/drivers/:id" element={
              <ProtectedRoute>
                <Layout>
                  <DriverDetail />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/driver-mobile" element={
              <ProtectedRoute allowDrivers>
                <DriverMobile />
              </ProtectedRoute>
} />
            <Route path="/dispatcher" element={
              <ProtectedRoute allowDispatchers>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'manager', 'dispatcher']}>
                  <ResponsiveDispatcher />
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/store-keeper" element={
              <ProtectedRoute allowStoreKeepers>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'store_keeper']}>
                  <Layout>
                    <StoreKeeper />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
            
            <Route path="/users" element={
  <ProtectedRoute>
    <RoleBasedRoute allowedRoles={['super_admin', 'admin']}>
      <PermissionBasedRoute permission="users">
        <Layout>
          <Users />
        </Layout>
      </PermissionBasedRoute>
    </RoleBasedRoute>
  </ProtectedRoute>
} />
            <Route path="/deliveries" element={
              <ProtectedRoute>
                <PermissionBasedRoute permission="deliveries">
                  <Layout>
                    <Deliveries />
                  </Layout>
                </PermissionBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/customers" element={
              <ProtectedRoute>
                <PermissionBasedRoute permission="customers">
                  <Layout>
                    <Customers />
                  </Layout>
                </PermissionBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/events" element={
              <ProtectedRoute allowDispatchers allowYellowblock>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'dispatcher', 'yellowblock_user']}>
                  <PermissionBasedRoute permission="events">
                    <Layout>
                      <Events />
                    </Layout>
                  </PermissionBasedRoute>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/dispatcher/events" element={
              <ProtectedRoute allowDispatchers>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'dispatcher']}>
                  <Events showBackButton />
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/complaints" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'dispatcher']}>
                  <PermissionBasedRoute permission="complaints">
                    <Layout>
                      <Complaints />
                    </Layout>
                  </PermissionBasedRoute>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/batch-auto-assign" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'dispatcher']}>
                  <Layout>
                    <BatchAutoAssign />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/test-api" element={
              <ProtectedRoute>
                <TestAPI />
              </ProtectedRoute>
            } />
            
            <Route path="/deliveries/:id" element={
              <ProtectedRoute>
                <Layout>
                  <DeliveryDetail />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/add-delivery" element={
              <ProtectedRoute>
                <Layout>
                  <AddDelivery />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/bags" element={
              <ProtectedRoute>
                <PermissionBasedRoute permission="bags">
                  <Layout>
                    <BagTracking />
                  </Layout>
                </PermissionBasedRoute>
              </ProtectedRoute>
            } />
            
            <Route path="/late-deliveries" element={
              <ProtectedRoute>
                <PermissionBasedRoute permission="late_deliveries">
                  <Layout>
                    <LateDeliveries />
                  </Layout>
                </PermissionBasedRoute>
              </ProtectedRoute>
            } />
            
            <Route path="/reports" element={
              <ProtectedRoute>
                <PermissionBasedRoute permission="reports">
                  <Layout>
                    <Reports />
                  </Layout>
                </PermissionBasedRoute>
              </ProtectedRoute>
            } />
            <Route path="/subscription" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'manager']}>
                  <Layout>
                    <Subscription />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
            <Route path="/renewal" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'manager']}>
                  <Layout>
                    <Renewal />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
            <Route path="/communications" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'dispatcher', 'manager']}>
                  <Layout>
                    <Communication />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
             <Route path="/delivery-changes" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin']}>
                  <PermissionBasedRoute permission="delivery_changes">
                    <Layout>
                      <DeliveryChanges />
                    </Layout>
                  </PermissionBasedRoute>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/menus" element={
              <ProtectedRoute>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin']}>
                  <PermissionBasedRoute permission="menus">
                    <Layout>
                      <MenuManagement />
                    </Layout>
                  </PermissionBasedRoute>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/menu-select/:token" element={
              <MenuSelectPage />
            } />

            <Route path="/admin/partners" element={
              <ProtectedRoute allowKitchen>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'kitchen']}>
                  <Layout>
                    <AdminPartners />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/kitchen-list" element={
              <ProtectedRoute allowKitchen>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'kitchen']}>
                  <Layout>
                    <KitchenList />
                  </Layout>
                </RoleBasedRoute>
              </ProtectedRoute>
            } />

            <Route path="/yellowblock/*" element={
              <ProtectedRoute allowYellowblock>
                <RoleBasedRoute allowedRoles={['super_admin', 'admin', 'yellowblock_user']}>
                  <YellowblockApp />
                </RoleBasedRoute>
              </ProtectedRoute>
            } />
          </Routes>
          <Toaster />
        </div>
      </Router>
    </Provider>
  );
}

export default App;
