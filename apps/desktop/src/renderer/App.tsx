import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './components/login/LoginPage';
import { Dashboard, TasksPage, StreamingPage, SettingsPage, DailyTasksPage, AnalyticsPage } from './pages';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { fetchAuthStatus } from './store/slices/authSlice';

function App() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const loading = useAppSelector((state) => state.auth.loading);

  useEffect(() => { dispatch(fetchAuthStatus()); }, [dispatch]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>加载中...</div>;

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
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
}

export default App;
