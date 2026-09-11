import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import memberApi from '../../utils/memberApi';

const getStoredMember = () => {
  try { return JSON.parse(localStorage.getItem('memberUser') || 'null'); }
  catch { return null; }
};

export const memberRegister = createAsyncThunk(
  'memberAuth/register',
  async ({ inviteToken, name, email, dietaryExclusions }, { rejectWithValue }) => {
    try {
      const res = await memberApi.post('/member/auth/register', { inviteToken, name, email, dietaryExclusions });
      const { token, member } = res.data.data;
      localStorage.setItem('memberToken', token);
      localStorage.setItem('memberUser', JSON.stringify(member));
      localStorage.setItem('memberInvitePath', `/join/${inviteToken}`);
      return { token, member };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Registration failed' });
    }
  }
);

export const memberLogin = createAsyncThunk(
  'memberAuth/login',
  async ({ inviteToken, email }, { rejectWithValue }) => {
    try {
      const res = await memberApi.post('/member/auth/login', { inviteToken, email });
      const { token, member } = res.data.data;
      localStorage.setItem('memberToken', token);
      localStorage.setItem('memberUser', JSON.stringify(member));
      localStorage.setItem('memberInvitePath', `/join/${inviteToken}`);
      return { token, member };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Login failed' });
    }
  }
);

const memberAuthSlice = createSlice({
  name: 'memberAuth',
  initialState: {
    member: getStoredMember(),
    token: localStorage.getItem('memberToken'),
    isLoading: false,
    error: null
  },
  reducers: {
    memberLogout: (state) => {
      state.member = null;
      state.token = null;
      localStorage.removeItem('memberToken');
      localStorage.removeItem('memberUser');
    },
    clearMemberError: (state) => { state.error = null; },
    updateMemberProfile: (state, action) => {
      if (state.member) {
        state.member = { ...state.member, ...action.payload };
        localStorage.setItem('memberUser', JSON.stringify(state.member));
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(memberRegister.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(memberRegister.fulfilled, (state, action) => {
        state.isLoading = false;
        state.member = action.payload.member;
        state.token = action.payload.token;
      })
      .addCase(memberRegister.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Registration failed';
      })
      .addCase(memberLogin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(memberLogin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.member = action.payload.member;
        state.token = action.payload.token;
      })
      .addCase(memberLogin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Login failed';
      });
  }
});

export const { memberLogout, clearMemberError, updateMemberProfile } = memberAuthSlice.actions;
export default memberAuthSlice.reducer;
