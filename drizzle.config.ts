import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'postgresql', schema: './src/server/db/schema.ts',
  out: './migrations', dbCredentials: { url: process.env.DATABASE_URL ||
    'postgres://trace:trace-local@127.0.0.1:54329/trace' } });
