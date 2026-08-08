import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl && !process.argv.includes('generate')) {
  throw new Error('DATABASE_URL is required for Prisma migration commands');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl ?? 'postgresql://generate-only:generate-only@127.0.0.1:1/generate-only',
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
