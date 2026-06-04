# Clarifications

## Ambiguities and Unanswered Questions

---

### 1. No sample data provided — how is the system verified?

> *"Accept a batch of bank records (uploaded as JSON, representing a CSV import)"*

**Ambiguity**: No sample JSON payload or CSV schema was provided. There is no example of what a real bank export looks like, so it is impossible to run or validate the system end-to-end.

**Assumed answer**: Verification is done by code review — reading the logic, tracing the data flow, and confirming the types match the described shape (`BankRecord`, `Payment`). Correctness is assessed structurally, not by execution.

**Why this interpretation**: The assessment explicitly states *"You will not be able to run this code — that is intentional."* This confirms static analysis is the expected validation method. In a real engagement I would request a sanitised sample export from the bank before writing a single line.

---

### 2. What does "real-time" actually mean?

> *"The system should do reconciliation in real-time — we can't wait for a nightly job"*

**Ambiguity**: "Real-time" is undefined. It could mean: (a) synchronous HTTP — results returned in the same request, (b) near-real-time — results available within seconds via polling, or (c) streaming — results emitted as records are processed.

**Assumed answer**: Synchronous HTTP response within a single POST request. The existing route structure and the `ReconciliationResult` return type both imply a single request/response cycle.

**Why this interpretation**: The client's contrast is explicitly against a *nightly batch job*, not against latency. "Not a nightly job" = on-demand, not sub-second. A synchronous API satisfies that constraint without the complexity of streaming or WebSockets.

---

### 3. What is the matching strategy?

> *"Payments need to be properly matched against the bank records"*

**Ambiguity**: "Properly matched" is undefined. The starter code matches purely by amount (`p.amount === bankRecord.amount`), which will produce false matches whenever two payments share the same dollar value.

**Assumed answer**: Match primarily by `externalRef` (internal payment reference) against `BankRecord.reference` (the reference field the bank echoes back), with amount as a secondary confirmation. If no reference match exists, fall back to amount + date proximity within a tolerance window.

**Why this interpretation**: In payment processing, banks typically echo back a merchant reference or transaction ID. Matching on amount alone is insufficient in any real-world scenario — a company processing 1,000 payments of $99.00/month would false-match every one. Reference-first matching is the industry standard.

---

### 4. What exactly counts as a "discrepancy"?

> *"Any discrepancies should be flagged so the team can review them"*

**Ambiguity**: The `Discrepancy` type has `amountDelta`, implying only amount mismatches. But discrepancies could also include: date mismatches, currency mismatches on a matched reference, or a bank record that arrived outside the expected settlement window.

**Assumed answer**: A discrepancy is a pair where a reference match was found but the amounts differ (non-zero `amountDelta`). Unmatched records are reported separately under `bankOnly` / `systemOnly`, not as discrepancies.

**Why this interpretation**: The `ReconciliationResult` type already separates `unmatched` from `discrepancies`, so the schema itself implies they are distinct categories. Amount delta is the only field on `Discrepancy`, so that defines the scope.

---

### 5. What does "focus on USD" mean for non-USD records?

> *"We handle multiple currencies but for now just focus on USD"*

**Ambiguity**: Should the system (a) silently ignore non-USD bank records, (b) reject the entire batch if any non-USD record is present, or (c) process them anyway without currency conversion?

**Assumed answer**: Filter out non-USD bank records before matching and include them in `bankOnly` (unmatched), with a note that multi-currency support is deferred. Do not reject the whole batch.

**Why this interpretation**: Silently dropping records is dangerous in finance — the finance team would never know a CHF transaction went unreconciled. Surfacing them as unmatched gives visibility without breaking the USD flow.

---

### 6. Are period boundaries inclusive or exclusive?

> *"Match them against internal payment records for a given period"*

**Ambiguity**: Is `periodEnd` inclusive (`<=`) or exclusive (`<`)? The starter code uses `date < periodEnd` (exclusive), but `between` in Drizzle is inclusive on both ends. This creates an inconsistency between how bank records and system payments are filtered.

**Assumed answer**: `periodStart` is inclusive, `periodEnd` is exclusive — i.e. `[periodStart, periodEnd)`. This is the most common convention for reporting periods and avoids double-counting records that land exactly on midnight.

**Why this interpretation**: Exclusive end dates prevent the same payment appearing in two consecutive reconciliation periods when ranges are defined as back-to-back months.

---

### 7. (Compliance) Does the bank data contain cardholder data (PANs or card numbers)?

> *"Compliance is critical — we're PCI DSS Level 1 and SOC 2 certified"*

**Ambiguity**: The `BankRecord` type includes `description` and `reference` fields. Bank export files frequently embed partial or full card numbers, account numbers, or other PAN-adjacent data in free-text description fields.

**Assumed answer**: I am assuming the bank strips all PAN data before export and the description/reference fields contain only merchant references and narrative text. This assumption must be confirmed before go-live.

**Why this matters**: If `description` can contain a PAN, then: (a) it cannot be logged, (b) it must be encrypted at rest, (c) it cannot appear in API error responses or stack traces, and (d) the `AUDIT.md` finding about `error.stack` leaking in the 500 response becomes a PCI DSS violation, not just a security weakness. The entire data handling model changes.

---

## One Question I Would NOT Ask the Client

**Question**: How should monetary amounts be stored internally — as floating-point dollars or as integer cents?

**Why this is an engineering decision, not a product decision**: The client has no opinion on IEEE 754 representation. They care that `$19.99 + $0.01 = $20.00`, not how the machine achieves it. The correct answer — store as integer cents, convert for display — is a well-established engineering constraint driven by how floating-point arithmetic works, not by any business rule. Asking the client would only confuse them. I own this decision.
