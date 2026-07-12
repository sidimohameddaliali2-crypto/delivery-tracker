import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

export const fetchEvents = createAsyncThunk(
  'events/fetchEvents',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/events', { params });
      return response.data.events;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch events' });
    }
  }
);

export const createEvent = createAsyncThunk(
  'events/createEvent',
  async (eventData, { rejectWithValue }) => {
    try {
      const response = await api.post('/events', eventData);
      return response.data.event;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create event' });
    }
  }
);

export const updateEvent = createAsyncThunk(
  'events/updateEvent',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/events/${id}`, data);
      return response.data.event;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to update event' });
    }
  }
);

export const deleteEvent = createAsyncThunk(
  'events/deleteEvent',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/events/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to delete event' });
    }
  }
);

export const assignDriver = createAsyncThunk(
  'events/assignDriver',
  async ({ eventId, driverId }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/events/${eventId}/assign-driver`, { driverId });
      return response.data.event;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to assign driver' });
    }
  }
);

const initialState = {
  events: [],
  selectedEvent: null,
  isLoading: false,
  error: null,
  success: false
};

const eventSlice = createSlice({
  name: 'events',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.success = false;
    },
    setSelectedEvent: (state, action) => {
      state.selectedEvent = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Fetch Events
    builder.addCase(fetchEvents.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(fetchEvents.fulfilled, (state, action) => {
      state.isLoading = false;
      state.events = action.payload;
    });
    builder.addCase(fetchEvents.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload?.error || action.payload?.message || action.error.message;
    });

    // Create Event
    builder.addCase(createEvent.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(createEvent.fulfilled, (state, action) => {
      state.isLoading = false;
      state.events.push(action.payload);
      state.success = true;
    });
    builder.addCase(createEvent.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload?.error || action.payload?.message || action.error.message;
    });

    // Update Event
    builder.addCase(updateEvent.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(updateEvent.fulfilled, (state, action) => {
      state.isLoading = false;
      const index = state.events.findIndex((e) => e._id === action.payload._id);
      if (index >= 0) {
        state.events[index] = action.payload;
      }
      if (state.selectedEvent?._id === action.payload._id) {
        state.selectedEvent = action.payload;
      }
      state.success = true;
    });
    builder.addCase(updateEvent.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload?.error || action.payload?.message || action.error.message;
    });

    // Delete Event
    builder.addCase(deleteEvent.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(deleteEvent.fulfilled, (state, action) => {
      state.isLoading = false;
      state.events = state.events.filter((e) => e._id !== action.payload);
      state.success = true;
    });
    builder.addCase(deleteEvent.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload?.error || action.payload?.message || action.error.message;
    });

    // Assign Driver
    builder.addCase(assignDriver.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(assignDriver.fulfilled, (state, action) => {
      state.isLoading = false;
      const index = state.events.findIndex((e) => e._id === action.payload._id);
      if (index >= 0) {
        state.events[index] = action.payload;
      }
      if (state.selectedEvent?._id === action.payload._id) {
        state.selectedEvent = action.payload;
      }
      state.success = true;
    });
    builder.addCase(assignDriver.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload?.error || action.payload?.message || action.error.message;
    });
  }
});

export const { clearError, clearSuccess, setSelectedEvent } = eventSlice.actions;
export default eventSlice.reducer;
