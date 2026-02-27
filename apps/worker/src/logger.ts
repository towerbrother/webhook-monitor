import pino from "pino";
import { validateEnv } from "./env.js";

// Use lazy loading for env to avoid early validation issues in tests if modules are imported before mocks
const getEnv = () => {
  try {
    return validateEnv();
  } catch {
    // Fallback for when env vars aren't fully set (e.g. some tests)
    return { NODE_ENV: "test", LOG_LEVEL: "silent" };
  }
};

export const createLogger = (serviceName = "worker") => {
  const env = getEnv();
  const isDev = env.NODE_ENV === "development";

  return pino({
    level: env.LOG_LEVEL || "info",
    base: { service: serviceName },
    redact: {
      paths: ["*.signingSecret", "endpoint.signingSecret"],
      remove: true,
    },
    transport: isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  });
};

export const logger = createLogger();
