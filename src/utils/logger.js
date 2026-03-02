function serializeMeta(meta = {}) {
  if (meta instanceof Error) {
    return { message: meta.message, stack: meta.stack, name: meta.name };
  }

  if (!meta || typeof meta !== 'object') {
    return { value: meta };
  }

  const sanitized = { ...meta };
  if (typeof sanitized.authorization === 'string') sanitized.authorization = '[REDACTED]';
  if (typeof sanitized.token === 'string') sanitized.token = '[REDACTED]';
  if (typeof sanitized.password === 'string') sanitized.password = '[REDACTED]';

  return sanitized;
}

function write(level, message, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...serializeMeta(meta),
  };

  if (process.env.NODE_ENV === 'production') {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  const details = Object.keys(meta || {}).length ? ` ${JSON.stringify(serializeMeta(meta))}` : '';
  process.stdout.write(`[${payload.ts}] ${level.toUpperCase()} ${message}${details}\n`);
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
