import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env['APP_ENV'] ??= 'test';
process.env['DATABASE_URL'] ??= 'postgresql://turntable:turntable@localhost:5432/turntable';
process.env['REDIS_URL'] ??= 'redis://localhost:6379';
process.env['AUTH_MODE'] ??= 'development';
process.env['DEV_AUTH_SECRET'] ??= 'turntable-development-secret-at-least-32-characters';
process.env['OIDC_AUDIENCE'] ??= 'turntable-api';

async function main(): Promise<void> {
  const { createApiApplication, createOpenApiDocument } = await import('../src/bootstrap.js');
  const outputDirectory = resolve(process.cwd(), '../../docs/api');
  const outputPath = resolve(outputDirectory, 'openapi.generated.json');
  const app = await createApiApplication({ initialize: false });
  const document = createOpenApiDocument(app);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
}

void main();
