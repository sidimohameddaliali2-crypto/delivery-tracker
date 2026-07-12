import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

export const uploadDeliveryChanges = createAsyncThunk(
  'deliveryChange/upload',
  async (formData, { rejectWithValue }) => {
    try {
      const response = await api.post('/delivery-changes/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Upload failed' });
    }
  }
);

export const createDeliveryChange = createAsyncThunk(
  'deliveryChange/create',
  async (changeData, { rejectWithValue }) => {
    try {
      const response = await api.post('/delivery-changes/manual', changeData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create delivery change' });
    }
  }
);
export const fetchDeliveryChanges = createAsyncThunk(
  'deliveryChange/fetch',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });
      
      const response = await api.get(`/delivery-changes?${params}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch changes' });
    }
  }
);

export const processPendingChanges = createAsyncThunk(
  'deliveryChange/processPending',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/delivery-changes/process-pending');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to process pending changes' });
    }
  }
);

const deliveryChangeSlice = createSlice({
  name: 'deliveryChange',
  initialState: {
    changes: [],
    isLoading: false,
    uploadResult: null,
    error: null
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearUploadResult: (state) => {
      state.uploadResult = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Upload changes
      .addCase(uploadDeliveryChanges.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(uploadDeliveryChanges.fulfilled, (state, action) => {
        state.isLoading = false;
        state.uploadResult = action.payload;
      })
      .addCase(createDeliveryChange.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createDeliveryChange.fulfilled, (state, action) => {
        state.isLoading = false;
        const newChanges = [];
        if (action.payload?.changes?.length) {
          newChanges.push(...action.payload.changes);
        } else if (action.payload?.change) {
          newChanges.push(action.payload.change);
        }
        newChanges.forEach((change) => {
          state.changes.unshift(change);
        });
      })
      .addCase(createDeliveryChange.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
      })
      .addCase(uploadDeliveryChanges.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
      })
      // Fetch changes
      .addCase(fetchDeliveryChanges.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDeliveryChanges.fulfilled, (state, action) => {
        state.isLoading = false;
        state.changes = action.payload.changes;
      })
      .addCase(fetchDeliveryChanges.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
      })
      // Process pending
      .addCase(processPendingChanges.fulfilled, (state, action) => {
        // You might want to refresh the changes list here
        console.log('Processed pending changes:', action.payload);
      });
  }
});

export const { clearError, clearUploadResult } = deliveryChangeSlice.actions;
export default deliveryChangeSlice.reducer;