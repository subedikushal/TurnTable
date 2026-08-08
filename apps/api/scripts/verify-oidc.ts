import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface CallbackResult {
  code: string;
  state: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

async function loadDiscovery(issuer: string): Promise<DiscoveryDocument> {
  const discoveryUrl = new URL('.well-known/openid-configuration', `${issuer.replace(/\/$/, '')}/`);
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`OIDC discovery returned ${response.status}`);
  }

  const document = (await response.json()) as Partial<DiscoveryDocument>;
  for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof document[field] !== 'string') {
      throw new Error(`OIDC discovery omitted ${field}`);
    }
  }
  if (document.issuer !== issuer) {
    throw new Error(`Configured issuer ${issuer} does not exactly match ${document.issuer}`);
  }

  return document as DiscoveryDocument;
}

async function verifyJwks(document: DiscoveryDocument): Promise<number> {
  const response = await fetch(document.jwks_uri);
  if (!response.ok) throw new Error(`OIDC JWKS returned ${response.status}`);
  const body = (await response.json()) as { keys?: unknown[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('OIDC JWKS contains no signing keys');
  }
  return body.keys.length;
}

function waitForCallback(server: Server, redirectUri: URL, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        reject(new Error('Timed out waiting for OIDC login callback'));
        server.close();
      },
      5 * 60 * 1000,
    );

    server.on('request', (request, response) => {
      const requestUrl = new URL(request.url ?? '/', redirectUri.origin);
      if (requestUrl.pathname !== redirectUri.pathname) {
        response.writeHead(404).end('Not found');
        return;
      }

      const error = requestUrl.searchParams.get('error');
      if (error) {
        const description = requestUrl.searchParams.get('error_description') ?? error;
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end(description);
        clearTimeout(timeout);
        reject(new Error(`OIDC login failed: ${description}`));
        server.close();
        return;
      }

      const result: CallbackResult = {
        code: requestUrl.searchParams.get('code') ?? '',
        state: requestUrl.searchParams.get('state') ?? '',
      };
      if (!result.code || result.state !== expectedState) {
        response
          .writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          .end('Invalid OIDC callback');
        clearTimeout(timeout);
        reject(new Error('OIDC callback code or state is invalid'));
        server.close();
        return;
      }

      response
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end('<h1>TurnTable OIDC verification complete</h1><p>You may close this window.</p>');
      clearTimeout(timeout);
      resolve(result.code);
      server.close();
    });
  });
}

async function exchangeCode(
  document: DiscoveryDocument,
  code: string,
  verifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret?: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: clientId,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch(document.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const result = (await response.json()) as TokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(
      `OIDC token exchange failed: ${result.error_description ?? result.error ?? response.status}`,
    );
  }
  return result.access_token;
}

async function main(): Promise<void> {
  const issuer = required('OIDC_ISSUER_URL');
  const audience = required('OIDC_AUDIENCE');
  const document = await loadDiscovery(issuer);
  const signingKeyCount = await verifyJwks(document);

  if (process.argv.includes('--discovery-only')) {
    process.stdout.write(
      `${JSON.stringify({ issuer, audience, signing_key_count: signingKeyCount, status: 'ok' }, null, 2)}\n`,
    );
    return;
  }

  const clientId = process.env['OIDC_SMOKE_CLIENT_ID'] ?? 'turntable-web';
  const clientSecret = process.env['KEYCLOAK_WEB_CLIENT_SECRET'];
  const redirectUriValue =
    process.env['OIDC_SMOKE_REDIRECT_URI'] ?? 'http://localhost:3001/auth/callback';
  const apiUrl = new URL('/v1/me', process.env['OIDC_SMOKE_API_URL'] ?? 'http://localhost:3000');
  const redirectUri = new URL(redirectUriValue);
  if (redirectUri.protocol !== 'http:') {
    throw new Error('The local OIDC verification callback must use HTTP');
  }

  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(24));
  const authorizationUrl = new URL(document.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri.href,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(redirectUri.port || '80'), resolve);
  });

  process.stdout.write(
    `Open this URL in your browser and complete the Keycloak login:\n\n${authorizationUrl.href}\n\n`,
  );

  const code = await waitForCallback(server, redirectUri, state);
  const accessToken = await exchangeCode(
    document,
    code,
    verifier,
    redirectUri.href,
    clientId,
    clientSecret,
  );
  const verified = await jwtVerify(accessToken, createRemoteJWKSet(new URL(document.jwks_uri)), {
    issuer,
    audience,
  });
  if (typeof verified.payload.sub !== 'string' || verified.payload.sub.length === 0) {
    throw new Error('Verified access token has no subject');
  }

  const apiResponse = await fetch(apiUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const apiBody = (await apiResponse.json()) as { user?: unknown; code?: string };
  if (!apiResponse.ok) {
    throw new Error(
      `TurnTable /v1/me returned ${apiResponse.status}: ${apiBody.code ?? 'unknown'}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        issuer: verified.payload.iss,
        audience: verified.payload.aud,
        subject: verified.payload.sub,
        expires_at: verified.payload.exp,
        api_status: apiResponse.status,
        user: apiBody.user,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown OIDC verification failure';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
