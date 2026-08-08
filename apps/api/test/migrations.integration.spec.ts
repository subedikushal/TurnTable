import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

const execFileAsync = promisify(execFile);

describe('Phase 1 migration paths', () => {
  it('upgrades a Phase 0 database and preserves a valid active owner', async () => {
    const repositoryRoot = resolve(process.cwd(), '../..');
    const temporaryRoot = await mkdtemp(
      resolve(repositoryRoot, 'apps/api/prisma/.phase1-upgrade-test-'),
    );
    const baselineMigrations = resolve(temporaryRoot, 'migrations');
    const baselineDirectory = resolve(baselineMigrations, '20260808000000_phase0_baseline');
    const temporaryConfig = resolve(temporaryRoot, 'prisma.config.ts');
    const postgres = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('turntable')
      .withUsername('turntable')
      .withPassword('turntable')
      .start();
    const databaseUrl = postgres.getConnectionUri();
    const prismaCli = resolve(repositoryRoot, 'node_modules/prisma/build/index.js');
    const runMigration = (config: string) =>
      execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy', '--config', config], {
        cwd: repositoryRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 60_000,
      });

    try {
      await mkdir(baselineDirectory, { recursive: true });
      await copyFile(
        resolve(
          repositoryRoot,
          'apps/api/prisma/migrations/20260808000000_phase0_baseline/migration.sql',
        ),
        resolve(baselineDirectory, 'migration.sql'),
      );
      await copyFile(
        resolve(repositoryRoot, 'apps/api/prisma/migrations/migration_lock.toml'),
        resolve(baselineMigrations, 'migration_lock.toml'),
      );
      await writeFile(
        temporaryConfig,
        `import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(resolve(repositoryRoot, 'apps/api/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(baselineMigrations)} }, datasource: { url: process.env['DATABASE_URL']! } });\n`,
        'utf8',
      );
      await runMigration(temporaryConfig);

      const pool = new Pool({ connectionString: databaseUrl });
      await pool.query(`
        INSERT INTO users (id, oidc_subject, email, display_name, updated_at)
        VALUES ('10000000-0000-4000-8000-000000000099', 'phase0|upgrade-owner',
                'upgrade@turntable.local', 'Upgrade Owner', now());
        INSERT INTO households (id, name, timezone, currency, created_by_user_id, updated_at)
        VALUES ('20000000-0000-4000-8000-000000000099', 'Upgrade Household', 'UTC', 'USD',
                '10000000-0000-4000-8000-000000000099', now());
        INSERT INTO household_memberships
          (id, household_id, user_id, role, status, updated_at)
        VALUES ('30000000-0000-4000-8000-000000000099',
                '20000000-0000-4000-8000-000000000099',
                '10000000-0000-4000-8000-000000000099', 'OWNER', 'ACTIVE', now());
      `);
      await runMigration(resolve(repositoryRoot, 'apps/api/prisma.config.ts'));

      const migrations = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
      );
      expect(migrations.rows[0]?.count).toBe('3');
      const owners = await pool.query<{ count: string }>(`
        SELECT count(*)::text AS count
          FROM household_memberships
         WHERE household_id = '20000000-0000-4000-8000-000000000099'
           AND role = 'OWNER' AND status = 'ACTIVE'
      `);
      expect(owners.rows[0]?.count).toBe('1');
      await pool.end();
    } finally {
      await postgres.stop();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 90_000);
});
