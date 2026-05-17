import React from 'react';
import { Layout } from 'antd';
import {
  DashboardOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
  MessageOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { toggleSidebar, setActiveMenu } from '../../store/slices/uiSlice';

const { Sider } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/tasks', icon: <ThunderboltOutlined />, label: '任务管理' },
  { key: '/streaming', icon: <VideoCameraOutlined />, label: '直播推流' },
  { key: '/daily', icon: <MessageOutlined />, label: '每日任务' },
  { key: '/analytics', icon: <BarChartOutlined />, label: '数据分析' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const theme = useAppSelector((state) => state.ui.theme);

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={() => dispatch(toggleSidebar())}
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'sticky',
        left: 0,
        top: 0,
        bottom: 0,
        borderRight: '1px solid var(--bt-glass-border)',
        background: 'var(--bt-bg-elevated)',
      }}
      width={220}
      theme={theme}
    >
      {/* Brand */}
      <div className="bt-sidebar-brand">
        <div className="bt-sidebar-logo">B</div>
        {!collapsed && <span className="bt-sidebar-title">BiliTools Pro</span>}
      </div>
      {/* Menu */}
      <div style={{ padding: '8px' }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                dispatch(setActiveMenu(item.key));
                navigate(item.key);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: collapsed ? '10px 0' : '10px 16px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--bt-primary)' : 'var(--bt-text-secondary)',
                background: isActive ? 'rgba(129,140,248,0.1)' : 'transparent',
                transition: 'all 200ms',
                marginBottom: '2px',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bt-bg-overlay)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--bt-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--bt-text-secondary)';
                }
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '25%',
                    bottom: '25%',
                    width: '3px',
                    background: 'var(--bt-primary)',
                    borderRadius: '0 3px 3px 0',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </Sider>
  );
};

export default Sidebar;
