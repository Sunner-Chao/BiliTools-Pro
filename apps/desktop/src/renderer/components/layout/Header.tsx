import React from 'react';
import { Avatar, Dropdown, Badge, Button, Tooltip } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SettingOutlined, BulbOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { setTheme } from '../../store/slices/uiSlice';

const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const notifications = useAppSelector((state) => state.ui.notifications);
  const theme = useAppSelector((state) => state.ui.theme);

  const userMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: () => dispatch(logout()),
    },
  ];

  return (
    <div className="bt-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <Tooltip title={theme === 'dark' ? '切换到白天模式' : '切换到夜间模式'}>
          <Button
            type="text"
            shape="circle"
            icon={<BulbOutlined />}
            aria-label="切换主题"
            onClick={() => dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'))}
            style={{ color: 'var(--bt-text-secondary)' }}
          />
        </Tooltip>
        <Badge count={notifications.length} size="small">
          <BellOutlined style={{ fontSize: '16px', cursor: 'pointer', color: 'var(--bt-text-secondary)', transition: 'color 200ms' }} />
        </Badge>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <div className="bt-header-user">
            <Avatar
              size={32}
              icon={<UserOutlined />}
              src={user?.avatar ? <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer" style={{ borderRadius: '50%' }} /> : undefined}
              style={{ background: 'linear-gradient(135deg, var(--bt-primary-active), var(--bt-primary))' }}
            />
            <div style={{ lineHeight: 1.3 }}>
              <div className="bt-header-user-name">{user?.name || '未登录'}</div>
              {user?.mid && <div className="bt-header-user-meta">UID {user.mid}</div>}
            </div>
          </div>
        </Dropdown>
      </div>
    </div>
  );
};

export default Header;
