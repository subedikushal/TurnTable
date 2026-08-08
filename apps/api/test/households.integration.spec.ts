import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { SignJWT } from 'jose';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';

const execFileAsync = promisify(execFile);
const authSecret = 'turntable-development-secret-at-least-32-characters';

interface TestIdentity {
  token: string;
  subject: string;
  email: string;
  name: string;
}

async function applyMigrations(connectionString: string): Promise<void> {
  const repositoryRoot = resolve(process.cwd(), '../..');
  await execFileAsync(
    process.execPath,
    [
      resolve(repositoryRoot, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      'apps/api/prisma.config.ts',
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: connectionString },
      timeout: 60_000,
    },
  );
}

async function identity(label: string): Promise<TestIdentity> {
  const email = `${label.toLowerCase()}@turntable.local`;
  return {
    subject: `development|phase1-${label.toLowerCase()}`,
    email,
    name: `User ${label}`,
    token: await new SignJWT({ email, name: `User ${label}`, scope: 'openid profile email' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('turntable-development')
      .setAudience('turntable-api')
      .setSubject(`development|phase1-${label.toLowerCase()}`)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(authSecret)),
  };
}

describe('Phase 1 household vertical slice with real PostgreSQL and Redis', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let a: TestIdentity;
  let b: TestIdentity;
  let c: TestIdentity;
  let d: TestIdentity;
  let e: TestIdentity;
  let f: TestIdentity;
  let alphaId: string;
  let alphaOwnerMemberId: string;
  let alphaMemberBId: string;
  let alphaMemberCId: string;

  const request = (
    actor: TestIdentity,
    options: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      url: string;
      key?: string;
      payload?: Record<string, unknown>;
    },
  ) =>
    app.inject({
      method: options.method,
      url: options.url,
      headers: {
        authorization: `Bearer ${actor.token}`,
        ...(options.key ? { 'idempotency-key': options.key } : {}),
      },
      ...(options.payload === undefined ? {} : { payload: options.payload }),
    });

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:18-alpine')
        .withDatabase('turntable')
        .withUsername('turntable')
        .withPassword('turntable')
        .start(),
      new GenericContainer('redis:8-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
        .start(),
    ]);
    await applyMigrations(postgres.getConnectionUri());
    Object.assign(process.env, {
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      AUTH_MODE: 'development',
      DEV_AUTH_SECRET: authSecret,
      INVITATION_TOKEN_SECRET: 'turntable-invitation-secret-at-least-32-characters',
      OIDC_AUDIENCE: 'turntable-api',
    });
    const identities = await Promise.all(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((label) => identity(label)),
    );
    [a, b, c, d, e, f] = identities as [
      TestIdentity,
      TestIdentity,
      TestIdentity,
      TestIdentity,
      TestIdentity,
      TestIdentity,
    ];
    const [{ createApiApplication }, { PrismaService: PrismaServiceToken }] = await Promise.all([
      import('../src/bootstrap.js'),
      import('../src/infrastructure/database/prisma.service.js'),
    ]);
    app = await createApiApplication({ logger: false });
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaServiceToken);
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([postgres?.stop(), redis?.stop()]);
  });

  it('rejects unauthenticated, invalid, unknown-field, and missing-key create requests', async () => {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/v1/households',
      headers: { 'idempotency-key': 'unauthorized-create-key' },
      payload: { name: 'No Auth', timezone: 'UTC', currency: 'USD' },
    });
    expect(unauthorized.statusCode).toBe(401);

    for (const [key, payload] of [
      ['invalid-name-key', { name: '   ', timezone: 'UTC', currency: 'USD' }],
      ['invalid-zone-key', { name: 'Bad Zone', timezone: 'Mars/Olympus', currency: 'USD' }],
      ['invalid-currency-key', { name: 'Bad Currency', timezone: 'UTC', currency: 'ZZZ' }],
      [
        'unknown-field-key',
        { name: 'Unknown', timezone: 'UTC', currency: 'USD', created_by_user_id: 'blocked' },
      ],
    ] as const) {
      const response = await request(a, {
        method: 'POST',
        url: '/v1/households',
        key,
        payload,
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    const missingKey = await request(a, {
      method: 'POST',
      url: '/v1/households',
      payload: { name: 'Missing Key', timezone: 'UTC', currency: 'USD' },
    });
    expect(missingKey.statusCode).toBe(422);
  });

  it('AC-HH-001 creates one household/owner/side-effect set under concurrent retry', async () => {
    const command = {
      method: 'POST' as const,
      url: '/v1/households',
      key: 'alpha-concurrent-create-key',
      payload: { name: 'Household Alpha', timezone: 'America/New_York', currency: 'USD' },
    };
    const [first, second] = await Promise.all([request(a, command), request(a, command)]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    alphaId = first.json<{ id: string }>().id;

    const households = await prisma.household.findMany({ where: { name: 'Household Alpha' } });
    expect(households).toHaveLength(1);
    const owners = await prisma.householdMembership.findMany({
      where: { householdId: alphaId, status: 'ACTIVE', role: 'OWNER' },
    });
    expect(owners).toHaveLength(1);
    alphaOwnerMemberId = owners[0]!.id;
    expect(
      await prisma.activityEvent.count({
        where: { householdId: alphaId, eventType: 'HOUSEHOLD_CREATED' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { householdId: alphaId, eventType: 'MEMBER_JOINED' },
      }),
    ).toBe(1);

    const reused = await request(a, {
      ...command,
      payload: { name: 'Different Alpha', timezone: 'America/New_York', currency: 'USD' },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('enforces owner-only optimistic settings updates and household scoping', async () => {
    const updated = await request(a, {
      method: 'PATCH',
      url: `/v1/households/${alphaId}`,
      payload: { name: 'Alpha Home', expected_version: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Alpha Home', version: 2 });

    const stale = await request(a, {
      method: 'PATCH',
      url: `/v1/households/${alphaId}`,
      payload: { name: 'Stale Alpha', expected_version: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'CONFLICT' });

    const outsider = await request(d, { method: 'GET', url: `/v1/households/${alphaId}` });
    expect(outsider.statusCode).toBe(403);
    expect(outsider.json()).toMatchObject({ code: 'HOUSEHOLD_ACCESS_DENIED' });
    expect(outsider.body).not.toContain(alphaId);
    expect(outsider.body).not.toContain('Alpha Home');
  });

  it('creates a hash-only invitation, replays it, and accepts it exactly once', async () => {
    const created = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/invitations`,
      key: 'alpha-invite-b-key',
      payload: { invited_email: b.email },
    });
    expect(created.statusCode).toBe(200);
    const invitation = created.json<{
      id: string;
      token: string;
      expires_at: string;
      status: string;
    }>();
    expect(invitation.status).toBe('PENDING');
    expect(invitation.token.length).toBeGreaterThanOrEqual(32);
    expect(new Date(invitation.expires_at).getTime()).toBeGreaterThan(Date.now());

    const replay = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/invitations`,
      key: 'alpha-invite-b-key',
      payload: { invited_email: b.email },
    });
    expect(replay.json()).toEqual(invitation);

    const persisted = await prisma.householdInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(persisted.tokenHash).toHaveLength(64);
    expect(persisted.tokenHash).not.toContain(invitation.token);
    const persistedAudit = JSON.stringify({
      activity: await prisma.activityEvent.findMany({ where: { entityId: invitation.id } }),
      idempotency: await prisma.idempotencyRecord.findMany({
        where: { operationScope: 'household-invitations.create' },
      }),
    });
    expect(persistedAudit).not.toContain(invitation.token);

    const accepted = await request(b, {
      method: 'POST',
      url: `/v1/invitations/${invitation.token}/accept`,
      key: 'accept-alpha-b-key',
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      household_id: alphaId,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    alphaMemberBId = accepted.json<{ id: string }>().id;

    const acceptedReplay = await request(b, {
      method: 'POST',
      url: `/v1/invitations/${invitation.token}/accept`,
      key: 'accept-alpha-b-key',
    });
    expect(acceptedReplay.json()).toEqual(accepted.json());

    const secondUser = await request(c, {
      method: 'POST',
      url: `/v1/invitations/${invitation.token}/accept`,
      key: 'accept-used-alpha-key',
    });
    expect(secondUser.statusCode).toBe(409);
    expect(
      await prisma.householdMembership.count({
        where: { householdId: alphaId, userId: accepted.json().user.id },
      }),
    ).toBe(1);
  });

  it('allows member reads while denying member mutations', async () => {
    expect((await request(b, { method: 'GET', url: `/v1/households/${alphaId}` })).statusCode).toBe(
      200,
    );
    expect(
      (await request(b, { method: 'GET', url: `/v1/households/${alphaId}/members` })).statusCode,
    ).toBe(200);
    expect(
      (
        await request(b, {
          method: 'PATCH',
          url: `/v1/households/${alphaId}`,
          payload: { name: 'Member Edit', expected_version: 2 },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(b, {
          method: 'POST',
          url: `/v1/households/${alphaId}/invitations`,
          key: 'member-cannot-invite-key',
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });

  it('accepts one concurrent invitation contender and writes one effect set', async () => {
    const inviteC = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/invitations`,
      key: 'alpha-invite-c-key',
      payload: { invited_email: c.email },
    });
    const acceptedC = await request(c, {
      method: 'POST',
      url: `/v1/invitations/${inviteC.json().token}/accept`,
      key: 'alpha-accept-c-key',
    });
    expect(acceptedC.statusCode).toBe(200);
    alphaMemberCId = acceptedC.json<{ id: string }>().id;

    const concurrentInvite = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/invitations`,
      key: 'alpha-concurrent-invite-key',
      payload: {},
    });
    const token = concurrentInvite.json<{ token: string }>().token;
    const [dAttempt, eAttempt] = await Promise.all([
      request(d, {
        method: 'POST',
        url: `/v1/invitations/${token}/accept`,
        key: 'alpha-concurrent-accept-d',
      }),
      request(e, {
        method: 'POST',
        url: `/v1/invitations/${token}/accept`,
        key: 'alpha-concurrent-accept-e',
      }),
    ]);
    expect([dAttempt.statusCode, eAttempt.statusCode].sort()).toEqual([200, 409]);
    const inviteId = concurrentInvite.json<{ id: string }>().id;
    const acceptedInvitation = await prisma.householdInvitation.findUniqueOrThrow({
      where: { id: inviteId },
    });
    expect(acceptedInvitation.status).toBe('ACCEPTED');
    const acceptedMembership = await prisma.householdMembership.findUniqueOrThrow({
      where: {
        householdId_userId: {
          householdId: alphaId,
          userId: acceptedInvitation.acceptedByUserId!,
        },
      },
    });
    expect(
      await prisma.activityEvent.count({
        where: {
          householdId: alphaId,
          eventType: 'MEMBER_JOINED',
          entityId: acceptedMembership.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          householdId: alphaId,
          eventType: 'MEMBER_JOINED',
          aggregateId: acceptedMembership.id,
        },
      }),
    ).toBe(1);
    const contenderUsers = await prisma.user.findMany({
      where: { oidcSubject: { in: [d.subject, e.subject] } },
      select: { id: true },
    });
    expect(
      await prisma.householdMembership.count({
        where: {
          householdId: alphaId,
          status: 'ACTIVE',
          userId: { in: contenderUsers.map((user) => user.id) },
        },
      }),
    ).toBe(1);
  });

  it('handles expired, revoked, and already-active invitation states safely', async () => {
    const expiredRaw = 'expired_invitation_token_1234567890_ABCDEFG';
    const revokedRaw = 'revoked_invitation_token_1234567890_ABCDEFG';
    const now = Date.now();
    const expired = await prisma.householdInvitation.create({
      data: {
        householdId: alphaId,
        createdByMemberId: alphaOwnerMemberId,
        tokenHash: createHash('sha256').update(expiredRaw).digest('hex'),
        status: 'PENDING',
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now - 60 * 60 * 1000),
      },
    });
    await prisma.householdInvitation.create({
      data: {
        householdId: alphaId,
        createdByMemberId: alphaOwnerMemberId,
        tokenHash: createHash('sha256').update(revokedRaw).digest('hex'),
        status: 'REVOKED',
        expiresAt: new Date(now + 60 * 60 * 1000),
      },
    });
    expect(
      (
        await request(f, {
          method: 'POST',
          url: '/v1/invitations/not-a-valid-invitation-token/accept',
          key: 'invalid-invite-accept-key',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(f, {
          method: 'POST',
          url: `/v1/invitations/${expiredRaw}/accept`,
          key: 'expired-invite-accept-key',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await prisma.householdInvitation.findUniqueOrThrow({ where: { id: expired.id } })).status,
    ).toBe('EXPIRED');
    expect(
      (
        await request(f, {
          method: 'POST',
          url: `/v1/invitations/${revokedRaw}/accept`,
          key: 'revoked-invite-accept-key',
        })
      ).statusCode,
    ).toBe(409);

    const activeInvite = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/invitations`,
      key: 'active-member-invite-key',
      payload: {},
    });
    expect(
      (
        await request(b, {
          method: 'POST',
          url: `/v1/invitations/${activeInvite.json().token}/accept`,
          key: 'active-member-accept-key',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('AC-HH-004 rejects owner self-removal and non-owner removal/transfer', async () => {
    const ownerSelfRemoval = await request(a, {
      method: 'DELETE',
      url: `/v1/households/${alphaId}/members/${alphaOwnerMemberId}`,
      key: 'owner-self-removal-key',
    });
    expect(ownerSelfRemoval.statusCode).toBe(409);

    const memberRemoval = await request(b, {
      method: 'DELETE',
      url: `/v1/households/${alphaId}/members/${alphaMemberCId}`,
      key: 'member-cannot-remove-key',
    });
    expect(memberRemoval.statusCode).toBe(403);

    const memberTransfer = await request(b, {
      method: 'POST',
      url: `/v1/households/${alphaId}/ownership-transfer`,
      key: 'member-cannot-transfer-key',
      payload: { target_member_id: alphaMemberCId },
    });
    expect(memberTransfer.statusCode).toBe(403);
    const outsiderRemoval = await request(f, {
      method: 'DELETE',
      url: `/v1/households/${alphaId}/members/${alphaMemberCId}`,
      key: 'outsider-cannot-remove-key',
    });
    expect(outsiderRemoval.statusCode).toBe(403);
    const outsiderTransfer = await request(f, {
      method: 'POST',
      url: `/v1/households/${alphaId}/ownership-transfer`,
      key: 'outsider-cannot-transfer-key',
      payload: { target_member_id: alphaMemberCId },
    });
    expect(outsiderTransfer.statusCode).toBe(403);
    expect(
      await prisma.householdMembership.count({
        where: { householdId: alphaId, status: 'ACTIVE', role: 'OWNER' },
      }),
    ).toBe(1);
  });

  it('transfers ownership only to an active same-household member and replays safely', async () => {
    const beta = await request(d, {
      method: 'POST',
      url: '/v1/households',
      key: 'beta-create-key',
      payload: { name: 'Household Beta', timezone: 'UTC', currency: 'USD' },
    });
    const betaOwner = await prisma.householdMembership.findFirstOrThrow({
      where: { householdId: beta.json().id, role: 'OWNER', status: 'ACTIVE' },
    });
    const crossHouseholdUpdate = await request(a, {
      method: 'PATCH',
      url: `/v1/households/${beta.json().id}`,
      payload: { name: 'Leaked Update', expected_version: 1 },
    });
    expect(crossHouseholdUpdate.statusCode).toBe(403);
    const crossHousehold = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/ownership-transfer`,
      key: 'cross-household-transfer-key',
      payload: { target_member_id: betaOwner.id },
    });
    expect(crossHousehold.statusCode).toBe(409);

    const transfer = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/ownership-transfer`,
      key: 'alpha-transfer-to-b-key',
      payload: { target_member_id: alphaMemberBId },
    });
    expect(transfer.statusCode).toBe(200);
    expect(transfer.json()).toMatchObject({
      household_id: alphaId,
      previous_owner: { id: alphaOwnerMemberId, role: 'MEMBER' },
      new_owner: { id: alphaMemberBId, role: 'OWNER' },
    });
    const replay = await request(a, {
      method: 'POST',
      url: `/v1/households/${alphaId}/ownership-transfer`,
      key: 'alpha-transfer-to-b-key',
      payload: { target_member_id: alphaMemberBId },
    });
    expect(replay.json()).toEqual(transfer.json());
    expect(
      await prisma.householdMembership.count({
        where: { householdId: alphaId, status: 'ACTIVE', role: 'OWNER' },
      }),
    ).toBe(1);
  });

  it('keeps exactly one active owner during concurrent transfers', async () => {
    const gamma = await request(a, {
      method: 'POST',
      url: '/v1/households',
      key: 'gamma-create-key',
      payload: { name: 'Household Gamma', timezone: 'UTC', currency: 'EUR' },
    });
    const gammaId = gamma.json<{ id: string }>().id;
    const inviteB = await request(a, {
      method: 'POST',
      url: `/v1/households/${gammaId}/invitations`,
      key: 'gamma-invite-b-key',
      payload: { invited_email: b.email },
    });
    const inviteC = await request(a, {
      method: 'POST',
      url: `/v1/households/${gammaId}/invitations`,
      key: 'gamma-invite-c-key',
      payload: { invited_email: c.email },
    });
    const acceptedB = await request(b, {
      method: 'POST',
      url: `/v1/invitations/${inviteB.json().token}/accept`,
      key: 'gamma-accept-b-key',
    });
    const acceptedC = await request(c, {
      method: 'POST',
      url: `/v1/invitations/${inviteC.json().token}/accept`,
      key: 'gamma-accept-c-key',
    });
    const [toB, toC] = await Promise.all([
      request(a, {
        method: 'POST',
        url: `/v1/households/${gammaId}/ownership-transfer`,
        key: 'gamma-transfer-b-key',
        payload: { target_member_id: acceptedB.json().id },
      }),
      request(a, {
        method: 'POST',
        url: `/v1/households/${gammaId}/ownership-transfer`,
        key: 'gamma-transfer-c-key',
        payload: { target_member_id: acceptedC.json().id },
      }),
    ]);
    expect([toB.statusCode, toC.statusCode].filter((status) => status === 200)).toHaveLength(1);
    expect(
      [toB.statusCode, toC.statusCode].filter((status) => [403, 409].includes(status)),
    ).toHaveLength(1);
    expect(
      await prisma.householdMembership.count({
        where: { householdId: gammaId, status: 'ACTIVE', role: 'OWNER' },
      }),
    ).toBe(1);
  });

  it('AC-HH-005 removes members historically, emits once, and revokes access', async () => {
    const removedA = await request(b, {
      method: 'DELETE',
      url: `/v1/households/${alphaId}/members/${alphaOwnerMemberId}`,
      key: 'alpha-remove-a-key',
    });
    expect(removedA.statusCode).toBe(200);
    expect(removedA.json()).toMatchObject({ id: alphaOwnerMemberId, status: 'REMOVED' });
    const replay = await request(b, {
      method: 'DELETE',
      url: `/v1/households/${alphaId}/members/${alphaOwnerMemberId}`,
      key: 'alpha-remove-a-key',
    });
    expect(replay.json()).toEqual(removedA.json());

    const historical = await prisma.householdMembership.findUniqueOrThrow({
      where: { id: alphaOwnerMemberId },
    });
    expect(historical.status).toBe('REMOVED');
    expect(historical.leftAt).not.toBeNull();
    expect((await request(a, { method: 'GET', url: `/v1/households/${alphaId}` })).statusCode).toBe(
      403,
    );
    expect(
      await prisma.activityEvent.count({
        where: { householdId: alphaId, eventType: 'MEMBER_REMOVED', entityId: alphaOwnerMemberId },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          householdId: alphaId,
          eventType: 'MEMBER_REMOVED',
          aggregateId: alphaOwnerMemberId,
        },
      }),
    ).toBe(1);

    const removeC = await request(b, {
      method: 'DELETE',
      url: `/v1/households/${alphaId}/members/${alphaMemberCId}`,
      key: 'alpha-remove-c-key',
    });
    expect(removeC.statusCode).toBe(200);
    const inactiveTransfer = await request(b, {
      method: 'POST',
      url: `/v1/households/${alphaId}/ownership-transfer`,
      key: 'alpha-transfer-removed-c-key',
      payload: { target_member_id: alphaMemberCId },
    });
    expect(inactiveTransfer.statusCode).toBe(409);

    const meA = await request(a, { method: 'GET', url: '/v1/me' });
    expect(meA.json().memberships).not.toContainEqual(
      expect.objectContaining({ household_id: alphaId }),
    );
    const householdsA = await request(a, { method: 'GET', url: '/v1/households' });
    expect(householdsA.json()).not.toContainEqual(
      expect.objectContaining({ household: expect.objectContaining({ id: alphaId }) }),
    );
    const alphaMembers = await request(b, {
      method: 'GET',
      url: `/v1/households/${alphaId}/members`,
    });
    expect(alphaMembers.json()).not.toContainEqual(
      expect.objectContaining({ id: alphaOwnerMemberId }),
    );
    expect(alphaMembers.json()).not.toContainEqual(expect.objectContaining({ id: alphaMemberCId }));
  });

  it('database constraints reject committing zero or multiple active owners', async () => {
    const activeMember = await prisma.householdMembership.findFirstOrThrow({
      where: { householdId: alphaId, status: 'ACTIVE', role: 'MEMBER' },
    });
    await expect(
      prisma.householdMembership.update({
        where: { id: activeMember.id },
        data: { role: 'OWNER' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.householdMembership.update({
          where: { id: alphaMemberBId },
          data: { role: 'MEMBER' },
        });
      }),
    ).rejects.toThrow('exactly one active owner');
    expect(
      await prisma.householdMembership.count({
        where: { householdId: alphaId, status: 'ACTIVE', role: 'OWNER' },
      }),
    ).toBe(1);
  });
});
