import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

type TaskType = 'grab_code' | 'daily_task' | 'live_milestone';
type GameType = 'genshin' | 'starrail' | 'zzz' | 'wutheringwaves';
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export interface TaskConfig {
  type: TaskType;
  game: GameType;
  name?: string;
  targetTime?: Date;
  interval?: number;
  maxRetries?: number;
  autoStop?: boolean;
}

export interface Task {
  id: string;
  config: TaskConfig;
  status: TaskStatus;
  progress: number;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string;
}

interface TasksState {
  tasks: Task[];
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: TasksState = {
  tasks: [],
  selectedTaskId: null,
  loading: false,
  error: null,
};

export const fetchTasks = createAsyncThunk('tasks/fetchAll', async () => {
  const result = await window.api.tasks.list();
  return result.tasks || [];
});

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    selectTask: (state, action: PayloadAction<string | null>) => {
      state.selectedTaskId = action.payload;
    },
    updateTaskStatus: (state, action: PayloadAction<{ taskId: string; status: TaskStatus; progress?: number }>) => {
      const task = state.tasks.find(t => t.id === action.payload.taskId);
      if (task) {
        task.status = action.payload.status;
        if (action.payload.progress !== undefined) task.progress = action.payload.progress;
      }
    },
    clearError: (state) => {
      state.error = null;
    },
    setTasks: (state, action: PayloadAction<Task[]>) => {
      state.tasks = action.payload;
    },
    addTask: (state, action: PayloadAction<Task>) => {
      state.tasks.push(action.payload);
    },
    startTask: (state, action: PayloadAction<string>) => {
      const task = state.tasks.find(t => t.id === action.payload);
      if (task) task.status = 'running';
    },
    stopTask: (state, action: PayloadAction<string>) => {
      const task = state.tasks.find(t => t.id === action.payload);
      if (task) task.status = 'stopped';
    },
    removeTask: (state, action: PayloadAction<string>) => {
      state.tasks = state.tasks.filter(t => t.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTasks.pending, (state) => { state.loading = true; })
      .addCase(fetchTasks.fulfilled, (state, action) => { state.tasks = action.payload; state.loading = false; })
      .addCase(fetchTasks.rejected, (state) => { state.loading = false; });
  },
});

export const { selectTask, updateTaskStatus, clearError, setTasks, addTask, startTask, stopTask, removeTask } = tasksSlice.actions;
export default tasksSlice.reducer;