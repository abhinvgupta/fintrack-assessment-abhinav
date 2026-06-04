import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reconciliations } from '@/lib/db/schema'
import { reconcilePayments, BankRecord } from '@/lib/services/reconciliation/reconciler'
import { getSession } from '@/lib/auth'

const ReconcileRequestSchema = z.object({
  bankData: z.array(
    z.object({
      transactionId: z.string(),
      amount: z.number().positive(),
      currency: z.string().length(3),
      valueDate: z.string(),
      description: z.string(),
      reference: z.string(),
    }),
  ).min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  notes: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let parsed: z.infer<typeof ReconcileRequestSchema>
  try {
    const body = await req.json()
    parsed = ReconcileRequestSchema.parse(body)
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: e.issues },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const result = await reconcilePayments(
      parsed.bankData as BankRecord[],
      new Date(parsed.periodStart),
      new Date(parsed.periodEnd),
    )
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    // Log full error server-side only — never expose stack traces to callers
    console.error('[reconcile] POST failed:', e)

    const message = e instanceof Error ? e.message : 'Reconciliation failed'
    // Surface safe operational errors (e.g. duplicate period) as 409,
    // everything else as a generic 500.
    const status = message.includes('already running') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  try {
    if (id) {
      // Fetch a single run by ID — parameterized, not interpolated
      const [run] = await db
        .select()
        .from(reconciliations)
        .where(eq(reconciliations.id, id))
        .limit(1)

      if (!run) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json(run)
    }

    // No id — return paginated list of recent runs for the dashboard
    const runs = await db
      .select()
      .from(reconciliations)
      .orderBy(desc(reconciliations.createdAt))
      .limit(50)

    return NextResponse.json({ runs })
  } catch (e) {
    console.error('[reconcile] GET failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
