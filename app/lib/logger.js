export function createLogger(context = {}) {
  return {
    info: (message, data = {}) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        message,
        context,
        ...data
      }));
    },
    error: (message, error = null, data = {}) => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message,
        context,
        error: error?.message,
        stack: error?.stack,
        ...data
      }));
    },
    warn: (message, data = {}) => {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        message,
        context,
        ...data
      }));
    }
  };
}
