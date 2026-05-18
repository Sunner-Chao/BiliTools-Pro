import React from 'react';
import { useAppSelector } from '../../store/hooks';

const StatusBar: React.FC = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const isStreaming = useAppSelector((state) => state.streaming.isStreaming);
  const activeTasks = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="bt-status-bar">
      <div className="bt-status-left">
        <span className={`bt-badge ${isAuthenticated ? 'bt-badge-success' : 'bt-badge-idle'}`}>
          <span className="bt-status-dot" />
          {isAuthenticated ? '已登录' : '未登录'}
        </span>
        <span className="bt-status-task-info">
          任务: <span className="bt-status-count">{activeTasks}</span>/{tasks.length}
        </span>
        {isStreaming && (
          <span className="bt-badge bt-badge-error">
            <span className="bt-pulse" />
            推流中
          </span>
        )}
      </div>
      <span className="bt-status-version">BiliTools-Pro v1.0.0</span>
    </div>
  );
};

export default StatusBar;
