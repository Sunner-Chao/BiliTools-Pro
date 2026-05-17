import React from 'react';
import { Button, Tabs, Tooltip } from 'antd';
import { QrcodeOutlined, KeyOutlined, BulbOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchAuthStatus, setAuthenticatedUser } from '../../store/slices/authSlice';
import { setTheme } from '../../store/slices/uiSlice';
import QRLogin from './QRLogin';
import CookieLogin from './CookieLogin';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);
  const handleLoginSuccess = async (user: any) => {
    if (user) {
      dispatch(setAuthenticatedUser(user));
    }
    await dispatch(fetchAuthStatus()).unwrap();
    navigate('/dashboard');
  };

  const tabItems = [
    { key: 'qr', label: <span><QrcodeOutlined /> 扫码登录</span>, children: <QRLogin onSuccess={handleLoginSuccess} /> },
    { key: 'cookie', label: <span><KeyOutlined /> Cookie登录</span>, children: <CookieLogin onSuccess={handleLoginSuccess} /> },
  ];

  return (
    <div className="bt-login-container">
      <Tooltip title={theme === 'dark' ? '切换到白天模式' : '切换到夜间模式'}>
        <Button
          className="bt-login-theme-toggle"
          type="text"
          shape="circle"
          icon={<BulbOutlined />}
          aria-label="切换主题"
          onClick={() => dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'))}
        />
      </Tooltip>
      <div className="bt-login-card">
        <div className="bt-login-header">
          <div className="bt-login-logo">B</div>
          <div className="bt-login-title">BiliTools Pro</div>
          <div className="bt-login-subtitle">B站游戏资源抢购工具</div>
        </div>
        <div style={{ padding: '0 32px 32px' }}>
          <Tabs items={tabItems} centered />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
