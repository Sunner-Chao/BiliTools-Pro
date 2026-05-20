import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface StreamConfig {
  roomId: string;
  streamKey?: string;
  quality?: string;
  bitrate?: number;
  fps?: number;
  autoRecord?: boolean;
}

interface StreamingState {
  isStreaming: boolean;
  status: 'idle' | 'connecting' | 'waiting' | 'streaming' | 'restarting' | 'ended' | 'error';
  roomId: string | null;
  startedAt: string | null;
  duration: number;
  viewers: number;
  config: StreamConfig | null;
  loading: boolean;
  error: string | null;
}

const initialState: StreamingState = {
  isStreaming: false,
  status: 'idle',
  roomId: null,
  startedAt: null,
  duration: 0,
  viewers: 0,
  config: null,
  loading: false,
  error: null,
};

export const startStreaming = createAsyncThunk('streaming/start', async (config: StreamConfig) => {
  const result = await window.api.streaming.start(config);
  if (result?.success === false || result?.ok === false) throw new Error(result.error || result.message || '启动推流失败');
  return config;
});

export const stopStreaming = createAsyncThunk('streaming/stop', async () => {
  const result = await window.api.streaming.stop();
  if (result?.success === false || result?.ok === false) throw new Error(result.error || result.message || '停止推流失败');
});

export const fetchStreamStatus = createAsyncThunk('streaming/fetchStatus', async () => {
  return await window.api.streaming.getStatus();
});

const streamingSlice = createSlice({
  name: 'streaming',
  initialState,
  reducers: {
    startStreamAction: (state, action: PayloadAction<StreamConfig>) => {
      state.isStreaming = true;
      state.status = 'connecting';
      state.roomId = action.payload.roomId || null;
      state.startedAt = new Date().toISOString();
      state.config = action.payload;
      state.duration = 0;
    },
    stopStreamAction: (state) => {
      state.isStreaming = false;
      state.status = 'idle';
      state.roomId = null;
      state.startedAt = null;
      state.config = null;
      state.duration = 0;
      state.viewers = 0;
    },
    updateDuration: (state, action: PayloadAction<number>) => {
      state.duration = action.payload;
    },
    updateViewers: (state, action: PayloadAction<number>) => {
      state.viewers = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startStreaming.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(startStreaming.fulfilled, (state, action) => {
        state.config = action.payload;
        state.isStreaming = true;
        state.status = 'streaming';
        state.loading = false;
      })
      .addCase(startStreaming.rejected, (state, action) => {
        state.error = action.error.message || '启动推流失败';
        state.loading = false;
      })
      .addCase(stopStreaming.fulfilled, (state) => {
        state.isStreaming = false;
        state.status = 'idle';
        state.config = null;
      })
      .addCase(fetchStreamStatus.fulfilled, (state, action) => {
        state.isStreaming = action.payload.isStreaming;
        state.status = action.payload.status || 'idle';
        state.roomId = action.payload.roomId;
        state.duration = action.payload.duration || 0;
        state.viewers = action.payload.viewers || 0;
      });
  },
});

export const { startStreamAction, stopStreamAction, updateDuration, updateViewers, clearError } = streamingSlice.actions;
export default streamingSlice.reducer;
