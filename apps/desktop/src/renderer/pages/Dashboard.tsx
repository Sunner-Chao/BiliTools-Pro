import React from 'react';
import { Row, Col, Tag, Progress, Space } from 'antd';
import { PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';

const Dashboard: React.FC = () => {
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const streaming = useAppSelector((state) => state.streaming);
  const user = useAppSelector((state) => state.auth.user);

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  const stats = [
    {
      title: '运行中任务',
      value: runningTasks.length,
      icon: <PlayCircleOutlined />,
      color: 'var(--bt-primary)',
      gradient: 'rgba(129,140,248,0.08)',
    },
    {
      title: '已完成任务',
      value: completedTasks.length,
      icon: <CheckCircleOutlined />,
      color: 'var(--bt-success)',
      gradient: 'rgba(52,211,153,0.08)',
    },
    {
      title: '等待中任务',
      value: pendingTasks.length,
      icon: <ClockCircleOutlined />,
      color: 'var(--bt-warning)',
      gradient: 'rgba(251,191,36,0.08)',
    },
    {
      title: '推流状态',
      value: streaming.isStreaming ? '直播中' : '未直播',
      icon: <VideoCameraOutlined />,
      color: streaming.isStreaming ? 'var(--bt-success)' : 'var(--bt-text-disabled)',
      gradient: streaming.isStreaming ? 'rgba(52,211,153,0.08)' : 'rgba(139,148,158,0.06)',
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" />
        <div>
          <h1>欢迎回来, {user?.name || '用户'}</h1>
          <p>当前运行状态总览</p>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat) => (
          <Col span={6} key={stat.title}>
            <div className="bt-stat-card" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(135deg, ${stat.gradient}, transparent)`,
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                background: `linear-gradient(90deg, transparent, ${stat.color}40, transparent)`,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative' }}>
                <span style={{
                  fontSize: 11, color: 'var(--bt-text-secondary)', fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {stat.title}
                </span>
                <div className="bt-stat-icon" style={{ background: `${stat.color}10`, color: stat.color, ring: `1px solid ${stat.color}15` }}>
                  {stat.icon}
                </div>
              </div>
              <div style={{
                fontSize: stat.value === '直播中' || stat.value === '未直播' ? 20 : 28,
                fontWeight: 700, color: stat.color, position: 'relative',
              }}>
                {stat.value}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <div className="bt-glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--bt-primary)' }} />
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--bt-text-primary)', margin: 0 }}>运行中的任务</h3>
            </div>
            {runningTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bt-text-disabled)', fontSize: 14 }}>
                暂无运行中的任务
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {runningTasks.map((task) => (
                  <div key={task.id} style={{
                    padding: '12px 16px', borderRadius: 12,
                    background: 'rgba(129,140,248,0.04)',
                    border: '1px solid rgba(129,140,248,0.1)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500, fontSize: 14 }}>
                        {task.config?.name || task.id}
                      </span>
                      <Tag color="processing">{task.config?.type || 'auto'}</Tag>
                    </div>
                    <Progress percent={task.progress} size="small" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Col>
        <Col span={12}>
          <div className="bt-glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--bt-success)' }} />
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--bt-text-primary)', margin: 0 }}>推流信息</h3>
            </div>
            {streaming.isStreaming ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bt-glass-border)' }}>
                  <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>房间号</span>
                  <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500 }}>{streaming.roomId || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bt-glass-border)' }}>
                  <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>时长</span>
                  <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500 }}>{streaming.duration}s</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>观众</span>
                  <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500 }}>{streaming.viewers}</span>
                </div>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <span className="bt-badge bt-badge-error">
                    <span className="bt-pulse" />
                    直播中
                  </span>
                </div>
              </Space>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bt-text-disabled)', fontSize: 14 }}>
                当前未在推流
              </div>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
