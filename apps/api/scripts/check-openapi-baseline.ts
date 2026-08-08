import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';

interface Operation {
  operationId?: string;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, Operation>>;
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const baselineText = await readFile(
    resolve(repositoryRoot, 'TurnTable_Coding_Handoff_Package/04a_TurnTable_OpenAPI_3.1.yaml'),
    'utf8',
  );
  const generatedText = await readFile(
    resolve(repositoryRoot, 'docs/api/openapi.generated.json'),
    'utf8',
  );
  const baseline = parse(baselineText) as OpenApiDocument;
  const generated = JSON.parse(generatedText) as OpenApiDocument;
  const failures: string[] = [];

  for (const [path, pathItem] of Object.entries(generated.paths ?? {})) {
    if (path.startsWith('/health/')) continue;
    const baselinePath = path.startsWith('/v1/') ? path.slice('/v1'.length) : path;
    const baselineItem = baseline.paths?.[baselinePath];
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const baselineOperation = baselineItem?.[method];
      if (!baselineOperation) {
        failures.push(`${method.toUpperCase()} ${path} is absent from the normative baseline`);
      } else if (baselineOperation.operationId !== operation.operationId) {
        failures.push(
          `${method.toUpperCase()} ${path} operationId ${operation.operationId ?? '<missing>'} does not match ${baselineOperation.operationId ?? '<missing>'}`,
        );
      }
    }
  }

  if (failures.length > 0)
    throw new Error(`OpenAPI baseline compatibility failed:\n${failures.join('\n')}`);
  process.stdout.write(
    'Implemented OpenAPI operations are compatible with the normative baseline.\n',
  );
}

void main();
