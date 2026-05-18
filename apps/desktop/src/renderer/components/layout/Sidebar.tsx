import React from 'react';
import { Tooltip } from 'antd';
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

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/tasks', icon: <ThunderboltOutlined />, label: '任务管理' },
  { key: '/streaming', icon: <VideoCameraOutlined />, label: '直播推流' },
  { key: '/daily', icon: <MessageOutlined />, label: '每日任务' },
  { key: '/analytics', icon: <BarChartOutlined />, label: '数据分析' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

interface SidebarProps {
  mobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileDrawerOpen, onMobileDrawerClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);

  const handleNav = (key: string) => {
    dispatch(setActiveMenu(key));
    navigate(key);
    // Close mobile drawer after navigation
    if (mobileDrawerOpen && onMobileDrawerClose) {
      onMobileDrawerClose();
    }
  };

  const sidebarClass = [
    'bt-sidebar',
    collapsed ? 'bt-sidebar--collapsed' : 'bt-sidebar--expanded',
  ].filter(Boolean).join(' ');

  return (
    <div className={sidebarClass} role="navigation">
      {/* Brand */}
      <div className="bt-sidebar-brand" role="banner">
        <div className="bt-sidebar-logo" aria-hidden="true">B</div>
        {!collapsed && <span className="bt-sidebar-title">BiliTools Pro</span>}
      </div>
      <nav className="bt-sidebar-nav" aria-label="主导航">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.key;
          const className = [
            'bt-nav-item',
            collapsed ? 'bt-nav-item--collapsed' : '',
            isActive ? 'bt-nav-item--active' : '',
          ].filter(Boolean).join(' ');

          const button = (
            <button
              key={item.key}
              className={className}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleNav(item.key)}
            >
              <span className="bt-nav-item-icon">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && <span className="bt-nav-item-indicator" aria-hidden="true" />}
            </button>
          );

          return collapsed ? (
            <Tooltip key={item.key} title={item.label} placement="right">
              {button}
            </Tooltip>
          ) : button;
        })}
      </nav>
    </div>
  );
};

export default Sidebar;
