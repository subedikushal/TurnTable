import { SignJWT } from 'jose';

async function main(): Promise<void> {
  const secret = process.env['DEV_AUTH_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('DEV_AUTH_SECRET must contain at least 32 characters');
  }
  const audience = process.env['OIDC_AUDIENCE'] ?? 'turntable-api';
  const token = await new SignJWT({
    email: 'developer@turntable.local',
    name: 'TurnTable Developer',
    scope: 'openid profile email',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('turntable-development')
    .setAudience(audience)
    .setSubject('development|turntable-engineer')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(secret));

  process.stdout.write(`${token}\n`);
}

void main();
