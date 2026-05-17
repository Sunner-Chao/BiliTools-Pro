import React from 'react';
import { Layout, Space, Avatar, Dropdown, Badge } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';

const { Header: AntHeader } = Layout;

const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const notifications = useAppSelector((state) => state.ui.notifications);

  const userMenuItems = [
    { key: 'settings', icon: <SettingOutlined />, label: '设置' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => dispatch(logout()) },
  ];

  return (
    <AntHeader style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxShadow: '0 1px 4px rgba(0, 21, 41, 0.08)' }}>
      <Space size="large">
        <Badge count={notifications.length} size="small">
          <BellOutlined style={{ fontSize: '18px', cursor: 'pointer', color: '#666' }} />
        </Badge>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              icon={<UserOutlined />}
              src={user?.avatar ? <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer" /> : undefined}
            />
            <span>{user?.name || '未登录'}</span>
            {user?.mid ? <span style={{ color: '#999' }}>UID {user.mid}</span> : null}
            {user?.roomId ? <span style={{ color: '#999' }}>房间 {user.roomId}</span> : null}
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};

export default Header;
