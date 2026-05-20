import { addContext, configure, getLogger as _getLogger } from 'loguru';

export function getLogger(name: string) {
  addContext({ module: name });
  return _getLogger();
}

export function setupMainLogger(): void {
  configure({
    interceptConsole: true,
    level: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
  });
}