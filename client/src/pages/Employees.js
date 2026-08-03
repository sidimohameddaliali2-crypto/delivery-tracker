import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Search,
  Plus,
  Filter,
  Edit,
  Mail,
  Phone,
  RefreshCw,
  CalendarPlus,
  Check,
  X as XIcon,
  Ban
} from 'lucide-react';
import { Chip, IconButton, Tooltip } from '@mui/material';
import {
  fetchEmployees,
  createEmployee,
  updateEmployee,
  fetchLeaveRequests,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest
} from '../store/slices/employeeSlice';
import CreateEmployeeModal from '../components/employees/CreateEmployeeModal';
import EditEmployeeModal from '../components/employees/EditEmployeeModal';
import LeaveRequestModal from '../components/employees/LeaveRequestModal';

const LEAVE_TYPE_LABELS = {
  vacation: 'Vacation',
  publicHoliday: 'Public Holiday',
  sick: 'Sick'
};

const Employees = () => {
  const dispatch = useDispatch();
  const { employees, leaveRequests, isLoading, error, totalPages, currentPage, total } = useSelector(state => state.employee);

  const [activeTab, setActiveTab] = useState('employees');

  const [filters, setFilters] = useState({
    search: '',
    status: 'active',
    page: 1,
    limit: 10
  });
  const [showFilters, setShowFilters] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  useEffect(() => {
    if (activeTab === 'employees') {
      dispatch(fetchEmployees(filters));
    } else {
      dispatch(fetchLeaveRequests({ status: 'pending' }));
    }
  }, [activeTab, filters, dispatch]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      ...(key !== 'page' && { page: 1 })
    }));
  };

  const handleRefresh = () => {
    if (activeTab === 'employees') {
      dispatch(fetchEmployees(filters));
    } else {
      dispatch(fetchLeaveRequests({ status: 'pending' }));
    }
  };

  const handleCreateEmployee = (employeeData) => {
    return dispatch(createEmployee(employeeData))
      .unwrap()
      .then(() => {
        setIsCreateModalOpen(false);
      });
  };

  const handleUpdateEmployee = (employeeData) => {
    return dispatch(updateEmployee({ id: selectedEmployee._id, employeeData }))
      .unwrap()
      .then(() => {
        setIsEditModalOpen(false);
        setSelectedEmployee(null);
      });
  };

  const handleCreateLeaveRequest = (leaveData) => {
    return dispatch(createLeaveRequest({ employeeId: selectedEmployee._id, leaveData }))
      .unwrap()
      .then(() => {
        setIsLeaveModalOpen(false);
        setSelectedEmployee(null);
        dispatch(fetchEmployees(filters));
      });
  };

  const handleApprove = (requestId) => {
    dispatch(approveLeaveRequest(requestId));
  };

  const handleReject = (requestId) => {
    const rejectionReason = window.prompt('Reason for rejecting this request (optional):') || '';
    dispatch(rejectLeaveRequest({ requestId, rejectionReason }));
  };

  const handleCancel = (requestId) => {
    if (window.confirm('Cancel this leave request? If it was approved, the days will be returned to the balance.')) {
      dispatch(cancelLeaveRequest(requestId));
    }
  };

  const balanceColor = (balance) => {
    const remaining = balance.allocatedDays - balance.usedDays;
    if (remaining < 0) return 'error';
    if (remaining <= 2) return 'warning';
    return 'success';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500">
            Manage vacation, sick leave and the flexible public-holiday allowance
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            className="flex items-center px-3 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Employee
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'employees'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Employees ({total})
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'approvals'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending Approvals ({leaveRequests.filter(r => r.status === 'pending').length})
        </button>
      </div>

      {activeTab === 'employees' ? (
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
                    placeholder="Search employees..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </div>
            </div>

            {showFilters && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Results per page</label>
                    <select
                      value={filters.limit}
                      onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vacation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Public Holiday</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sick</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.map((employee) => (
                  <tr key={employee._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {employee.firstName} {employee.lastName}
                      </div>
                      {employee.email && (
                        <div className="text-sm text-gray-500 flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {employee.email}
                        </div>
                      )}
                      {employee.phone && (
                        <div className="text-sm text-gray-500 flex items-center">
                          <Phone className="w-3 h-3 mr-1" />
                          {employee.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.position || '-'}
                      {employee.department && (
                        <div className="text-xs text-gray-500">{employee.department}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Chip
                        label={`${employee.leaveBalances.vacation.usedDays}/${employee.leaveBalances.vacation.allocatedDays}`}
                        color={balanceColor(employee.leaveBalances.vacation)}
                        variant="outlined"
                        size="small"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Chip
                        label={`${employee.leaveBalances.publicHoliday.usedDays}/${employee.leaveBalances.publicHoliday.allocatedDays}`}
                        color={balanceColor(employee.leaveBalances.publicHoliday)}
                        variant="outlined"
                        size="small"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Chip
                        label={`${employee.leaveBalances.sick.usedDays}/${employee.leaveBalances.sick.allocatedDays}`}
                        color={balanceColor(employee.leaveBalances.sick)}
                        variant="outlined"
                        size="small"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Chip
                        label={employee.status === 'active' ? 'Active' : 'Inactive'}
                        color={employee.status === 'active' ? 'success' : 'default'}
                        variant="outlined"
                        size="small"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <Tooltip title="Add leave">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setIsLeaveModalOpen(true);
                            }}
                            color="primary"
                          >
                            <CalendarPlus className="w-4 h-4" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit employee">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setIsEditModalOpen(true);
                            }}
                            color="secondary"
                          >
                            <Edit className="w-4 h-4" />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {employees.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <div className="text-gray-400 text-lg">
                  {filters.search ? 'No employees match your search' : 'No employees found'}
                </div>
                <div className="text-gray-500 mt-2">
                  {filters.search ? 'Try adjusting your search' : 'Create your first employee to get started'}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-12">
                <div className="text-lg">Loading employees...</div>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(filters.page - 1) * filters.limit + 1} to {Math.min(filters.page * filters.limit, total)} of {total} employees
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
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leaveRequests.filter(r => r.status === 'pending').map((request) => (
                <tr key={request._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {request.employee?.firstName} {request.employee?.lastName}
                    {request.employee?.department && (
                      <div className="text-xs text-gray-500">{request.employee.department}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Chip label={LEAVE_TYPE_LABELS[request.type]} size="small" variant="outlined" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(request.startDate)} &ndash; {formatDate(request.endDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.days}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{request.reason || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <Tooltip title="Approve">
                        <IconButton size="small" onClick={() => handleApprove(request._id)} color="success">
                          <Check className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <IconButton size="small" onClick={() => handleReject(request._id)} color="error">
                          <XIcon className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Cancel request">
                        <IconButton size="small" onClick={() => handleCancel(request._id)} color="default">
                          <Ban className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {leaveRequests.filter(r => r.status === 'pending').length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">No pending approvals</div>
              <div className="text-gray-500 mt-2">Vacation and public-holiday requests will show up here.</div>
            </div>
          )}
        </div>
      )}

      <CreateEmployeeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateEmployee}
      />

      <EditEmployeeModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedEmployee(null);
        }}
        employee={selectedEmployee}
        onSubmit={handleUpdateEmployee}
      />

      <LeaveRequestModal
        isOpen={isLeaveModalOpen}
        onClose={() => {
          setIsLeaveModalOpen(false);
          setSelectedEmployee(null);
        }}
        employee={selectedEmployee}
        onSubmit={handleCreateLeaveRequest}
      />
    </div>
  );
};

export default Employees;
