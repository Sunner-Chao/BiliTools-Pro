import React from 'react';
import { Card, Tabs, Layout, Typography } from 'antd';
import { QrcodeOutlined, KeyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../store/hooks';
import { fetchAuthStatus, setAuthenticatedUser } from '../../store/slices/authSlice';
import QRLogin from './QRLogin';
import CookieLogin from './CookieLogin';

const { Content } = Layout;
const { Title } = Typography;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
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
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2}>BiliTools-Pro</Title>
          <Title level={5} type="secondary" style={{ marginTop: -8 }}>请登录您的B站账号</Title>
        </div>
        <Card style={{ width: 400 }}><Tabs items={tabItems} centered /></Card>
      </Content>
    </Layout>
  );
};

export default LoginPage;
