const NODE_ENV = process.env.NODE_ENV || "development";

interface LogEntry {
  timestamp: string;
  level: string;
  message: any;
}

const formatLog = (level: string, message: any): LogEntry => ({
  timestamp: new Date().toISOString(),
  level,
  message,
});

const logger = {
  info: (message: any, ...args: any[]) => {
    const log = formatLog("INFO", args.length > 0 ? `${message} ${args.join(" ")}` : message);
    console.log(JSON.stringify(log));
  },

  error: (message: any, ...args: any[]) => {
    const log = formatLog("ERROR", args.length > 0 ? `${message} ${args.join(" ")}` : message);
    console.error(JSON.stringify(log));
  },

  warn: (message: any, ...args: any[]) => {
    const log = formatLog("WARN", args.length > 0 ? `${message} ${args.join(" ")}` : message);
    console.warn(JSON.stringify(log));
  },

  debug: (message: any, ...args: any[]) => {
    if (NODE_ENV === "development") {
      const log = formatLog("DEBUG", args.length > 0 ? `${message} ${args.join(" ")}` : message);
      console.log(JSON.stringify(log));
    }
  },
};

export default logger;
