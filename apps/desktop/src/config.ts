const configuredPort = Number(process.env.BILITOOLS_IPC_PORT || process.env.BILITOOLS_BACKEND_PORT || '');

export const config = {
  backend: {
    host: process.env.BILITOOLS_IPC_HOST || '127.0.0.1',
    port: Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3847,
  },
  app: {
    name: 'BiliTools-Pro',
    version: '1.0.0',
  },
} as const;
