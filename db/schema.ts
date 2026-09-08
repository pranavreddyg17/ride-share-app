import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  settings: text('settings').notNull(),
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
  },
  (t) => [
    primaryKey({ columns: [t.workspace, t.id] }),
    index('idx_events_workspace_time').on(t.workspace, t.createdAt),
  ],
);
