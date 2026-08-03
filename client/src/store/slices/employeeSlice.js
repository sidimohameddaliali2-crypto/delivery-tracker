import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

export const fetchEmployees = createAsyncThunk(
  'employees/fetchEmployees',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });

      const response = await api.get(`/employees?${params}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch employees' });
    }
  }
);

export const createEmployee = createAsyncThunk(
  'employees/createEmployee',
  async (employeeData, { rejectWithValue }) => {
    try {
      const response = await api.post('/employees', employeeData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create employee' });
    }
  }
);

export const updateEmployee = createAsyncThunk(
  'employees/updateEmployee',
  async ({ id, employeeData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/employees/${id}`, employeeData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to update employee' });
    }
  }
);

export const fetchEmployeeDetail = createAsyncThunk(
  'employees/fetchEmployeeDetail',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/employees/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch employee' });
    }
  }
);

// Cross-employee leave request list (e.g. pending approvals)
export const fetchLeaveRequests = createAsyncThunk(
  'employees/fetchLeaveRequests',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });

      const response = await api.get(`/employees/leave-requests?${params}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch leave requests' });
    }
  }
);

export const createLeaveRequest = createAsyncThunk(
  'employees/createLeaveRequest',
  async ({ employeeId, leaveData }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/employees/${employeeId}/leave-requests`, leaveData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create leave request' });
    }
  }
);

export const approveLeaveRequest = createAsyncThunk(
  'employees/approveLeaveRequest',
  async (requestId, { rejectWithValue }) => {
    try {
      const response = await api.put(`/employees/leave-requests/${requestId}/approve`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to approve leave request' });
    }
  }
);

export const rejectLeaveRequest = createAsyncThunk(
  'employees/rejectLeaveRequest',
  async ({ requestId, rejectionReason }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/employees/leave-requests/${requestId}/reject`, { rejectionReason });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to reject leave request' });
    }
  }
);

export const cancelLeaveRequest = createAsyncThunk(
  'employees/cancelLeaveRequest',
  async (requestId, { rejectWithValue }) => {
    try {
      await api.delete(`/employees/leave-requests/${requestId}`);
      return requestId;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to cancel leave request' });
    }
  }
);

const employeeSlice = createSlice({
  name: 'employees',
  initialState: {
    employees: [],
    selectedEmployee: null,
    selectedEmployeeLeaveRequests: [],
    leaveRequests: [],
    isLoading: false,
    error: null,
    success: false,
    totalPages: 1,
    currentPage: 1,
    total: 0
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.success = false;
    },
    clearSelectedEmployee: (state) => {
      state.selectedEmployee = null;
      state.selectedEmployeeLeaveRequests = [];
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch employees
      .addCase(fetchEmployees.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEmployees.fulfilled, (state, action) => {
        state.isLoading = false;
        state.employees = action.payload.employees;
        state.totalPages = action.payload.totalPages;
        state.currentPage = action.payload.currentPage;
        state.total = action.payload.total;
      })
      .addCase(fetchEmployees.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch employees';
      })
      // Create employee
      .addCase(createEmployee.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(createEmployee.fulfilled, (state, action) => {
        state.isLoading = false;
        state.employees.unshift(action.payload);
        state.success = true;
        state.total += 1;
      })
      .addCase(createEmployee.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to create employee';
      })
      // Update employee
      .addCase(updateEmployee.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(updateEmployee.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.employees.findIndex(e => e._id === action.payload._id);
        if (index !== -1) {
          state.employees[index] = action.payload;
        }
        if (state.selectedEmployee?._id === action.payload._id) {
          state.selectedEmployee = action.payload;
        }
        state.success = true;
      })
      .addCase(updateEmployee.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to update employee';
      })
      // Fetch employee detail
      .addCase(fetchEmployeeDetail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEmployeeDetail.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedEmployee = action.payload.employee;
        state.selectedEmployeeLeaveRequests = action.payload.leaveRequests;
      })
      .addCase(fetchEmployeeDetail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch employee';
      })
      // Fetch leave requests (cross-employee)
      .addCase(fetchLeaveRequests.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchLeaveRequests.fulfilled, (state, action) => {
        state.isLoading = false;
        state.leaveRequests = action.payload.leaveRequests;
      })
      .addCase(fetchLeaveRequests.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch leave requests';
      })
      // Create leave request
      .addCase(createLeaveRequest.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(createLeaveRequest.fulfilled, (state) => {
        state.isLoading = false;
        state.success = true;
      })
      .addCase(createLeaveRequest.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to create leave request';
      })
      // Approve leave request
      .addCase(approveLeaveRequest.fulfilled, (state, action) => {
        state.leaveRequests = state.leaveRequests.map(r =>
          r._id === action.payload._id ? { ...r, ...action.payload } : r
        );
      })
      .addCase(approveLeaveRequest.rejected, (state, action) => {
        state.error = action.payload?.message || 'Failed to approve leave request';
      })
      // Reject leave request
      .addCase(rejectLeaveRequest.fulfilled, (state, action) => {
        state.leaveRequests = state.leaveRequests.map(r =>
          r._id === action.payload._id ? { ...r, ...action.payload } : r
        );
      })
      .addCase(rejectLeaveRequest.rejected, (state, action) => {
        state.error = action.payload?.message || 'Failed to reject leave request';
      })
      // Cancel leave request
      .addCase(cancelLeaveRequest.fulfilled, (state, action) => {
        state.leaveRequests = state.leaveRequests.filter(r => r._id !== action.payload);
        state.selectedEmployeeLeaveRequests = state.selectedEmployeeLeaveRequests.filter(r => r._id !== action.payload);
      })
      .addCase(cancelLeaveRequest.rejected, (state, action) => {
        state.error = action.payload?.message || 'Failed to cancel leave request';
      });
  }
});

export const { clearError, clearSuccess, clearSelectedEmployee } = employeeSlice.actions;
export default employeeSlice.reducer;
