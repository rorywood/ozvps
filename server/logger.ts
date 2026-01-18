/**
 * Structured Logging Module
 * Provides consistent, machine-parseable logging for all server components
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  duration?: number;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ENV_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[ENV_LOG_LEVEL];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatForConsole(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const levelEmoji: Record<LogLevel, string> = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
  };

  let output = `${time} ${levelEmoji[entry.level]} [${entry.source}] ${entry.message}`;

  if (entry.duration !== undefined) {
    output += ` (${entry.duration}ms)`;
  }

  if (entry.data && Object.keys(entry.data).length > 0) {
    output += ` ${JSON.stringify(entry.data)}`;
  }

  return output;
}

function writeLog(entry: LogEntry): void {
  if (IS_PRODUCTION) {
    // JSON output for log aggregation in production
    console.log(JSON.stringify(entry));
  } else {
    // Human-readable output for development
    const formatted = formatForConsole(entry);
    if (entry.level === 'error') {
      console.error(formatted);
    } else if (entry.level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }
}

/**
 * Main logging function
 */
export function log(
  message: string,
  source = 'app',
  options: {
    level?: LogLevel;
    data?: Record<string, unknown>;
    requestId?: string;
    userId?: string;
    duration?: number;
  } = {}
): void {
  const level = options.level || 'info';

  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    source,
    message,
    ...(options.data && { data: options.data }),
    ...(options.requestId && { requestId: options.requestId }),
    ...(options.userId && { userId: options.userId }),
    ...(options.duration !== undefined && { duration: options.duration }),
  };

  writeLog(entry);
}

/**
 * Convenience methods for different log levels
 */
export const logger = {
  debug(message: string, source = 'app', data?: Record<string, unknown>) {
    log(message, source, { level: 'debug', data });
  },

  info(message: string, source = 'app', data?: Record<string, unknown>) {
    log(message, source, { level: 'info', data });
  },

  warn(message: string, source = 'app', data?: Record<string, unknown>) {
    log(message, source, { level: 'warn', data });
  },

  error(message: string, source = 'app', data?: Record<string, unknown>) {
    log(message, source, { level: 'error', data });
  },

  /**
   * Log an HTTP request with timing
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    options?: { userId?: string; requestId?: string }
  ) {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    log(`${method} ${path} ${statusCode}`, 'http', {
      level,
      duration,
      data: { method, path, statusCode },
      ...options,
    });
  },

  /**
   * Log an error with stack trace
   */
  exception(error: Error, source = 'app', data?: Record<string, unknown>) {
    log(error.message, source, {
      level: 'error',
      data: {
        ...data,
        errorName: error.name,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      },
    });
  },
};

/**
 * Create a child logger with a fixed source
 */
export function createLogger(source: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => logger.debug(message, source, data),
    info: (message: string, data?: Record<string, unknown>) => logger.info(message, source, data),
    warn: (message: string, data?: Record<string, unknown>) => logger.warn(message, source, data),
    error: (message: string, data?: Record<string, unknown>) => logger.error(message, source, data),
    exception: (error: Error, data?: Record<string, unknown>) => logger.exception(error, source, data),
  };
}
