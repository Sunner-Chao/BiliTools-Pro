import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

interface UserInfo {
  mid: number;
  uid?: number;
  name: string;
  avatar: string;
  level: number;
  roomId?: number | string | null;
  csrf?: string;
  vipStatus?: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
};

export const fetchAuthStatus = createAsyncThunk('auth/fetchStatus', async () => {
  return await window.api.auth.getStatus();
});

export const loginByQR = createAsyncThunk('auth/loginByQR', async () => {
  const result = await window.api.auth.loginByQR();
  if (!result.success) throw new Error(result.error || '登录失败');
  return result.user;
});

export const loginByCookie = createAsyncThunk('auth/loginByCookie', async (cookie: string) => {
  const result = await window.api.auth.loginByCookie(cookie);
  if (!result.success) throw new Error(result.error || '登录失败');
  return result.user;
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await window.api.auth.logout();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    setAuthenticatedUser: (state, action: PayloadAction<UserInfo>) => {
      state.isAuthenticated = true;
      state.user = action.payload;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuthStatus.pending, (state) => { state.loading = true; })
      .addCase(fetchAuthStatus.fulfilled, (state, action) => {
        state.isAuthenticated = action.payload.isAuthenticated;
        state.user = action.payload.user;
        state.loading = false;
      })
      .addCase(fetchAuthStatus.rejected, (state) => { state.loading = false; })
      .addCase(loginByQR.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginByQR.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(loginByQR.rejected, (state, action) => {
        state.error = action.error.message || 'QR登录失败';
        state.loading = false;
      })
      .addCase(loginByCookie.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginByCookie.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(loginByCookie.rejected, (state, action) => {
        state.error = action.error.message || 'Cookie登录失败';
        state.loading = false;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.user = null;
      });
  },
});

export const { clearError, setAuthenticatedUser } = authSlice.actions;
export default authSlice.reducer;
