'use strict';

const env = require('../config/env');

const stamp = () => new Date().toISOString();

const write = (level, args) => {
  // Tests stay quiet unless something actually failed.
  if (env.isTest && level !== 'error') return;
  const line = [`[${stamp()}]`, `[${level.toUpperCase()}]`, ...args];
  if (level === 'error') console.error(...line);
  else if (level === 'warn') console.warn(...line);
  else console.log(...line);
};

module.exports = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => (env.isProduction ? undefined : write('debug', args)),
};
