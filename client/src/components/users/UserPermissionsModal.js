import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Shield,
  Check,
  X as XIcon,
  AlertCircle
} from 'lucide-react';
import {
  Chip,
  Switch,
  FormControlLabel,
  Tooltip
} from '@mui/material';
import { clearError, clearSuccess } from '../../store/slices/userSlice';

const UserPermissionsModal = ({ isOpen, onClose, user, onSubmit, currentUser }) => {
  const dispatch = useDispatch();
  const { isLoading, error, success } = useSelector(state => state.user);
  const authCurrentUser = useSelector(state => state.auth.user);
  const effectiveCurrentUser = currentUser || authCurrentUser;
  
  const [permissions, setPermissions] = useState({
    dashboard: false,
    users: false,
    drivers: false,
    deliveries: false,
    customers: false,
    events: false,
    bags: false,
    late_deliveries: false,
    complaints: false,
    live_map: false,
    delivery_changes: false,
    reports: false,
    menus: false,
    settings: false
  });

  const [role, setRole] = useState('viewer');

  useEffect(() => {
    if (user) {
      // Merge saved permissions with defaults so new keys always appear
      const defaults = getDefaultPermissions(user.role);
      setPermissions({ ...defaults, ...(user.permissions || {}) });
      setRole(user.role);
    }
  }, [user]);

  const handlePermissionChange = (permission) => {
    setPermissions(prev => ({
      ...prev,
      [permission]: !prev[permission]
    }));
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    
    // Set default permissions for the role
    const defaultPermissions = getDefaultPermissions(newRole);
    setPermissions(defaultPermissions);
  };

  const getDefaultPermissions = (role) => {
    const permissions = {
      dashboard: false,
      users: false,
      drivers: false,
      deliveries: false,
      customers: false,
      events: false,
      bags: false,
      late_deliveries: false,
      complaints: false,
      live_map: false,
      delivery_changes: false,
      reports: false,
      menus: false,
      settings: false
    };

    switch (role) {
      case 'super_admin':
        if (permissions) Object.keys(permissions).forEach(key => permissions[key] = true);
        break;
      case 'admin':
        permissions.dashboard = true;
        permissions.users = true;
        permissions.drivers = true;
        permissions.deliveries = true;
        permissions.customers = true;
        permissions.events = true;
        permissions.bags = true;
        permissions.late_deliveries = true;
        permissions.complaints = true;
        permissions.live_map = true;
        permissions.delivery_changes = true;
        permissions.reports = true;
        permissions.menus = true;
        break;
      case 'manager':
        permissions.dashboard = true;
        permissions.drivers = true;
        permissions.deliveries = true;
        permissions.customers = true;
        permissions.bags = true;
        permissions.late_deliveries = true;
        permissions.reports = true;
        permissions.live_map = true;
        break;
      case 'dispatcher':
        permissions.dashboard = true;
        permissions.drivers = true;
        permissions.deliveries = true;
        permissions.customers = true;
        permissions.events = true;
        permissions.bags = true;
        permissions.late_deliveries = true;
        permissions.complaints = true;
        permissions.live_map = true;
        break;
      case 'driver':
        permissions.dashboard = true;
        permissions.deliveries = true;
        break;
      case 'viewer':
        permissions.dashboard = true;
        permissions.reports = true;
        break;
    }

    return permissions;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const userData = {
        role: role,
        permissions: permissions
      };

      await onSubmit(userData);

    } catch (error) {
      // Error handled by Redux
    }
  };

  const handleClose = () => {
    if (user) {
      setPermissions(user.permissions || {});
      setRole(user.role);
    }
    dispatch(clearError());
    dispatch(clearSuccess());
    onClose();
  };

  const getPermissionDescription = (permission) => {
    const descriptions = {
      dashboard: 'Access to dashboard and overview statistics',
      users: 'Manage users and their permissions (Admin only)',
      drivers: 'View and manage driver accounts and performance',
      deliveries: 'Create, view, and manage deliveries',
      customers: 'View and manage customer accounts',
      events: 'Create and manage events',
      bags: 'Track and manage bag inventory and assignments',
      late_deliveries: 'View and manage late delivery alerts',
      complaints: 'View and manage customer complaints',
      live_map: 'View real-time driver locations on map',
      delivery_changes: 'View and manage delivery change requests',
      reports: 'Access to reports and analytics',
      menus: 'Manage weekly menus and meal planning',
      settings: 'System configuration and settings'
    };
    return descriptions[permission] || 'No description available';
  };

  const getRoleColor = (role) => {
    const colors = {
      super_admin: 'error',
      admin: 'warning',
      manager: 'info',
      dispatcher: 'success',
      driver: 'secondary',
      viewer: 'default'
    };
    return colors[role] || 'default';
  };

  const canEditRole = () => {
    if (!effectiveCurrentUser) return false;
    if (effectiveCurrentUser.role === 'super_admin') return true;
    if (effectiveCurrentUser.role === 'admin' && user?.role !== 'super_admin') return true;
    if (user?._id === effectiveCurrentUser._id) return false; // Users can't change their own role
    return false;
  };

  const canEditPermissions = () => {
    if (!effectiveCurrentUser) return false;
    if (effectiveCurrentUser.role === 'super_admin') return true;
    if (effectiveCurrentUser.role === 'admin' && user?.role !== 'super_admin') return true;
    return false;
  };

  if (!isOpen || !user || !effectiveCurrentUser) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black bg-opacity-50"
          onClick={handleClose}
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-center space-x-2">
              <Shield className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900">Manage Permissions</h2>
              <Chip 
                label={user.profile?.firstName + ' ' + user.profile?.lastName} 
                size="small" 
                variant="outlined"
              />
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm">
                Permissions updated successfully!
              </div>
            )}

            {/* Role Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-900 mb-3">User Role</h3>
              <div className="flex flex-wrap gap-2">
                {['viewer', 'driver', 'dispatcher', 'manager', 'admin', ...(effectiveCurrentUser.role === 'super_admin' ? ['super_admin'] : [])].map((roleOption) => (
                  <button
                    key={roleOption}
                    type="button"
                    onClick={() => canEditRole() && handleRoleChange(roleOption)}
                    disabled={!canEditRole()}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      role === roleOption
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    } ${!canEditRole() ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {roleOption.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
              {!canEditRole() && (
                <p className="text-sm text-blue-700 mt-2 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  You don't have permission to change this user's role
                </p>
              )}
            </div>

            {/* Permissions Grid */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Permissions</h3>
              
              {!canEditPermissions() ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center text-yellow-800">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    <span>You don't have permission to edit permissions for this user</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {permissions && Object.entries(permissions).map(([permission, enabled]) => (
                    <div
                      key={permission}
                      className={`border rounded-lg p-4 transition-colors ${
                        enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900 capitalize">
                          {permission.replace('_', ' ')}
                        </h4>
                        <Tooltip title={getPermissionDescription(permission)}>
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm ${
                              enabled ? 'text-green-600' : 'text-gray-500'
                            }`}>
                              {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={enabled}
                                  onChange={() => handlePermissionChange(permission)}
                                  color="success"
                                  size="small"
                                />
                              }
                              label=""
                            />
                          </div>
                        </Tooltip>
                      </div>
                      <p className="text-sm text-gray-600">
                        {getPermissionDescription(permission)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Permission Summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Permission Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {permissions ? Object.values(permissions).filter(Boolean).length : 0}
                  </div>
                  <div className="text-gray-600">Enabled</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">
                    {permissions ? Object.values(permissions).length - Object.values(permissions).filter(Boolean).length : 0}
                  </div>
                  <div className="text-gray-600">Disabled</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {permissions ? Object.values(permissions).length : 0}
                  </div>
                  <div className="text-gray-600">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-600 capitalize">
                    {role.replace('_', ' ')}
                  </div>
                  <div className="text-gray-600">Role</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              {canEditPermissions() && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  {isLoading ? 'Saving...' : 'Save Permissions'}
                </button>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UserPermissionsModal;
