import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

// Async thunks
export const fetchBags = createAsyncThunk(
  'bags/fetchBags',
  async ({ page = 1, limit = 50, status, search, location, driverId } = {}, { rejectWithValue }) => {
    try {
      const MAX_BAGS_FETCH_LIMIT = 10000;
      const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      const safeLimit = Math.min(
        MAX_BAGS_FETCH_LIMIT,
        Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50
      );

      console.log('🔄 Fetching bags with params:', { page: safePage, limit: safeLimit, status, search, location, driverId });
      
      const params = new URLSearchParams({
        page: safePage.toString(),
        limit: safeLimit.toString()
      });
      
      if (status && status !== 'all') {
        params.append('status', status);
      }
      
      if (search) {
        params.append('search', search);
      }

      if (location) {
        params.append('location', location);
      }

      if (driverId) {
        params.append('driverId', driverId);
      }

      const response = await api.get(`/bags?${params}`);
      console.log('✅ Server response:', response.data);
      
      return {
        bags: response.data.data || [],
        pagination: response.data.pagination || { page: safePage, limit: safeLimit },
        total: response.data.count || 0
      };
    } catch (error) {
      console.error('❌ Error fetching bags:', error);
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch bags' });
    }
  }
);

export const createBag = createAsyncThunk(
  'bags/createBag',
  async (bagData, { rejectWithValue }) => {
    try {
      const response = await api.post('/bags', bagData);
      return response.data.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create bag' });
    }
  }
);

export const createBulkBags = createAsyncThunk(
  'bags/createBulkBags',
  async (bagsData, { rejectWithValue }) => {
    try {
      console.log('🔄 Creating bulk bags:', bagsData.length);
      const response = await api.post('/bags/bulk', { bags: bagsData });
      console.log('✅ Bulk bags response:', response.data);
      return response.data.data || response.data.bags || response.data; // FIXED: Handle different response structures
    } catch (error) {
      console.error('❌ Bulk bags error:', error);
      return rejectWithValue(error.response?.data || { message: 'Failed to create bulk bags' });
    }
  }
);

export const assignBag = createAsyncThunk(
  'bags/assignBag',
  async ({ bagId, driverId, customerId, customerName, notes, deliveryId }, { rejectWithValue }) => {
    try {
      const payload = {
        driverId,
      };

      if (customerId) payload.customerId = customerId;
      if (customerName) payload.customerName = customerName;
      if (notes) payload.notes = notes;
      if (deliveryId) payload.deliveryId = deliveryId;

      const response = await api.patch(`/bags/${bagId}/assign`, payload);
      return response.data.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to assign bag' });
    }
  }
);

export const deleteBag = createAsyncThunk(
  'bags/deleteBag',
  async (bagId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/bags/${bagId}`);
      return response.data.data || { _id: bagId };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to delete bag' });
    }
  }
);

const bagSlice = createSlice({
  name: 'bags',
  initialState: {
    bags: [],
    isLoading: false,
    error: null,
    success: false,
    total: 0,
    pagination: {
      page: 1,
      limit: 50,
      total: 0,
      pages: 1
    }
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.success = false;
    },
    // Add a manual set bags action for debugging
    setBags: (state, action) => {
      state.bags = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch bags
      .addCase(fetchBags.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchBags.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bags = action.payload.bags;
        state.total = action.payload.total || 0;
        state.pagination = {
          ...state.pagination,
          ...action.payload.pagination,
          total: action.payload.total,
          pages: Math.max(1, Math.ceil((action.payload.total || 0) / (action.payload.pagination?.limit || state.pagination.limit)))
        };
        console.log('✅ Fetched bags:', {
          count: action.payload.bags.length,
          total: action.payload.total,
          pagination: state.pagination
        });
      })
      .addCase(fetchBags.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch bags';
        console.error('❌ Fetch bags error:', state.error);
      })
      // Create bag
      .addCase(createBag.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(createBag.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bags.push(action.payload);
        state.success = true;
        console.log('✅ Created single bag:', action.payload.bagId);
      })
      .addCase(createBag.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to create bag';
      })
      // Create bulk bags - FIXED THIS
      .addCase(createBulkBags.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(createBulkBags.fulfilled, (state, action) => {
        state.isLoading = false;
        // Handle different response structures
        const newBags = Array.isArray(action.payload) ? action.payload : (action.payload.data || []);
        state.bags = [...state.bags, ...newBags];
        state.success = true;
        console.log('✅ Added bulk bags. Total bags now:', state.bags.length);
      })
      .addCase(createBulkBags.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to create bulk bags';
        console.error('❌ Bulk bags error:', state.error);
      })
      // Assign bag
      .addCase(assignBag.fulfilled, (state, action) => {
        const index = state.bags.findIndex(bag => bag._id === action.payload._id);
        if (index !== -1) {
          state.bags[index] = action.payload;
        }
        state.success = true;
      });
      // Delete bag
      builder.addCase(deleteBag.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      }).addCase(deleteBag.fulfilled, (state, action) => {
        state.isLoading = false;
        const deletedId = action.payload?._id || action.payload;
        state.bags = state.bags.filter(b => b._id !== deletedId);
        state.total = Math.max(0, (state.total || 0) - 1);
        state.success = true;
      }).addCase(deleteBag.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to delete bag';
      });
  }
});

export const { clearError, clearSuccess, setBags } = bagSlice.actions;
export default bagSlice.reducer;
