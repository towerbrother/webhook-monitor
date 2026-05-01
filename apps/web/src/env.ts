import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
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
    throw new Error("Invalid environment variables");
  }

  return result.data;
}
