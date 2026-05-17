import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

interface UIState {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  activeMenu: string;
  notifications: Notification[];
}

const savedTheme = typeof window !== 'undefined' ? window.localStorage.getItem('bilitools-theme') : null;

const initialState: UIState = {
  theme: savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light',
  sidebarCollapsed: false,
  activeMenu: 'dashboard',
  notifications: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => { state.theme = action.payload; },
    toggleSidebar: (state) => { state.sidebarCollapsed = !state.sidebarCollapsed; },
    setActiveMenu: (state, action: PayloadAction<string>) => { state.activeMenu = action.payload; },
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp'>>) => {
      state.notifications.push({ ...action.payload, id: Date.now().toString(), timestamp: Date.now() });
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearNotifications: (state) => { state.notifications = []; },
  },
});

export const { setTheme, toggleSidebar, setActiveMenu, addNotification, removeNotification, clearNotifications } = uiSlice.actions;
export default uiSlice.reducer;
