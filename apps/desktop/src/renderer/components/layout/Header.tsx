import React, { useEffect, useState } from 'react';
import { Avatar, Dropdown, Badge, Button, Tooltip, Drawer, List, Tag, Empty } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SettingOutlined, BulbOutlined, CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { setTheme, removeNotification } from '../../store/slices/uiSlice';

const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const notifications = useAppSelector((state) => state.ui.notifications);
  const theme = useAppSelector((state) => state.ui.theme);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const getTagColor = (type: string) => {
    const map: Record<string, string> = { success: 'green', info: 'blue', warning: 'gold', error: 'red' };
    return map[type] || 'default';
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

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
          <BellOutlined
            style={{ fontSize: '16px', cursor: 'pointer', color: 'var(--bt-text-secondary)', transition: 'color 200ms' }}
            onClick={() => setDrawerOpen(true)}
          />
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
      <Drawer
        title="通知中心"
        placement="right"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width={360}
        extra={
          notifications.length > 0 && (
            <Button type="link" size="small" onClick={() => notifications.forEach((n) => dispatch(removeNotification(n.id)))}>
              清空全部
            </Button>
          )
        }
      >
        {notifications.length === 0 ? (
          <Empty description="暂无通知" style={{ marginTop: 80 }} />
        ) : (
          <List
            dataSource={[...notifications].reverse()}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                actions={[<Button type="link" size="small" icon={<CloseOutlined />} onClick={() => dispatch(removeNotification(item.id))} />]}
              >
                <List.Item.Meta
                  title={<Tag color={getTagColor(item.type)} style={{ marginBottom: 0 }}>{item.type === 'success' ? '成功' : item.type === 'warning' ? '警告' : item.type === 'error' ? '错误' : '信息'}</Tag>}
                  description={<><div style={{ color: 'var(--bt-text-primary)' }}>{item.message}</div><div style={{ color: 'var(--bt-text-disabled)', fontSize: 11 }}>{formatTime(item.timestamp)}</div></>}
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
};

export default Header;
