import React from 'react';
import { Layout, Space, Tag } from 'antd';
import { useAppSelector } from '../../store/hooks';

const { Footer } = Layout;

const StatusBar: React.FC = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const isStreaming = useAppSelector((state) => state.streaming.isStreaming);
  const activeTasks = tasks.filter((t) => t.status === 'running').length;

  return (
    <Footer style={{ padding: '8px 24px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9', display: 'flex', justifyContent: 'space-between' }}>
      <Space>
        <Tag color={isAuthenticated ? 'green' : 'default'}>{isAuthenticated ? '已登录' : '未登录'}</Tag>
        <span style={{ color: '#666', fontSize: '12px' }}>任务: {activeTasks}/{tasks.length}</span>
        {isStreaming && <Tag color="red">推流中</Tag>}
      </Space>
      <span style={{ color: '#999', fontSize: '12px' }}>BiliTools-Pro v1.0.0</span>
    </Footer>
  );
};

export default StatusBar;