import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ProtocolMapper {
  protocolMapper?: string;
  config?: Record<string, string>;
}

interface RealmClient {
  clientId?: string;
  publicClient?: boolean;
  bearerOnly?: boolean;
  standardFlowEnabled?: boolean;
  implicitFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
  serviceAccountsEnabled?: boolean;
  redirectUris?: string[];
  webOrigins?: string[];
  defaultClientScopes?: string[];
  protocolMappers?: ProtocolMapper[];
}

interface RealmImport {
  realm?: string;
  enabled?: boolean;
  clients?: RealmClient[];
  users?: unknown[];
}

const realmPath = resolve(process.cwd(), '../../infra/docker/keycloak/turntable-realm.json');
const realm = JSON.parse(readFileSync(realmPath, 'utf8')) as RealmImport;

function client(clientId: string): RealmClient {
  const value = realm.clients?.find((candidate) => candidate.clientId === clientId);
  if (!value) throw new Error(`Missing Keycloak client ${clientId}`);
  return value;
}

function expectSecureUserFlow(value: RealmClient): void {
  expect(value.standardFlowEnabled).toBe(true);
  expect(value.implicitFlowEnabled).toBe(false);
  expect(value.directAccessGrantsEnabled).toBe(false);
  expect(value.serviceAccountsEnabled).toBe(false);
  expect(value.defaultClientScopes).toContain('basic');
  expect(value.protocolMappers).toContainEqual(
    expect.objectContaining({
      protocolMapper: 'oidc-audience-mapper',
      config: expect.objectContaining({
        'included.custom.audience': 'urn:turntable:api:local',
        'access.token.claim': 'true',
      }),
    }),
  );
}

describe('Keycloak realm import', () => {
  it('defines only the intended realm and clients without committed users', () => {
    expect(realm.realm).toBe('turntable');
    expect(realm.enabled).toBe(true);
    expect(realm.users).toBeUndefined();
    expect(realm.clients?.map((value) => value.clientId).sort()).toEqual([
      'turntable-api',
      'turntable-mobile',
      'turntable-web',
    ]);
  });

  it('uses confidential PKCE web login and public PKCE mobile login', () => {
    const web = client('turntable-web');
    const mobile = client('turntable-mobile');

    expect(web.publicClient).toBe(false);
    expect(web.redirectUris).toEqual(['http://localhost:3001/auth/callback']);
    expect(web.webOrigins).toEqual(['http://localhost:3001']);
    expectSecureUserFlow(web);

    expect(mobile.publicClient).toBe(true);
    expect(mobile.redirectUris).toEqual(['turntable://auth/callback']);
    expectSecureUserFlow(mobile);
  });

  it('keeps the API client bearer-only with all credential flows disabled', () => {
    const api = client('turntable-api');
    expect(api.bearerOnly).toBe(true);
    expect(api.standardFlowEnabled).toBe(false);
    expect(api.implicitFlowEnabled).toBe(false);
    expect(api.directAccessGrantsEnabled).toBe(false);
    expect(api.serviceAccountsEnabled).toBe(false);
  });
});
