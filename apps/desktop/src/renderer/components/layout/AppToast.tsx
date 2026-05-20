import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { removeToast } from '../../store/slices/uiSlice';

const ICON_MAP = {
  success: { icon: <CheckCircleOutlined />, className: 'bt-toast-success' },
  error: { icon: <CloseCircleOutlined />, className: 'bt-toast-error' },
  warning: { icon: <ExclamationCircleOutlined />, className: 'bt-toast-warning' },
  info: { icon: <InfoCircleOutlined />, className: 'bt-toast-info' },
} as const;

/**
 * Global toast notification layer.
 * Reads from Redux `ui.toasts`, auto-dismisses after `duration` ms.
 * Mounted once in MainLayout — any page can call `dispatch(addToast(...))`.
 */
const AppToast: React.FC = () => {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();

  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const startDismiss = useCallback(
    (id: string) => {
      setLeaving((prev) => new Set(prev).add(id));
      const removeTimer = setTimeout(() => {
        dispatch(removeToast(id));
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
      return removeTimer;
    },
    [dispatch],
  );

  useEffect(() => {
    for (const toast of toasts) {
      if (timersRef.current[toast.id] == null && !leaving.has(toast.id)) {
        const duration = toast.duration || 4000;
        const timer = setTimeout(() => {
          const exitTimer = startDismiss(toast.id);
          timersRef.current[toast.id] = exitTimer;
        }, duration);
        timersRef.current[toast.id] = timer;
      }
    }

    const currentIds = new Set(toasts.map((t) => t.id));
    for (const id of Object.keys(timersRef.current)) {
      if (!currentIds.has(id)) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts, startDismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="bt-toast-stack"
      style={{
        position: 'fixed',
        top: 'var(--bt-space-6)',
        right: 'var(--bt-space-6)',
        zIndex: 'var(--bt-z-toast, 9999)',
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
      aria-label="全局通知"
    >
      {toasts.map((toast) => {
        const { icon, className } = ICON_MAP[toast.type] || ICON_MAP.info;
        const isLeaving = leaving.has(toast.id);

        return (
          <div
            key={toast.id}
            className={`bt-toast ${className} ${isLeaving ? 'bt-toast-leaving' : ''}`}
            style={{ pointerEvents: 'auto' }}
            role="alert"
          >
            <span className="bt-toast-icon" aria-hidden="true">
              {icon}
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
            <button
              type="button"
              onClick={() => {
                clearTimeout(timersRef.current[toast.id]);
                delete timersRef.current[toast.id];
                startDismiss(toast.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--bt-text-disabled)',
                padding: 0,
                fontSize: 'var(--bt-text-md)',
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="关闭通知"
            >
              <CloseOutlined />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default AppToast;
