import { useCallback } from 'react';
import { useAppDispatch } from '../store/hooks';
import { addToast } from '../store/slices/uiSlice';
import type { Toast } from '../store/slices/uiSlice';

type ToastInput = Omit<Toast, 'id'>;

/**
 * Convenience hook for dispatching toast notifications.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('操作成功');
 *   toast.error('操作失败');
 *   toast.warning('请检查输入');
 *   toast.info('正在处理...', { duration: 2000 });
 */
export function useToast() {
  const dispatch = useAppDispatch();

  const show = useCallback(
    (type: Toast['type'], message: string, opts?: Partial<Pick<ToastInput, 'duration'>>) => {
      dispatch(addToast({ type, message, duration: opts?.duration ?? 4000 }));
    },
    [dispatch],
  );

  const success = useCallback((message: string, duration?: number) => show('success', message, { duration }), [show]);
  const error = useCallback((message: string, duration?: number) => show('error', message, { duration }), [show]);
  const warning = useCallback((message: string, duration?: number) => show('warning', message, { duration }), [show]);
  const info = useCallback((message: string, duration?: number) => show('info', message, { duration }), [show]);

  return { success, error, warning, info, show };
}
