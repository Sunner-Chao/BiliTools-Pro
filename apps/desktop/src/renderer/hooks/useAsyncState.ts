import { useState, useCallback, useRef, useEffect } from 'react';

/** State machine: idle → loading → success | error | empty */
export type AsyncState = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export interface AsyncStateResult<T> {
  state: AsyncState;
  data: T | null;
  error: string | null;
  errorField: string | null;
  code: number | null;
  execute: (asyncFn: () => Promise<T>) => Promise<void>;
  reset: () => void;
  setData: (data: T) => void;
}

/**
 * Generic hook for async operations with standardized state machine.
 *
 * The backend returns {ok, data, error, code, errorField?}.
 * The preload unwraps success→data, failure→throws IPCError.
 */
export function useAsyncState<T>(initialData: T | null = null): AsyncStateResult<T> {
  const [state, setState] = useState<AsyncState>('idle');
  const [data, setDataState] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [code, setCode] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (asyncFn: () => Promise<T>) => {
    setState('loading');
    setError(null);
    setErrorField(null);
    setCode(null);
    try {
      const result = await asyncFn();
      if (!mountedRef.current) return;
      const isEmpty = result === null || result === undefined ||
        (Array.isArray(result) && result.length === 0) ||
        (typeof result === 'object' && result !== null && Object.keys(result as object).length === 0);
      setDataState(result);
      setState(isEmpty ? 'empty' : 'success');
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.message || err?.error || 'unknown error');
      setErrorField(err?.errorField || null);
      setCode(err?.code || 500);
      setState('error');
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setDataState(null);
    setError(null);
    setErrorField(null);
    setCode(null);
  }, []);

  const setData = useCallback((newData: T) => {
    setDataState(newData);
    setState(newData === null ? 'empty' : 'success');
  }, []);

  return { state, data, error, errorField, code, execute, reset, setData };
}
