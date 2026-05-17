import React from 'react';
import { Card, Row, Col, Statistic, List, Tag, Space, Progress } from 'antd';
import { VideoCameraOutlined, PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';

const Dashboard: React.FC = () => {
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const streaming = useAppSelector((state) => state.streaming);
  const user = useAppSelector((state) => state.auth.user);

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  return (
    <div style={{ padding: 24 }}>
      <h1>欢迎回来, {user?.name || '用户'}</h1>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card><Statistic title="运行中任务" value={runningTasks.length} prefix={<PlayCircleOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="已完成任务" value={completedTasks.length} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="等待中任务" value={pendingTasks.length} prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="推流状态"
              value={streaming.isStreaming ? '直播中' : '未直播'}
              prefix={<VideoCameraOutlined />}
              valueStyle={{ color: streaming.isStreaming ? '#52c41a' : '#999' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="运行中的任务">
            {runningTasks.length === 0 ? (
              <p style={{ color: '#999' }}>暂无运行中的任务</p>
            ) : (
              <List
                dataSource={runningTasks}
                renderItem={(task) => (
                  <List.Item>
                    <List.Item.Meta
                      title={task.config?.name || task.id}
                      description={
                        <Space direction="vertical">
                          <Progress percent={task.progress} size="small" />
                          <Tag color="blue">{task.config?.type || 'auto'}</Tag>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="推流信息">
            {streaming.isStreaming ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>房间号: {streaming.roomId || '-'}</div>
                <div>时长: {streaming.duration}s</div>
                <div>观众: {streaming.viewers}</div>
                <Tag color="red">直播中</Tag>
              </Space>
            ) : (
              <p style={{ color: '#999' }}>当前未在推流</p>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;