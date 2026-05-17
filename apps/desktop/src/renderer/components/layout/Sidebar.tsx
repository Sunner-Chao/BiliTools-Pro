import React from 'react';
import { Layout, Menu } from 'antd';
import { DashboardOutlined, ThunderboltOutlined, VideoCameraOutlined, MessageOutlined, BarChartOutlined, SettingOutlined } from '@ant-design/icons';
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

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={() => dispatch(toggleSidebar())}
      style={{ overflow: 'auto', height: '100vh', position: 'sticky', left: 0, top: 0, bottom: 0 }}
      width={200}
    >
      <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: collapsed ? '16px' : '20px', fontWeight: 'bold' }}>
          {collapsed ? 'BT' : 'BiliTools-Pro'}
        </h1>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={(info) => {
          dispatch(setActiveMenu(info.key));
          navigate(info.key);
        }}
      />
    </Sider>
  );
};

export default Sidebar;
