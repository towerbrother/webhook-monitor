import { z } from "zod";

const envSchema = z.object({
  PORT: z
    .string()
    .default("3001")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: "PORT must be a valid port number (1-65535)",
    }),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
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
