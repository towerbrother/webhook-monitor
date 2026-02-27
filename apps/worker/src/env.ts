import { z } from "zod";
import dotenv from "dotenv";

// Load .env file
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z
    .string()
    .default("6379")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: "REDIS_PORT must be a valid port number (1-65535)",
    }),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  // If running in test, allow skip if env vars are mocked later (though usually best to mock before)
  // But here, we just want to ensure it parses correctly.

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // In test environment, don't exit process, just throw error so tests can catch/mock if needed
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    if (process.env.NODE_ENV === "test") {
      throw new Error(`Environment validation failed: ${result.error.message}`);
    }

    console.error("❌ Environment validation failed:");
    console.error("");
    result.error.issues.forEach((issue) => {
      console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
    });
    console.error("");
    console.error("Please check your environment variables and try again.");
    process.exit(1);
  }

  return result.data;
}
