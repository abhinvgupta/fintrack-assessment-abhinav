import { pgTable, text, timestamp, integer, pgEnum, unique } from 'drizzle-orm/pg-core'

export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'cleared', 'reconciled', 'disputed'])
export const reconciliationStatusEnum = pgEnum('reconciliation_status', ['pending', 'running', 'complete', 'failed'])

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  externalRef: text('external_ref').notNull(),
  // Stored as integer cents (e.g. $19.99 → 1999) to avoid floating-point errors.
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  status: paymentStatusEnum('status').notNull().default('pending'),
})

export const reconciliations = pgTable('reconciliations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  matchedCount: integer('matched_count').notNull().default(0),
  unmatchedCount: integer('unmatched_count').notNull().default(0),
  // All monetary values stored as integer cents.
  totalBankAmountCents: integer('total_bank_amount_cents').notNull().default(0),
  totalSystemAmountCents: integer('total_system_amount_cents').notNull().default(0),
  differenceCents: integer('difference_cents').notNull().default(0),
  status: reconciliationStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  // Prevents two concurrent reconciliation runs for the same period.
  uniquePeriod: unique().on(t.periodStart, t.periodEnd),
}))
