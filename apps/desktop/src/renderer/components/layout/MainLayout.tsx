import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';

const { Content } = Layout;

const MainLayout: React.FC = () => (
  <Layout style={{ minHeight: '100vh', background: 'var(--bt-bg-base)' }}>
    <Sidebar />
    <Layout style={{ background: 'transparent' }}>
      <Header />
      <Content style={{
        margin: '16px',
        padding: '24px',
        background: 'transparent',
        overflow: 'auto',
        minHeight: 'calc(100vh - 112px)',
      }}
        className="bt-main-bg"
      >
        <Outlet />
      </Content>
      <StatusBar />
    </Layout>
  </Layout>
);

export default MainLayout;
