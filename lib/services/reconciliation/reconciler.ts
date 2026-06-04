import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { payments, reconciliations } from '@/lib/db/schema'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BankRecord {
  transactionId: string
  amount: number   // dollar value from bank, e.g. 19.99
  currency: string
  valueDate: string // ISO date string from bank, e.g. "2026-01-15T14:30:00"
  description: string
  reference: string
}

export interface Payment {
  id: string
  externalRef: string
  amountCents: number // stored as integer cents to avoid float errors
  currency: string
  createdAt: Date
  status: 'pending' | 'cleared' | 'reconciled' | 'disputed'
}

export interface ReconciliationResult {
  id: string
  matched: MatchedPair[]
  unmatched: { bankOnly: BankRecord[]; systemOnly: Payment[] }
  discrepancies: Discrepancy[]
  summary: {
    totalBankAmountCents: number
    totalSystemAmountCents: number
    differenceCents: number
  }
}

export interface MatchedPair {
  bankRecord: BankRecord
  payment: Payment
}

export interface Discrepancy {
  bankRecord: BankRecord
  payment: Payment
  amountDeltaCents: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Convert dollar float to integer cents. Math.round avoids 19.99 * 100 = 1998.9999...
function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

function centsToDisplay(cents: number): number {
  return cents / 100
}

/*
 * Matching strategy: match by reference first, confirm with amount.
 *
 * Banks echo back the merchant's reference field (externalRef) in their
 * transaction records. Matching on amount alone produces false positives
 * whenever two payments share the same value (e.g. 500 monthly $99 subs).
 * Reference matching is O(1) via a Map and is the industry-standard approach.
 *
 * If no reference match exists, we do NOT fall back to amount-only — a
 * silent false match is worse than an unmatched record that a human reviews.
 */
function buildReferenceIndex(candidates: Payment[]): Map<string, Payment> {
  const index = new Map<string, Payment>()
  for (const p of candidates) {
    index.set(p.externalRef, p)
  }
  return index
}

function findMatch(
  bankRecord: BankRecord,
  index: Map<string, Payment>,
): Payment | undefined {
  return index.get(bankRecord.reference)
}

/*
 * Parse a bank-supplied date string into a Date object.
 *
 * Bank feeds often omit a timezone offset (e.g. "2026-01-15T14:30:00").
 * Node.js parses such strings as LOCAL time, not UTC, which shifts the date
 * on any server not running in UTC. We force UTC by appending 'Z' when no
 * offset is present.
 */
function parseBankDate(isoString: string): Date {
  const hasOffset = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString)
  return new Date(hasOffset ? isoString : isoString + 'Z')
}

function isInPeriod(date: Date, periodStart: Date, periodEnd: Date): boolean {
  // [periodStart, periodEnd) — exclusive end to prevent double-counting
  // across back-to-back reporting periods.
  return date >= periodStart && date < periodEnd
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function reconcilePayments(
  bankData: BankRecord[],
  periodStart: Date,
  periodEnd: Date,
): Promise<ReconciliationResult> {

  // Insert a 'running' record first with a unique constraint on (periodStart, periodEnd).
  // If another request is already reconciling this period, this insert will
  // fail the unique constraint and throw — preventing duplicate concurrent runs.
  let runRecord: { id: string }
  try {
    ;[runRecord] = await db
      .insert(reconciliations)
      .values({
        periodStart,
        periodEnd,
        matchedCount: 0,
        unmatchedCount: 0,
        totalBankAmountCents: 0,
        totalSystemAmountCents: 0,
        differenceCents: 0,
        status: 'running',
      })
      .returning({ id: reconciliations.id })
  } catch {
    throw new Error('A reconciliation for this period is already running. Please wait for it to complete.')
  }

  return await db.transaction(async (tx) => {
    // SELECT FOR UPDATE locks these rows for the duration of the transaction.
    // Any concurrent transaction attempting to match the same payments will
    // block until this one commits, preventing double-reconciliation.
    const systemPaymentsRaw = await tx.execute(sql`
      SELECT id, external_ref, amount_cents, currency, created_at, status
      FROM payments
      WHERE created_at >= ${periodStart}
        AND created_at < ${periodEnd}
        AND status IN ('pending', 'cleared')
      FOR UPDATE
    `) as unknown as Array<{
      id: string
      external_ref: string
      amount_cents: number
      currency: string
      created_at: Date
      status: 'pending' | 'cleared' | 'reconciled' | 'disputed'
    }>

    const systemPayments: Payment[] = systemPaymentsRaw.map(r => ({
      id: r.id,
      externalRef: r.external_ref,
      amountCents: r.amount_cents,
      currency: r.currency,
      createdAt: r.created_at,
      status: r.status,
    }))

    const matched: MatchedPair[] = []
    const discrepancies: Discrepancy[] = []
    const matchedPaymentIds = new Set<string>()
    const matchedBankIds = new Set<string>()

    // Filter bank records to only those within the reporting period, and
    // only USD (multi-currency support is deferred per client brief).
    const periodBankRecords = bankData.filter(r => {
      const bankDate = parseBankDate(r.valueDate)
      return isInPeriod(bankDate, periodStart, periodEnd) && r.currency === 'USD'
    })

    // Build reference index from unmatched candidates for O(1) lookups
    const referenceIndex = buildReferenceIndex(systemPayments)

    for (const bankRecord of periodBankRecords) {
      // Remove already-matched payments from the index to prevent reuse
      if (matchedPaymentIds.size > 0) {
        for (const id of matchedPaymentIds) {
          const p = systemPayments.find(p => p.id === id)
          if (p) referenceIndex.delete(p.externalRef)
        }
      }

      const match = findMatch(bankRecord, referenceIndex)
      if (!match) continue

      matchedPaymentIds.add(match.id)
      matchedBankIds.add(bankRecord.transactionId)

      const bankAmountCents = toCents(bankRecord.amount)
      const delta = bankAmountCents - match.amountCents

      if (delta !== 0) {
        // Reference matched but amounts differ — flag as a discrepancy.
        // The pair is still recorded as matched (same transaction) but
        // the finance team must review the amount difference.
        discrepancies.push({ bankRecord, payment: match, amountDeltaCents: delta })
      }

      matched.push({ bankRecord, payment: match })
    }

    // Batch-update all matched payments in a single query — avoids N+1
    if (matchedPaymentIds.size > 0) {
      await tx
        .update(payments)
        .set({ status: 'reconciled' })
        .where(inArray(payments.id, [...matchedPaymentIds]))
    }

    // Compute totals in integer cents — no floating-point accumulation
    const totalBankAmountCents = periodBankRecords.reduce(
      (sum, r) => sum + toCents(r.amount), 0,
    )
    const totalSystemAmountCents = systemPayments.reduce(
      (sum, p) => sum + p.amountCents, 0,
    )
    const differenceCents = totalBankAmountCents - totalSystemAmountCents

    const bankOnly = periodBankRecords.filter(r => !matchedBankIds.has(r.transactionId))
    const systemOnly = systemPayments.filter(p => !matchedPaymentIds.has(p.id))

    // Update the run record to 'complete' with final counts
    await tx
      .update(reconciliations)
      .set({
        matchedCount: matched.length,
        unmatchedCount: bankOnly.length + systemOnly.length,
        totalBankAmountCents,
        totalSystemAmountCents,
        differenceCents,
        status: 'complete',
      })
      .where(eq(reconciliations.id, runRecord.id))

    return {
      id: runRecord.id,
      matched,
      unmatched: { bankOnly, systemOnly },
      discrepancies,
      summary: {
        totalBankAmountCents,
        totalSystemAmountCents,
        differenceCents,
      },
    }
  })
}

// Convenience display helpers for consumers of the result
export { centsToDisplay, toCents }
