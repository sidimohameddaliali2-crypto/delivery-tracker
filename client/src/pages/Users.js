import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Edit, 
  Eye, 
  UserX,
  UserCheck,
  Shield,
  Mail,
  Phone,
  Calendar,
  RefreshCw,
  Trash2,
  Camera
} from 'lucide-react';
import {
  Avatar,
  Badge,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import { fetchUsers, createUser, updateUser, deleteUser } from '../store/slices/userSlice';
import CreateUserModal from '../components/users/CreateUserModal';
import EditUserModal from '../components/users/EditUserModal';
import UserPermissionsModal from '../components/users/UserPermissionsModal';
import UserAvatar from '../components/users/UserAvatar';

const Users = () => {
  const dispatch = useDispatch();
  const { users, isLoading, error, totalPages, currentPage, total } = useSelector(state => state.user);
  const { user: currentUser } = useSelector(state => state.auth);

  const [filters, setFilters] = useState({
    search: '',
    role: 'all',
    page: 1,
    limit: 10
  });

  const [showFilters, setShowFilters] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [filters]);

  const loadUsers = () => {
    dispatch(fetchUsers(filters));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      ...(key !== 'page' && { page: 1 })
    }));
  };

  const handleCreateUser = (userData) => {
    dispatch(createUser(userData))
      .unwrap()
      .then(() => {
        setIsCreateModalOpen(false);
        loadUsers();
      });
  };

  const handleUpdateUser = (userData) => {
    dispatch(updateUser({ id: selectedUser._id, userData }))
      .unwrap()
      .then(() => {
        setIsEditModalOpen(false);
        setSelectedUser(null);
        loadUsers();
      });
  };

  const handleDeleteUser = (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      dispatch(deleteUser(userId))
        .unwrap()
        .then(() => {
          loadUsers();
        });
    }
  };

  const handleToggleStatus = (user) => {
    dispatch(updateUser({ 
      id: user._id, 
      userData: { isActive: !user.isActive } 
    }))
      .unwrap()
      .then(() => {
        loadUsers();
      });
  };

  const handleProfilePictureUpload = (user, file) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('profilePicture', file);

    // You'll need to implement this API call in your userSlice
    // dispatch(uploadProfilePicture({ userId: user._id, formData }))
    //   .unwrap()
    //   .then(() => {
    //     loadUsers();
    //     setIsUploading(false);
    //   })
    //   .catch(() => {
    //     setIsUploading(false);
    //   });
  };

  const getRoleColor = (role) => {
    const colors = {
      super_admin: 'error',
      admin: 'warning',
      manager: 'info',
      dispatcher: 'success',
      driver: 'secondary',
      store_keeper: 'accent',
      yellowblock_user: 'warning',
      viewer: 'default',
      kitchen: 'info'
    };
    return colors[role] || 'default';
  };

  const getRoleVariant = (role) => {
    return role === 'super_admin' ? 'filled' : 'outlined';
  };

  const canEditUser = (user) => {
    if (currentUser.role === 'super_admin') return true;
    if (currentUser.role === 'admin' && user.role !== 'super_admin') return true;
    if (user._id === currentUser._id) return true;
    return false;
  };

  const canDeleteUser = (user) => {
    if (currentUser.role !== 'super_admin') return false;
    if (user._id === currentUser._id) return false;
    return true;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500">
            Manage system users and their permissions ({total} total users)
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadUsers}
            className="flex items-center px-3 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {(currentUser.role === 'super_admin' || currentUser.role === 'admin') && (
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create User
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </button>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <select
                value={filters.role}
                onChange={(e) => handleFilterChange('role', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="driver">Driver</option>
                <option value="store_keeper">Store Keeper</option>
                <option value="yellowblock_user">YellowBlock User</option>
                <option value="kitchen">Kitchen</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </div>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Results per page
                  </label>
                  <select
                    value={filters.limit}
                    onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="mr-3">
                        <UserAvatar 
                          user={user} 
                          size="medium" 
                          showStatus={user.role === 'driver'}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.profile?.firstName} {user.profile?.lastName}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {user.email}
                        </div>
                        {user.profile?.phone && (
                          <div className="text-sm text-gray-500 flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {user.profile.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Chip
                      label={user.role.replace('_', ' ')}
                      color={getRoleColor(user.role)}
                      variant={getRoleVariant(user.role)}
                      size="small"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.profile?.department || '-'}
                    {user.profile?.position && (
                      <div className="text-xs text-gray-500">{user.profile.position}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Chip
                      label={user.isActive ? 'Active' : 'Inactive'}
                      color={user.isActive ? 'success' : 'error'}
                      variant="outlined"
                      size="small"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formatDate(user.createdAt)}
                    </div>
                    {user.createdBy && (
                      <div className="text-xs text-gray-400">
                        by {user.createdBy.profile?.firstName} {user.createdBy.profile?.lastName}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <Tooltip title="Edit user">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedUser(user);
                            setIsEditModalOpen(true);
                          }}
                          disabled={!canEditUser(user)}
                          color="primary"
                        >
                          <Edit className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Manage permissions">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedUser(user);
                            setIsPermissionsModalOpen(true);
                          }}
                          disabled={!canEditUser(user) || user.role === 'driver'}
                          color="secondary"
                        >
                          <Shield className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title={user.isActive ? 'Deactivate user' : 'Activate user'}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleStatus(user)}
                          disabled={!canEditUser(user) || user._id === currentUser._id}
                          color={user.isActive ? 'error' : 'success'}
                        >
                          {user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </IconButton>
                      </Tooltip>

                      {canDeleteUser(user) && (
                        <Tooltip title="Delete user">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteUser(user._id)}
                            color="error"
                          >
                            <Trash2 className="w-4 h-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">
                {filters.search || filters.role !== 'all' ? 'No users match your filters' : 'No users found'}
              </div>
              <div className="text-gray-500 mt-2">
                {filters.search || filters.role !== 'all' 
                  ? 'Try adjusting your search criteria' 
                  : 'Create your first user to get started'
                }
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-12">
              <div className="text-lg">Loading users...</div>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {(filters.page - 1) * filters.limit + 1} to {Math.min(filters.page * filters.limit, total)} of {total} users
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleFilterChange('page', filters.page - 1)}
                  disabled={filters.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handleFilterChange('page', filters.page + 1)}
                  disabled={filters.page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateUser}
        currentUserRole={currentUser.role}
      />

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSubmit={handleUpdateUser}
        currentUser={currentUser}
      />

      <UserPermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => {
          setIsPermissionsModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSubmit={handleUpdateUser}
        currentUser={currentUser}
      />
    </div>
  );
};

export default Users;
