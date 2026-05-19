import { contextBridge, ipcRenderer } from 'electron';

// ── Standardized IPC envelope unwrapper ───────────────────────────────────────
// Backend now returns: {id, result: {ok, data, error, code, errorField?}}
// We unwrap here so renderer code sees clean data/errors.

interface IPCEnvelope {
  ok: boolean;
  data: unknown;
  error: string | null;
  code: number;
  errorField?: string;
}

class IPCError extends Error {
  code: number;
  errorField?: string;
  constructor(msg: string, code: number, errorField?: string) {
    super(msg);
    this.name = 'IPCError';
    this.code = code;
    this.errorField = errorField;
  }
}

function unwrapIPC(raw: any): any {
  // Main-process handlers usually return the backend envelope directly:
  // { ok, data, error, code, errorField? }
  if (raw && typeof raw === 'object' && 'ok' in raw && 'data' in raw) {
    const envelope: IPCEnvelope = raw;
    if (envelope.ok) return envelope.data;
    const err = new IPCError(envelope.error || 'Unknown error', envelope.code, envelope.errorField);
    throw err;
  }

  // Handle legacy format (already unwrapped or plain data)
  if (raw && typeof raw === 'object' && !('id' in raw && 'result' in raw)) {
    return raw;
  }
  const envelope: IPCEnvelope = raw?.result ?? { ok: false, data: null, error: 'Invalid IPC response', code: 500 };
  if (envelope.ok) return envelope.data;
  const err = new IPCError(envelope.error || 'Unknown error', envelope.code, envelope.errorField);
  throw err;
}

function ipcInvoke(channel: string, ...args: unknown[]) {
  return ipcRenderer.invoke(channel, ...args).then(unwrapIPC);
}

const api = {
  window: {
    minimize: () => ipcInvoke('window:minimize'),
    maximize: () => ipcInvoke('window:maximize'),
    close: () => ipcInvoke('window:close'),
  },
  system: {
    getPlatform: () => ipcInvoke('system:getPlatform'),
    getVersion: () => ipcInvoke('system:getVersion'),
    openExternal: (url: string) => ipcInvoke('system:openExternal', url),
    selectVideoFile: () => ipcInvoke('system:selectVideoFile'),
  },
  auth: {
    loginByQR: () => ipcInvoke('auth:loginByQR'),
    checkQRStatus: (qrKey: string) => ipcInvoke('auth:checkQRStatus', qrKey),
    loginByCookie: (cookie: string) => ipcInvoke('auth:loginByCookie', cookie),
    logout: () => ipcInvoke('auth:logout'),
    getStatus: () => ipcInvoke('auth:getStatus'),
  },
  tasks: {
    create: (config: unknown) => ipcInvoke('tasks:create', config),
    start: (taskId: string) => ipcInvoke('tasks:start', taskId),
    stop: (taskId: string) => ipcInvoke('tasks:stop', taskId),
    delete: (taskId: string) => ipcInvoke('tasks:delete', taskId),
    list: () => ipcInvoke('tasks:list'),
    get: (taskId: string) => ipcInvoke('tasks:get', taskId),
    games: () => ipcInvoke('tasks:games'),
    gameTasks: (game: string) => ipcInvoke('tasks:gameTasks', game),
    refreshGameConfig: (game: string, url?: string) => ipcInvoke('tasks:refreshGameConfig', game, url),
    resources: () => ipcInvoke('tasks:resources'),
    overview: (game: string, sourceUrl?: string) => ipcInvoke('tasks:overview', game, sourceUrl),
    stocks: (game: string, taskIds?: string[]) => ipcInvoke('tasks:stocks', game, taskIds),
  },
  streaming: {
    start: (config: unknown) => ipcInvoke('streaming:start', config),
    stop: () => ipcInvoke('streaming:stop'),
    getStatus: () => ipcInvoke('streaming:getStatus'),
  },
  daily: {
    status: () => ipcInvoke('daily:status'),
    audienceQR: (slot: number) => ipcInvoke('daily:audienceQR', slot),
    checkAudienceQRStatus: (qrKey: string) => ipcInvoke('daily:checkAudienceQRStatus', qrKey),
    saveAudienceCookie: (slot: number, cookie: string) => ipcInvoke('daily:saveAudienceCookie', slot, cookie),
    validateAudience: (slot: number) => ipcInvoke('daily:validateAudience', slot),
    wallet: (slot: number) => ipcInvoke('daily:wallet', slot),
    rechargeQR: (slot?: number) => ipcInvoke('daily:rechargeQR', slot),
    rechargePanel: (slot: number, roomId?: string) => ipcInvoke('daily:rechargePanel', slot, roomId),
    createRechargeOrder: (slot: number, roomId: string, option: unknown, confirm?: boolean) => ipcInvoke('daily:createRechargeOrder', slot, roomId, option, confirm),
    queryRechargeOrder: (slot: number, orderId: string) => ipcInvoke('daily:queryRechargeOrder', slot, orderId),
    enterLiveRoom: (slot: number, roomId: string, durationMinutes?: number, mode?: string) => ipcInvoke('daily:enterLiveRoom', slot, roomId, durationMinutes, mode),
    sendDanmaku: (slot: number, roomId: string, message?: string) => ipcInvoke('daily:sendDanmaku', slot, roomId, message),
    sendGift: (slot: number, roomId: string) => ipcInvoke('daily:sendGift', slot, roomId),
  },
  analytics: {
    summary: () => ipcInvoke('analytics:summary'),
  },
  settings: {
    get: () => ipcInvoke('settings:get'),
    save: (values: unknown) => ipcInvoke('settings:save', values),
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => { ipcRenderer.removeListener(channel, subscription); };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type API = typeof api;
