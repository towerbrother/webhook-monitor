import pino from "pino";
import type { Env } from "./env.js";

export function createLogger(env: Env) {
  const isDevelopment = env.NODE_ENV === "development";

  return pino({
    level: env.LOG_LEVEL,
    base: { service: "worker" },
    redact: {
      paths: ["*.signingSecret", "endpoint.signingSecret"],
      remove: true,
    },
    transport: isDevelopment
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
