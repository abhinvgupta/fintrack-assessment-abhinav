# AI Usage Journal

## Tool(s) used
- Claude Code (claude-sonnet-4-6) via the Claude Code VSCode extension

---

## Interaction Log

| # | What I asked the AI | Quality of AI response (1–5) | Accepted? | My reasoning |
|---|---------------------|------------------------------|-----------|--------------|
| 1 | Scaffold a Next.js 15 project with the starter files from the assessment PDF | 5 | Yes | Correctly set up the project structure, installed dependencies, created stub UI components and DB schema so the starter code compiled without errors. No surprises. |
| 2 | Explain what needs to be done across all 4 tasks | 5 | Yes | Good high-level breakdown. The bug summary it gave upfront closely matched what ended up in the formal audit. Used as a mental map, not as the final answer. |
| 3 | Write CLARIFICATIONS.md (Task 1) | 4 | Partial | Accepted the structure and most items. Added my own clarification about testing approach (no sample data provided) which the AI hadn't surfaced as a standalone question. The compliance question about PAN data in the `description` field was strong — kept that verbatim. |
| 4 | Explain floating-point dollars vs integer cents | 5 | Yes | Clear, accurate explanation with concrete JS examples. Used to confirm my own understanding before committing to that as an engineering decision in CLARIFICATIONS.md. |
| 5 | Write AUDIT.md (Task 2) | 4 | Partial | AI found all the critical and high bugs correctly. I verified each one by tracing the code manually. Accepted the SQL injection findings, the missing discrepancies population, and the float arithmetic bug. Adjusted the description of bug #8 (out-of-period totals) — the AI's initial framing was slightly imprecise about *when* the filter runs. |
| 6 | Explain the concurrency race condition and how to fix it | 5 | Yes | The two-layer fix (unique constraint + SELECT FOR UPDATE) is the correct production approach. Confirmed this matches standard fintech reconciliation patterns before accepting. |

---

## Reflection

**Bugs AI found correctly** (that I then verified by reading the code):
- SQL injection in both POST and GET handlers (`notes` and `id` interpolated directly into raw SQL strings)
- `error.stack` returned to the client in the 500 response
- No authentication on either endpoint
- `discrepancies` array declared but never populated — the loop finds matches but never compares amounts
- `setInterval` in `useEffect` with no `clearInterval` cleanup
- `markReconciled` guarding on `status === 'pending'` only, silently skipping `cleared` payments
- Timezone-naive `new Date(isoString)` parsing — Node treats no-offset strings as local time, not UTC
- GET handler `WHERE id = '${id}'` with `id = null` from missing query param — dashboard always blank
- Floating-point accumulation in `reduce` on dollar amounts

**Bugs AI missed or got wrong**:
- The AI initially understated the severity of the duplicate reconciliation record (inserting into both `reconciliation_runs` in the route AND `reconciliations` in the reconciler). It framed it as a logic issue, but it's also a data integrity issue — the returned `runId` doesn't match the reconciler's `saved.id`, so the caller gets a stale reference.
- The AI flagged N+1 queries as Low severity. In a batch of 500 payments that's 1,000 sequential DB calls — closer to Medium in a real-time system.

**AI-generated code I rejected**:
- In the initial scaffold, the AI used `real` (float4) for the amount column in the DB schema to avoid Drizzle's `numeric` → `string` type mismatch. I accepted this for compilation purposes but noted it in a comment — the correct fix in Task 3 is integer cents, not `real`, which still has floating-point representation issues.

**The moment I most doubted the AI output and how I verified it**:
The AI's suggested fix for the period boundary inconsistency (bug #6 in AUDIT.md) — it claimed `isInPeriod` uses `<` (exclusive) while Drizzle's `between` is `<=` (inclusive). I re-read both the `isInPeriod` function and the Drizzle docs to confirm that `between` in SQL is indeed `BETWEEN a AND b` which is inclusive on both ends, while the manual JS check uses strict `<`. The inconsistency is real — payments exactly on `periodEnd` would be fetched from the DB but then excluded by the JS filter, causing a discrepancy in `systemOnly`.

**What I know that the AI does not**:
In a real PCI DSS L1 environment, the distinction between "security weakness" and "compliance violation" matters for how urgently a fix gets prioritised and who signs off on it. The AI correctly identified `error.stack` in the response as a PCI issue, but it cannot know that at Level 1, this would require a formal CAB (Change Advisory Board) approval to deploy a fix, not just a PR review — which changes the timeline and the communication you'd have with the client.

---

*This journal will be updated after Task 3 (implementation) is complete.*
