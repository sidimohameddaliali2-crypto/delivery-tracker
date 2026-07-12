import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

// Async thunks
export const fetchDrivers = createAsyncThunk(
  'drivers/fetchDrivers',
  async ({ includeInactive = true, search } = {}, { rejectWithValue }) => {
    try {
      console.log('�Y"" Fetching drivers from /api/users/drivers', { includeInactive, search });

      const params = new URLSearchParams();
      if (includeInactive) {
        params.append('includeInactive', 'true');
      }
      if (search) {
        params.append('search', search);
      }

      const query = params.toString();
      const response = await api.get(`/users/drivers${query ? `?${query}` : ''}`);

      console.log('�o. Drivers API response:', response.data);

      const driversData = response.data.data || response.data.drivers || response.data || [];
      console.log(`�o. Found ${driversData.length} drivers`);

      return driversData;
    } catch (error) {
      console.error('�?O Error fetching drivers:', error);
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch drivers' });
    }
  }
);

export const createDriver = createAsyncThunk(
  'drivers/createDriver',
  async (driverData, { rejectWithValue }) => {
    try {
      const response = await api.post('/users/drivers', driverData);
      return response.data.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create driver' });
    }
  }
);

export const updateDriver = createAsyncThunk(
  'drivers/updateDriver',
  async ({ id, driverData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/users/drivers/${id}`, driverData);
      return response.data.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to update driver' });
    }
  }
);

export const toggleDriverStatus = createAsyncThunk(
  'drivers/toggleDriverStatus',
  async ({ id, isActive }, { rejectWithValue }) => {
    try {
      await api.patch(`/users/drivers/${id}/status`, { isActive });
      return { id, isActive };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to update driver status' });
    }
  }
);

export const fetchDriverById = createAsyncThunk(
  'drivers/fetchDriverById',
  async (driverId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/users/drivers/${driverId}`);
      return response.data.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch driver details' });
    }
  }
);

const driverSlice = createSlice({
  name: 'drivers',
  initialState: {
    drivers: [],
    driverLocations: [],
    currentDriver: null,
    isLoading: false,
    error: null,
    success: false,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.success = false;
    },
    setCurrentDriver: (state, action) => {
      state.currentDriver = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch drivers
      .addCase(fetchDrivers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDrivers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.drivers = Array.isArray(action.payload) ? action.payload : [];
        console.log(`�o. Stored ${state.drivers.length} drivers in Redux state`);
      })
      .addCase(fetchDrivers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to fetch drivers';
        console.error('�?O Driver fetch error:', state.error);
      })
      // Create driver
      .addCase(createDriver.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(createDriver.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          const newDriver = action.payload;
          if (!Array.isArray(state.drivers)) {
            state.drivers = [];
          }
          const exists = state.drivers.find(driver => driver._id === newDriver._id);
          if (exists) {
            Object.assign(exists, newDriver);
          } else {
            state.drivers.push(newDriver);
          }
        }
        state.success = true;
      })
      .addCase(createDriver.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to create driver';
      })
      // Fetch driver by ID
      .addCase(fetchDriverById.fulfilled, (state, action) => {
        state.currentDriver = action.payload;
      })
      // Update driver
      .addCase(updateDriver.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.success = false;
      })
      .addCase(updateDriver.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          const updatedDriver = action.payload;
          const index = state.drivers.findIndex((driver) => driver._id === updatedDriver._id);
          if (index !== -1) {
            state.drivers[index] = updatedDriver;
          } else if (state.drivers) {
            state.drivers.push(updatedDriver);
          } else {
            state.drivers = [updatedDriver];
          }
        }
        state.success = true;
      })
      .addCase(updateDriver.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Failed to update driver';
      })
      .addCase(fetchDriverLocations.pending, (state) => {
  state.isLoading = true;
  state.error = null;
})
.addCase(fetchDriverLocations.fulfilled, (state, action) => {
  state.isLoading = false;
  state.driverLocations = action.payload;
})
.addCase(fetchDriverLocations.rejected, (state, action) => {
  state.isLoading = false;
  state.error = action.payload?.message || 'Failed to fetch driver locations';
})
.addCase(updateDriverLocation.fulfilled, (state, action) => {
  const driverId = action.payload?.driverId || action.meta.arg.driverId;
  const location = action.payload?.location;
  if (!driverId || !location) {
    return;
  }

  const existingIndex = state.driverLocations.findIndex(driver => driver._id === driverId);
  if (existingIndex !== -1) {
    state.driverLocations[existingIndex] = {
      ...state.driverLocations[existingIndex],
      ...action.payload?.driver,
      location
    };
  } else {
    state.driverLocations.push(
      action.payload?.driver || {
        _id: driverId,
        location
      }
    );
  }
})
      // Toggle driver status
      .addCase(toggleDriverStatus.fulfilled, (state, action) => {
        const { id, isActive } = action.payload;
        const driver = state.drivers.find((d) => d._id === id);
        if (driver) {
          driver.isActive = isActive;
        }
        state.success = true;
      });
  },
});

// Add this async thunk to your existing driverSlice
export const fetchDriverLocations = createAsyncThunk(
  'drivers/fetchDriverLocations',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users/drivers/locations');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch driver locations' });
    }
  }
);

export const updateDriverLocation = createAsyncThunk(
  'drivers/updateDriverLocation',
  async ({ driverId, location }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/users/drivers/${driverId}/location`, location);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to update driver location' });
    }
  }
);

// Add to your initialState


// Add to your extraReducers



export const { clearError, clearSuccess, setCurrentDriver } = driverSlice.actions;
export default driverSlice.reducer;
