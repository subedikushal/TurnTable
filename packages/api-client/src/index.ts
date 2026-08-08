import createClient from 'openapi-fetch';
import type { paths } from './generated/schema.js';

export type { components, operations, paths } from './generated/schema.js';

export function createTurnTableClient(baseUrl: string, bearerToken?: string) {
  return createClient<paths>({
    baseUrl,
    ...(bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : {}),
  });
}
