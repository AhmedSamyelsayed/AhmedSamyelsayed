import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_URL: z.url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(import.meta.env);

export const envError = parsed.success
  ? null
  : 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy apps/web/.env.example to apps/web/.env.local.';

export const env = parsed.success
  ? parsed.data
  : {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'missing',
      VITE_APP_URL: 'http://localhost:5173',
    };
