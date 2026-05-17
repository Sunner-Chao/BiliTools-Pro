import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './components/login/LoginPage';
import { Dashboard, TasksPage, StreamingPage, SettingsPage, DailyTasksPage, AnalyticsPage } from './pages';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { fetchAuthStatus } from './store/slices/authSlice';

function App() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const loading = useAppSelector((state) => state.auth.loading);
  const uiTheme = useAppSelector((state) => state.ui.theme);

  useEffect(() => { dispatch(fetchAuthStatus()); }, [dispatch]);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    window.localStorage.setItem('bilitools-theme', uiTheme);
  }, [uiTheme]);

  const routes = loading ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--bt-text-primary)' }}>加载中...</div>
  ) : !isAuthenticated ? (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  ) : (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="streaming" element={<StreamingPage />} />
        <Route path="daily" element={<DailyTasksPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: uiTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: uiTheme === 'dark' ? '#818cf8' : '#6366f1',
          colorBgContainer: uiTheme === 'dark' ? '#0d1117' : '#ffffff',
          colorBgElevated: uiTheme === 'dark' ? '#161b22' : '#ffffff',
          colorBgLayout: uiTheme === 'dark' ? '#070a0e' : '#f8fafc',
          colorBorder: uiTheme === 'dark' ? '#21262d' : '#e2e8f0',
          colorText: uiTheme === 'dark' ? '#f0f6fc' : '#0f172a',
          colorTextSecondary: uiTheme === 'dark' ? '#8b949e' : '#64748b',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: 'var(--bt-bg-base)',
            headerBg: 'var(--bt-bg-elevated)',
            siderBg: 'var(--bt-bg-elevated)',
          },
        },
      }}
    >
      {routes}
    </ConfigProvider>
  );
}

export default App;
