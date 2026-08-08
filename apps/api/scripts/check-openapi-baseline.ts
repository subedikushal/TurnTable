import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';

interface Operation {
  operationId?: string;
  requestBody?: {
    content?: Record<string, { schema?: unknown }>;
  };
  responses?: Record<string, ResponseObject>;
}

interface ResponseObject {
  content?: Record<string, { schema?: unknown }>;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
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
  const addendumText = await readFile(
    resolve(repositoryRoot, 'docs/api/phase0-contract-addendum.yaml'),
    'utf8',
  );
  const phase1AddendumText = await readFile(
    resolve(repositoryRoot, 'docs/api/phase1-contract-addendum.yaml'),
    'utf8',
  );
  const baseline = parse(baselineText) as OpenApiDocument;
  const generated = JSON.parse(generatedText) as OpenApiDocument;
  const addendum = parse(addendumText) as OpenApiDocument;
  const phase1Addendum = parse(phase1AddendumText) as OpenApiDocument;
  const failures: string[] = [];

  for (const [path, pathItem] of Object.entries(generated.paths ?? {})) {
    if (path.startsWith('/health/')) continue;
    const baselinePath = path.startsWith('/v1/') ? path.slice('/v1'.length) : path;
    const baselineItem = baseline.paths?.[baselinePath];
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const baselineOperation =
        baselineItem?.[method] ?? phase1Addendum.paths?.[baselinePath]?.[method];
      if (!baselineOperation) {
        failures.push(`${method.toUpperCase()} ${path} is absent from the normative baseline`);
      } else if (baselineOperation.operationId !== operation.operationId) {
        failures.push(
          `${method.toUpperCase()} ${path} operationId ${operation.operationId ?? '<missing>'} does not match ${baselineOperation.operationId ?? '<missing>'}`,
        );
      }
    }
  }

  const generatedMeSchema =
    generated.paths?.['/v1/me']?.get?.responses?.['200']?.content?.['application/json']?.schema;
  const addendumMeSchema =
    addendum.paths?.['/me']?.get?.responses?.['200']?.content?.['application/json']?.schema;
  if (!generatedMeSchema || !isDeepStrictEqual(generatedMeSchema, addendumMeSchema)) {
    failures.push('GET /v1/me 200 response does not match the Phase 0 contract addendum');
  }

  for (const schemaName of ['UserDto', 'MembershipSummaryDto', 'MeResponseDto']) {
    const generatedSchema = generated.components?.schemas?.[schemaName];
    const addendumSchema = addendum.components?.schemas?.[schemaName];
    if (!generatedSchema || !isDeepStrictEqual(generatedSchema, addendumSchema)) {
      failures.push(`${schemaName} does not match the Phase 0 contract addendum`);
    }
  }

  for (const [path, method] of [
    ['/households/{householdId}/ownership-transfer', 'post'],
    ['/households/{householdId}/members/{memberId}', 'delete'],
  ] as const) {
    const generatedOperation = generated.paths?.[`/v1${path}`]?.[method];
    const correctedOperation = phase1Addendum.paths?.[path]?.[method];
    if (
      !generatedOperation ||
      !correctedOperation ||
      generatedOperation.operationId !== correctedOperation.operationId
    ) {
      failures.push(`${method.toUpperCase()} /v1${path} does not match the Phase 1 correction`);
      continue;
    }
    const generatedRequestSchema =
      generatedOperation.requestBody?.content?.['application/json']?.schema;
    const correctedRequestSchema =
      correctedOperation.requestBody?.content?.['application/json']?.schema;
    if (!isDeepStrictEqual(generatedRequestSchema, correctedRequestSchema)) {
      failures.push(`${method.toUpperCase()} /v1${path} request schema differs from Phase 1`);
    }
    const generatedResponseSchema =
      generatedOperation.responses?.['200']?.content?.['application/json']?.schema;
    const correctedResponseSchema =
      correctedOperation.responses?.['200']?.content?.['application/json']?.schema;
    if (!isDeepStrictEqual(generatedResponseSchema, correctedResponseSchema)) {
      failures.push(`${method.toUpperCase()} /v1${path} response schema differs from Phase 1`);
    }
  }

  for (const schemaName of [
    'TransferOwnershipRequestDto',
    'OwnershipTransferResponseDto',
    'MemberDto',
    'UserDto',
  ]) {
    const generatedSchema = generated.components?.schemas?.[schemaName];
    const correctedSchema = phase1Addendum.components?.schemas?.[schemaName];
    if (!generatedSchema || !isDeepStrictEqual(generatedSchema, correctedSchema)) {
      failures.push(`${schemaName} does not match the Phase 1 contract correction`);
    }
  }

  if (failures.length > 0)
    throw new Error(`OpenAPI baseline compatibility failed:\n${failures.join('\n')}`);
  process.stdout.write(
    'Implemented operations match the normative baseline and Phase 0/Phase 1 contract addenda.\n',
  );
}

void main();
