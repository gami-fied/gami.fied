import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    status: text('status').default('active').notNull(), // 'active' | 'suspended'
    /** Set only for a throwaway demo on a demo instance. The worker deletes it after this time. */
    demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('organizations_demo_expires_idx').on(table.demoExpiresAt)]
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
