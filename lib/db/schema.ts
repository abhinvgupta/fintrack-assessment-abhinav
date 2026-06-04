import { pgTable, text, timestamp, integer, real, pgEnum } from 'drizzle-orm/pg-core'

export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'cleared', 'reconciled', 'disputed'])
export const reconciliationStatusEnum = pgEnum('reconciliation_status', ['pending', 'running', 'complete', 'failed'])

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  externalRef: text('external_ref').notNull(),
  // NOTE: real (float4) is used here for scaffold type compatibility only.
  // Task 3 fix: store amounts as integer cents to avoid floating-point errors.
  amount: real('amount').notNull(),
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
  totalBankAmount: real('total_bank_amount').notNull(),
  totalSystemAmount: real('total_system_amount').notNull(),
  difference: real('difference').notNull(),
  status: reconciliationStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
