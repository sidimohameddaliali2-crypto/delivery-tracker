import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

// Define the async thunk first
export const fetchDeliveryById = createAsyncThunk(
  'deliveries/fetchDeliveryById',
  async (deliveryId, { rejectWithValue }) => {
    try {
      console.log('Making API request for delivery:', deliveryId);
      const response = await api.get(`/deliveries/${deliveryId}`);
      
      if (!response.data) {
        throw new Error('No data received from server');
      }

      if (response.data.success === false) {
        return rejectWithValue({
          message: response.data.message || 'Server indicated failure',
          data: response.data
        });
      }

      const returned = response.data.data || response.data;
      if (!returned) {
        throw new Error('No delivery data in response');
      }

      // If server returned { delivery, bags } unwrap it
      const delivery = returned.delivery || returned;
      const bags = returned.bags || [];

      // Return an object with delivery and bags for the reducer to handle
      return { delivery, bags };
    } catch (error) {
      // Improved error logging for debugging
      if (error?.isAxiosError) {
        try {
          console.error('Delivery fetch axios error:', {
            message: error.message,
            info: error.toJSON ? error.toJSON() : undefined,
            status: error.response?.status,
            data: error.response?.data,
            headers: error.config?.headers,
            url: error.config?.url,
          });
        } catch (logErr) {
          console.error('Error while logging axios error:', logErr);
        }
      } else {
        console.error('Delivery fetch error in thunk (non-axios):', error);
      }

      return rejectWithValue({
        message: error.response?.data?.message || error.message || 'Failed to fetch delivery details',
        status: error.response?.status,
        data: error.response?.data,
        original: error?.toString()
      });
    }
  }
);

export const fetchDashboardData = createAsyncThunk(
  'deliveries/fetchDashboardData',
  async (dateRange = 'today', { rejectWithValue }) => {
    try {
      const response = await api.get(`/reports/dashboard?dateRange=${dateRange}`);
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'Failed to fetch dashboard data');
      }

      return response.data.data;
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch dashboard data' });
    }
  }
);

export const fetchDeliveries = createAsyncThunk(
  'deliveries/fetchDeliveries',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { dateRange = 'today', limit, dateFrom: customDateFrom, dateTo: customDateTo } = params;
      
      let queryParams = new URLSearchParams();

      // Set appropriate limit based on dateRange
      if (dateRange === 'all') {
        // For analytics, we need ALL deliveries, so use a high limit or no limit
        queryParams.append('limit', (limit || 5000).toString());
      } else {
        // For filtered date ranges, use default limit
        queryParams.append('limit', (limit || 500).toString());
      }

      console.log('Fetching deliveries with params:', { dateRange, limit: queryParams.get('limit'), customDateFrom, customDateTo });

      // Only add date filters if not fetching all data
      if (dateRange !== 'all') {
        // Calculate date range
        const now = new Date();
        let dateFrom, dateTo;
        
        if (dateRange === 'today') {
          dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
        } else if (dateRange === 'week') {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          dateFrom = startOfWeek.toISOString();
          dateTo = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateRange === 'month') {
          dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        } else if (dateRange === 'custom') {
          // Use provided custom date range
          dateFrom = customDateFrom;
          dateTo = customDateTo;
        }

        if (dateFrom) queryParams.append('dateFrom', dateFrom);
        if (dateTo) queryParams.append('dateTo', dateTo);
      }

      console.log('Making API request to:', `/deliveries?${queryParams}`);
      const response = await api.get(`/deliveries?${queryParams}`);
      
      console.log('API response structure:', {
        hasData: !!response.data,
        success: response.data?.success,
        dataKeys: response.data ? Object.keys(response.data) : 'No data',
        deliveriesLength: response.data?.data?.deliveries?.length || 0
      });
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'Failed to fetch deliveries');
      }

      const deliveries = response.data.data.deliveries || response.data.data || [];
      console.log('Returning deliveries count:', deliveries.length);
      
      return deliveries;
    } catch (error) {
      console.error('Deliveries fetch error:', error);
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch deliveries' });
    }
  }
);

const deliverySlice = createSlice({
  name: 'delivery',
  initialState: {
    dashboardData: null,
    deliveries: [],
    lateDeliveries: [],
    currentDelivery: null,
    currentDeliveryBags: [],
    isLoading: false,
    error: null,
  },
  reducers: {
    setDashboardData: (state, action) => {
      state.dashboardData = action.payload;
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    setCurrentDelivery: (state, action) => {
      state.currentDelivery = action.payload;
    },
    clearCurrentDelivery: (state) => {
      state.currentDelivery = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Dashboard data
      .addCase(fetchDashboardData.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.dashboardData = action.payload;
        state.error = null;
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch dashboard data';
      })
      // Deliveries list
      .addCase(fetchDeliveries.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDeliveries.fulfilled, (state, action) => {
        state.isLoading = false;
        state.deliveries = action.payload;
        state.error = null;
      })
      .addCase(fetchDeliveries.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch deliveries';
      })
      // Delivery by ID
      .addCase(fetchDeliveryById.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDeliveryById.fulfilled, (state, action) => {
        state.isLoading = false;
        // Thunk now returns { delivery, bags }
        if (action.payload && action.payload.delivery) {
          state.currentDelivery = action.payload.delivery;
          state.currentDeliveryBags = action.payload.bags || [];
          // also attach bags to the delivery object for compatibility with components
          try {
            state.currentDelivery.bags = action.payload.bags || [];
          } catch (e) {
            // ignore if cannot attach
          }
        } else {
          state.currentDelivery = action.payload;
          state.currentDeliveryBags = [];
          try {
            state.currentDelivery.bags = [];
          } catch (e) {}
        }
        state.error = null;
      })
      .addCase(fetchDeliveryById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch delivery';
        state.currentDelivery = null;
      })
     .addCase(fetchLateEarlyDeliveries.pending, (state) => {
  state.isLoading = true;
  state.error = null;
})
.addCase(fetchLateEarlyDeliveries.fulfilled, (state, action) => {
  state.isLoading = false;
  state.lateEarlyDeliveries = action.payload.deliveries;
  state.lateEarlyStats = action.payload.stats;
  state.lateEarlyDateRange = action.payload.dateRange;
})
.addCase(fetchLateEarlyDeliveries.rejected, (state, action) => {
  state.isLoading = false;
  state.error = action.payload?.message || 'Failed to fetch deliveries';
})
     
.addCase(fetchAllDeliveries.fulfilled, (state, action) => {
  state.deliveries = action.payload;
})

  },
});

export const fetchLateEarlyDeliveries = createAsyncThunk(
  'delivery/fetchLateEarlyDeliveries',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });
      
      const response = await api.get(`/deliveries/late-early?${params}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch deliveries' });
    }
  }
);

export const fetchAllDeliveries = createAsyncThunk(
  'deliveries/fetchAllDeliveries',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/deliveries?limit=1000'); // Adjust limit as needed
      return response.data.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch deliveries' });
    }
  }
);

export const { 
  setDashboardData, 
  setLoading, 
  setError, 
  setCurrentDelivery, 
  clearCurrentDelivery 
} = deliverySlice.actions;

export default deliverySlice.reducer;