import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';

const { Content } = Layout;

const MainLayout: React.FC = () => (
  <Layout style={{ minHeight: '100vh' }}>
    <Sidebar />
    <Layout>
      <Header />
      <Content style={{ margin: '16px', padding: '24px', background: '#fff', borderRadius: '8px', overflow: 'auto', minHeight: 'calc(100vh - 112px)' }}>
        <Outlet />
      </Content>
      <StatusBar />
    </Layout>
  </Layout>
);

export default MainLayout;