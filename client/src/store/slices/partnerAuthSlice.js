import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import partnerApi from '../../utils/partnerApi';

const getStoredPartner = () => {
  try { return JSON.parse(localStorage.getItem('partnerUser') || 'null'); }
  catch { return null; }
};

export const partnerLogin = createAsyncThunk(
  'partnerAuth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const res = await partnerApi.post('/partner/auth/login', { email, password });
      const { token, partner } = res.data.data;
      localStorage.setItem('partnerToken', token);
      localStorage.setItem('partnerUser', JSON.stringify(partner));
      return { token, partner };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Login failed' });
    }
  }
);

const partnerAuthSlice = createSlice({
  name: 'partnerAuth',
  initialState: {
    partner: getStoredPartner(),
    token: localStorage.getItem('partnerToken'),
    isLoading: false,
    error: null
  },
  reducers: {
    partnerLogout: (state) => {
      state.partner = null;
      state.token = null;
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerUser');
    },
    clearPartnerError: (state) => { state.error = null; },
    updatePartnerProfile: (state, action) => {
      if (state.partner) {
        state.partner = { ...state.partner, ...action.payload };
        localStorage.setItem('partnerUser', JSON.stringify(state.partner));
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(partnerLogin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(partnerLogin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.partner = action.payload.partner;
        state.token = action.payload.token;
      })
      .addCase(partnerLogin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Login failed';
      });
  }
});

export const { partnerLogout, clearPartnerError, updatePartnerProfile } = partnerAuthSlice.actions;
export default partnerAuthSlice.reducer;
