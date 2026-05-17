import React from 'react';
import { useAppSelector } from '../../store/hooks';

const StatusBar: React.FC = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const isStreaming = useAppSelector((state) => state.streaming.isStreaming);
  const activeTasks = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="bt-status-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className={`bt-badge ${isAuthenticated ? 'bt-badge-success' : 'bt-badge-idle'}`}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          {isAuthenticated ? '已登录' : '未登录'}
        </span>
        <span style={{ color: 'var(--bt-text-secondary)', fontSize: '12px' }}>
          任务: <span style={{ color: 'var(--bt-text-primary)', fontWeight: 600 }}>{activeTasks}</span>/{tasks.length}
        </span>
        {isStreaming && (
          <span className="bt-badge bt-badge-error">
            <span className="bt-pulse" />
            推流中
          </span>
        )}
      </div>
      <span style={{ color: 'var(--bt-text-disabled)', fontSize: '12px' }}>BiliTools-Pro v1.0.0</span>
    </div>
  );
};

export default StatusBar;
