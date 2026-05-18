import { contextBridge, ipcRenderer } from 'electron';

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  system: {
    getPlatform: () => ipcRenderer.invoke('system:getPlatform'),
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    selectVideoFile: () => ipcRenderer.invoke('system:selectVideoFile'),
  },
  auth: {
    loginByQR: () => ipcRenderer.invoke('auth:loginByQR'),
    checkQRStatus: (qrKey: string) => ipcRenderer.invoke('auth:checkQRStatus', qrKey),
    loginByCookie: (cookie: string) => ipcRenderer.invoke('auth:loginByCookie', cookie),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:getStatus'),
  },
  tasks: {
    create: (config: unknown) => ipcRenderer.invoke('tasks:create', config),
    start: (taskId: string) => ipcRenderer.invoke('tasks:start', taskId),
    stop: (taskId: string) => ipcRenderer.invoke('tasks:stop', taskId),
    delete: (taskId: string) => ipcRenderer.invoke('tasks:delete', taskId),
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (taskId: string) => ipcRenderer.invoke('tasks:get', taskId),
    games: () => ipcRenderer.invoke('tasks:games'),
    gameTasks: (game: string) => ipcRenderer.invoke('tasks:gameTasks', game),
    refreshGameConfig: (game: string, url?: string) => ipcRenderer.invoke('tasks:refreshGameConfig', game, url),
    resources: () => ipcRenderer.invoke('tasks:resources'),
    overview: (game: string, sourceUrl?: string) => ipcRenderer.invoke('tasks:overview', game, sourceUrl),
    stocks: (game: string, taskIds?: string[]) => ipcRenderer.invoke('tasks:stocks', game, taskIds),
  },
  streaming: {
    start: (config: unknown) => ipcRenderer.invoke('streaming:start', config),
    stop: () => ipcRenderer.invoke('streaming:stop'),
    getStatus: () => ipcRenderer.invoke('streaming:getStatus'),
  },
  daily: {
    status: () => ipcRenderer.invoke('daily:status'),
    audienceQR: (slot: number) => ipcRenderer.invoke('daily:audienceQR', slot),
    checkAudienceQRStatus: (qrKey: string) => ipcRenderer.invoke('daily:checkAudienceQRStatus', qrKey),
    saveAudienceCookie: (slot: number, cookie: string) => ipcRenderer.invoke('daily:saveAudienceCookie', slot, cookie),
    validateAudience: (slot: number) => ipcRenderer.invoke('daily:validateAudience', slot),
    wallet: (slot: number) => ipcRenderer.invoke('daily:wallet', slot),
    rechargeQR: (slot?: number) => ipcRenderer.invoke('daily:rechargeQR', slot),
    rechargePanel: (slot: number, roomId?: string) => ipcRenderer.invoke('daily:rechargePanel', slot, roomId),
    createRechargeOrder: (slot: number, roomId: string, option: unknown, confirm?: boolean) => ipcRenderer.invoke('daily:createRechargeOrder', slot, roomId, option, confirm),
    queryRechargeOrder: (slot: number, orderId: string) => ipcRenderer.invoke('daily:queryRechargeOrder', slot, orderId),
    enterLiveRoom: (slot: number, roomId: string, durationMinutes?: number) => ipcRenderer.invoke('daily:enterLiveRoom', slot, roomId, durationMinutes),
    sendDanmaku: (slot: number, roomId: string, message?: string) => ipcRenderer.invoke('daily:sendDanmaku', slot, roomId, message),
    sendGift: (slot: number, roomId: string) => ipcRenderer.invoke('daily:sendGift', slot, roomId),
  },
  analytics: {
    summary: () => ipcRenderer.invoke('analytics:summary'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (values: unknown) => ipcRenderer.invoke('settings:save', values),
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => { ipcRenderer.removeListener(channel, subscription); };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type API = typeof api;
