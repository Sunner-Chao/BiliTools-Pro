import React, { useEffect, useRef, useState } from 'react';
import { Row, Col, Tag, Progress, Space, Empty } from 'antd';
import { PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, VideoCameraOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';

// ── State machine types ──────────────────────────────────────────────────────
type DataState = 'idle' | 'loading' | 'error' | 'success';

interface DashboardStats {
  running: number;
  completed: number;
  pending: number;
  streaming: 'live' | 'idle';
  roomId: string;
  duration: number;
  viewers: number;
}

const DashboardSkeleton: React.FC = () => (
  <div className="bt-page-skeleton" aria-label="加载中" role="status">
    <div className="bt-page-header">
      <div className="bt-page-header-bar" aria-hidden="true" />
      <div>
        <div className="bt-skeleton" style={{ width: 220, height: 28, borderRadius: 6 }} />
        <div className="bt-skeleton" style={{ width: 160, height: 16, marginTop: 4, borderRadius: 4 }} />
      </div>
    </div>
    <div className="bt-skeleton-stats">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`bt-skeleton-stat bt-skeleton bt-stagger-${i + 1}`} />
      ))}
    </div>
    <div className="bt-dashboard-skeleton-main">
      <div className="bt-dashboard-skeleton-card bt-skeleton bt-stagger-5" />
      <div className="bt-dashboard-skeleton-card bt-skeleton bt-stagger-6" />
    </div>
  </div>
);

// ── Stat card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, delay }) => (
  <div
    className={`bt-stat-card bt-animate-slide-up bt-stagger-${delay}`}
    aria-label={`${title}: ${value}`}
  >
    {/* Gradient glow overlay */}
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${color}10, transparent)` }} />
    {/* Top hairline */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
    <div className="bt-stat-card-inner">
      <span className="bt-stat-card-label">{title}</span>
      <div className="bt-stat-icon" style={{ background: `${color}12`, color }} aria-hidden="true">{icon}</div>
    </div>
    <div className="bt-stat-card-value" style={{ color }}>{value}</div>
  </div>
);

// ── Log entry renderer ───────────────────────────────────────────────────────
const renderLogEntry = (log: any, idx: number, taskId?: string) => {
  const levelColor: Record<string, string> = { error: 'var(--bt-error)', warning: 'var(--bt-warning)', success: 'var(--bt-success)' };
  return (
    <div key={`${taskId || 'log'}-${idx}`} className="bt-log-entry">
      <span className="bt-log-time">{log.time}</span>
      <Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'gold' : log.level === 'success' ? 'green' : 'blue'} className="bt-log-level">{log.level}</Tag>
      <span className="bt-log-message" style={{ color: levelColor[log.level] || 'var(--bt-text-secondary)' }}>{log.message}</span>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const streaming = useAppSelector((state) => state.streaming);
  const user = useAppSelector((state) => state.auth.user);

  // ── State machine ──────────────────────────────────────────────────────────
  const [state, setState] = useState<DataState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setState('loading');
    // Transition to success/empty based on actual data availability
    const timeout = setTimeout(() => {
      setState(tasks.length > 0 ? 'success' : 'empty');
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);
  // Reactive transition: when tasks arrive, promote to success
  useEffect(() => {
    if (state === 'loading' && tasks.length > 0) {
      setState('success');
    }
  }, [tasks, state]);

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  const isStreaming = streaming.isStreaming;
  const streamStats: DashboardStats = {
    running: runningTasks.length,
    completed: completedTasks.length,
    pending: pendingTasks.length,
    streaming: isStreaming ? 'live' : 'idle',
    roomId: streaming.roomId || '-',
    duration: streaming.duration || 0,
    viewers: streaming.viewers || 0,
  };

  if (state === 'loading') return <DashboardSkeleton />;

  const stats: StatCardProps[] = [
    { title: '运行中任务', value: streamStats.running, icon: <PlayCircleOutlined />, color: 'var(--bt-primary)', delay: 1 },
    { title: '已完成任务', value: streamStats.completed, icon: <CheckCircleOutlined />, color: 'var(--bt-success)', delay: 2 },
    { title: '等待中任务', value: streamStats.pending, icon: <ClockCircleOutlined />, color: 'var(--bt-warning)', delay: 3 },
    { title: '推流状态', value: isStreaming ? '直播中' : '未直播', icon: <VideoCameraOutlined />, color: isStreaming ? 'var(--bt-success)' : 'var(--bt-text-disabled)', delay: 4 },
  ];

  const taskLogs = (runningTasks[0] as any)?.logs || [];

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" aria-hidden="true" />
        <div>
          <h1>欢迎回来, {user?.name || '用户'}</h1>
          <p>当前运行状态总览</p>
        </div>
      </div>

      {/* Stats row — skeleton or real data */}
      <Row gutter={16} style={{ marginBottom: 24 }} role="list" aria-label="统计数据卡片">
        {stats.map((stat, i) => (
          <Col xs={24} sm={12} md={6} key={stat.title} role="listitem">
            <StatCard {...stat} />
          </Col>
        ))}
      </Row>

      <Row gutter={16} role="region" aria-label="任务与推流详情">
        {/* Running tasks */}
        <Col xs={24} md={12}>
          <div className="bt-glass-card" style={{ padding: 20 }}>
            <div className="bt-section-heading" role="heading" aria-level={3}>
              <div className="bt-section-heading-bar" style={{ background: 'var(--bt-primary)' }} aria-hidden="true" />
              <h3 className="bt-stat-card-label" style={{ margin: 0 }}>运行中的任务</h3>
            </div>
            {runningTasks.length === 0 ? (
              <div className="bt-empty-state" role="status">
                <PlayCircleOutlined className="bt-empty-state-icon" aria-hidden="true" />
                <p className="bt-empty-state-text">暂无运行中的任务</p>
                <p className="bt-empty-state-hint">前往任务管理页面创建新任务</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} role="list" aria-label="运行中任务列表">
                {runningTasks.map((task, i) => (
                  <div
                    key={task.id}
                    className={`bt-task-item bt-animate-slide-up bt-stagger-${Math.min(i + 1, 6)}`}
                    role="listitem"
                  >
                    <div className="bt-task-item-header">
                      <span className="bt-task-item-name" title={task.config?.name || task.id}>{task.config?.name || task.id}</span>
                      <Tag color="processing" aria-label={`状态: 运行中`}>{task.config?.type || 'auto'}</Tag>
                    </div>
                    <Progress percent={task.progress} size="small" aria-label={`进度 ${task.progress}%`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Col>

        {/* Streaming info */}
        <Col xs={24} md={12}>
          <div className="bt-glass-card" style={{ padding: 20 }}>
            <div className="bt-section-heading" role="heading" aria-level={3}>
              <div className="bt-section-heading-bar" style={{ background: 'var(--bt-success)' }} aria-hidden="true" />
              <h3 className="bt-stat-card-label" style={{ margin: 0 }}>推流信息</h3>
              {isStreaming && (
                <span className="bt-badge bt-badge-running" style={{ marginLeft: 'auto' }} aria-live="polite">
                  <span className="bt-pulse" aria-hidden="true" />
                  直播中
                </span>
              )}
            </div>
            {isStreaming ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {[
                  { label: '房间号', value: streamStats.roomId },
                  { label: '时长', value: `${streamStats.duration}s` },
                  { label: '观众', value: streamStats.viewers },
                ].map((row) => (
                  <div key={row.label} className="bt-stream-status-row" role="listitem">
                    <span className="bt-stream-status-label">{row.label}</span>
                    <span className="bt-stream-status-value">{row.value}</span>
                  </div>
                ))}
              </Space>
            ) : (
              <div className="bt-empty-state" role="status">
                <VideoCameraOutlined className="bt-empty-state-icon" aria-hidden="true" />
                <p className="bt-empty-state-text">当前未在推流</p>
                <p className="bt-empty-state-hint">前往直播推流页面启动推流任务</p>
              </div>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
