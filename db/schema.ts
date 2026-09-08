import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  real,
  check,
} from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  settings: text('settings').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
export const members = sqliteTable(
  'members',
  {
    email: text('email').primaryKey(),
    userId: text('user_id'),
    role: text('role').notNull(),
    recordId: text('record_id'),
    name: text('name').notNull(),
    grantId: text('grant_id').notNull().default(''),
  },
  (t) => [index('idx_members_user').on(t.userId)],
);
export const records = sqliteTable(
  'records',
  {
    workspace: text('workspace')
      .notNull()
      .references(() => workspaces.id),
    kind: text('kind').notNull(),
    id: text('id').notNull(),
    data: text('data').notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.workspace, t.kind, t.id] })],
);
export const events = sqliteTable(
  'events',
  {
    workspace: text('workspace')
      .notNull()
      .references(() => workspaces.id),
    id: text('id').notNull(),
    rideId: text('ride_id'),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull(),
    resolved: integer('resolved').notNull().default(0),
    note: text('note').notNull().default(''),
    actorId: text('actor_id'),
    actorEmail: text('actor_email'),
    actorRole: text('actor_role'),
    action: text('action'),
    requestId: text('request_id'),
    entityKind: text('entity_kind'),
    entityId: text('entity_id'),
  },
  (t) => [
    primaryKey({ columns: [t.workspace, t.id] }),
    index('idx_events_workspace_time').on(t.workspace, t.createdAt),
  ],
);

export const requestLogs = sqliteTable(
  'request_logs',
  {
    id: text('id').primaryKey(),
    workspace: text('workspace'),
    createdAt: text('created_at').notNull(),
    actorId: text('actor_id'),
    actorEmail: text('actor_email'),
    actorRole: text('actor_role'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
  },
  (t) => [
    index('idx_requests_workspace_time').on(t.workspace, t.createdAt, t.id),
  ],
);

export const mutationReceipts = sqliteTable(
  'mutation_receipts',
  {
    workspace: text('workspace').notNull(),
    actor: text('actor').notNull(),
    requestId: text('request_id').notNull(),
    digest: text('digest').notNull(),
    response: text('response').notNull(),
    status: integer('status').notNull(),
    applied: integer('applied').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspace, t.actor, t.requestId] }),
    check('mutation_applied', sql`${t.applied} = 1`),
    index('idx_receipts_created').on(t.createdAt),
  ],
);
export const rideLocations = sqliteTable(
  'ride_locations',
  {
    workspace: text('workspace').notNull(),
    rideId: text('ride_id').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    accuracy: real('accuracy').notNull(),
    capturedAt: text('captured_at').notNull(),
    receivedAt: text('received_at').notNull(),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspace, t.rideId] })],
);
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    bucket: text('bucket').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_rate_expiry').on(t.expiresAt)],
);
export const notificationOutbox = sqliteTable(
  'notification_outbox',
  {
    id: text('id').primaryKey(),
    workspace: text('workspace').notNull(),
    rideId: text('ride_id').notNull(),
    recipientRole: text('recipient_role').notNull(),
    recipientId: text('recipient_id').notNull(),
    phone: text('phone').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(),
    providerId: text('provider_id'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_outbox_workspace_status').on(t.workspace, t.status),
    index('idx_outbox_provider').on(t.providerId),
  ],
);
