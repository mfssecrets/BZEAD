# Agent Fix Protocol — BZEAD

## ⚠️ MANDATORY — READ THIS FILE BEFORE EVERY SINGLE TASK
- This file MUST be read at the start of every task, no exceptions
- No code changes, no planning, no assumptions until this file is read fully
- This is a paid production service — every fix must be complete, accurate, and verified
- Partial fixes, assumptions, and repeated failures are not acceptable
- If uncertain about placement or behaviour, ASK the user before implementing
- Every fixing must and should fixed end to end before pushing and commit, Remember its a live working site, small errors will broken our complete reputation. 
## The Problem This File Solves
- Half-fixes committed as "done" without full verification
- Assumptions made instead of reading actual code/DB/config
- One fix breaking another working section
- Migrations applied but not committed, or forgotten entirely
- Hardcoding and unsecure activities must avoid completely

---

## MANDATORY PROCESS — Every Single Task

### Step 1: AUDIT FIRST, TOUCH NOTHING
Before writing a single line of code:
- [ ] Read every file involved end-to-end
- [ ] Check DB constraints (`grep -r "CHECK\|CONSTRAINT" supabase/migrations/`)
- [ ] Check storage bucket config (allowed MIME types, size limits)
- [ ] Check all consuming components (not just the one being edited)
- [ ] Check existing migrations for anything that will block the fix
- [ ] Understand the full data flow: UI → service → DB → storage → render

### Step 2: IDENTIFY ALL PROBLEMS AT ONCE
- [ ] List every root cause before fixing anything
- [ ] Never fix symptom 1, commit, then discover symptom 2
- [ ] If 3 things are broken, fix all 3 in one pass

### Step 3: NO HARDCODING
- [ ] No fixed pixel heights (`height: '300px'`) for responsive elements
- [ ] No hardcoded MIME type strings in UI — check DB/bucket config first
- [ ] No hardcoded regex in constraints without checking all use cases it must support
- [ ] Use CSS that responds to content, not magic numbers

### Step 4: CHECK WHAT BREAKS
Before committing, verify these sections still work:
- [ ] Hero Carousel (mobile + desktop)
- [ ] Ad Banner slots 1, 2, 3
- [ ] Video Ads section (upload + YouTube URL)
- [ ] Admin panel banner management page
- [ ] Homepage rendering

### Step 5: MIGRATIONS CHECKLIST
Every DB change must:
- [ ] Have a migration file created in `supabase/migrations/` with timestamp filename
- [ ] Be pushed with `SUPABASE_ACCESS_TOKEN=... supabase db push --linked`
- [ ] Show "Finished supabase db push" in terminal before continuing
- [ ] Be committed and pushed to git AFTER the push confirms success

### Step 6: COMMIT CHECKLIST
- [ ] All changed files staged (`git status` to confirm)
- [ ] Migration files included if a DB change was made
- [ ] `git push` run and confirmed exit code 0
- [ ] No orphaned local changes left uncommitted

---

## Anti-Patterns — Never Do These

| Anti-Pattern | What To Do Instead |
|---|---|
| Fix visible error → commit → discover next error | Audit everything → fix all → commit once |
| `object-fill` / `object-cover` guessing game | Test CSS in browser DevTools first, understand the layout model |
| Add feature without checking DB constraints | `grep chk_ supabase/migrations/` before writing any createBanner call |
| "It's fixed" after first test | Test mobile + desktop + edge cases before saying fixed |
| Forget to push migration | Migration push is part of the fix, not optional |
| Fix one file without checking all files that use it | Search all usages before and after any change |

---

## MOBILE APPS — Native Buyer (Android + iOS)

### Architecture
- **Android:** native Kotlin project in `BZEAD-APK-main/` — App ID `com.bzead.apk`
- **iOS:** native SwiftUI project in `BZEAD-iOS-main/` — App ID `com.bzead.ios`
- Both apps share the same Supabase backend, pricing engine, checkout, and buyer UI (Android is the primary reference for iOS ports)
- Web store (`Bzeadstore-main/`) is separate — do not conflate web PWA with native apps

### Android build
1. Configure `BZEAD-APK-main/local.properties` (Supabase, Stripe, OneSignal keys — gitignored)
2. `cd BZEAD-APK-main && ./gradlew assembleDebug` (or `assembleRelease` with signing configured)
3. Upload release/debug APK to Supabase `app-downloads` when the homepage download link should update

### iOS build (macOS + Xcode)
1. Copy `BZEAD-iOS-main/Secrets.xcconfig.example` → `Secrets.xcconfig` (same keys as Android `local.properties`)
2. `cd BZEAD-iOS-main && xcodegen generate && open BZEAD.xcodeproj`
3. Run on simulator/device or Archive for TestFlight / App Store

### Rebuild native apps when:
- [ ] Any native UI/logic change in `BZEAD-APK-main/` or `BZEAD-iOS-main/`
- [ ] Android manifest, Gradle deps, iOS Info.plist, or push/payment config changes

### Keystore / signing
- [ ] Android release keystore and iOS distribution cert must NEVER be deleted or regenerated casually
- [ ] `local.properties`, `Secrets.xcconfig`, `Secrets.plist`, and build outputs are gitignored

---

## ⚠️ MANDATORY ADDITIONS — Effective Immediately (Strictly Enforced Every Task)

These rules were added after repeated failures where assumptions were made instead of verification. They are **non-negotiable** and apply to **every single task** from this point onward — audit tasks, code tasks, UI tasks, currency tasks, and "just answer me" tasks alike.

### Rule A — NEVER answer data / currency / state questions from reasoning alone
- [ ] If the question involves what is **stored** in the DB (currency, amount, status, ownership, role, settlement, balance, etc.), the answer MUST come from one of: the live row (REST / SQL), the migration file that wrote the column, or the RPC/function that computes the value.
- [ ] Reasoning chains like "X is INR therefore Y is INR" are FORBIDDEN as final answers. They are hypotheses until verified against source.
- [ ] If RLS blocks the direct query, the answer MUST be derived from the SQL of the writing function/trigger — not from the consuming UI code, not from variable names, not from the dashboard's display format.
- [ ] If neither the row nor the SQL can be obtained, the only acceptable answer is: **"UNVERIFIED — I could not read the source of truth because [reason]."** Do not guess.

### Rule B — Read the SOURCE OF TRUTH, not the display layer
- [ ] UI code (`formatPrice`, `formatSellerAmount`, `useCurrency`, etc.) describes how a value is **rendered**, never how it is **stored**.
- [ ] For any storage / accuracy / correctness question, the order of reads is:
  1. The migration that creates / alters the column.
  2. The function / RPC / trigger that writes the column.
  3. The function / RPC that reads it back (e.g. `get_seller_wallet_balance`).
  4. Only then, the UI that displays it.
- [ ] Skipping steps 1–3 and inferring from step 4 is the exact mistake this section exists to prevent.

### Rule C — End-to-end audit before any "it's fine" verdict
- [ ] Before saying "correct", "fine", "works", "shipped", or "done", explicitly list which files / migrations / RPCs were read end-to-end.
- [ ] If the list is empty or partial, the verdict is not allowed — go read first.
- [ ] Verdicts based on "trivially correct because X" are banned. Show the line of SQL or row of data that makes it correct.

### Rule D — Flag downstream risks even on "cosmetic" tasks
- [ ] A redesign / refactor / responsive task is **not** complete if it sits on top of incorrect upstream logic that the change makes more visible.
- [ ] When working on any file that displays money, status, ownership, or permissions, the writer of those values MUST be read first. If the upstream is broken or assumes single-currency / single-country, that fact MUST be reported in the same response as the cosmetic fix — not in a later follow-up.

### Rule E — No assumption short-circuits
- [ ] Phrases like "trivially correct", "obviously fine", "must be", "should be", "presumably" are banned in technical verdicts.
- [ ] If the agent finds itself reasoning "since identity conversion, no bug", STOP — that only proves the conversion step; it does not prove the input currency.

### Rule F — Pre-answer checklist (every task touching data correctness)
Before sending an answer about whether something is correct, the agent MUST be able to tick ALL of:
- [ ] I read the migration(s) that define the column / function involved.
- [ ] I read the writer of the value (RPC / trigger / service).
- [ ] I read the reader (RPC / query / hook).
- [ ] I either queried the live row OR documented exactly why I could not.
- [ ] My verdict cites a specific file path + line range as evidence, not paraphrased intuition.

If any box is unticked, the only allowed response is to do the missing read or to say **"UNVERIFIED — need [specific artifact] before I can answer."**

### Rule G — Multi-currency / multi-country awareness is default
- [ ] BZEAD has buyers and sellers in multiple countries with multiple currencies and a markup pipeline. Every money-related answer MUST account for: buyer country, seller country, product source currency, order currency, ledger currency, display currency.
- [ ] Single-currency assumptions ("everything is INR", "all sellers are India") are FORBIDDEN unless proven for the specific row in question.

### Rule H — Audit-only tasks still follow the audit rules
- [ ] "NO EDITS, ANSWER ME" tasks are subject to Rules A–G in full. The absence of code changes does **not** reduce the verification bar — it raises it, because the answer itself is the deliverable.

### Rule I — Self-check before sending
Every response that contains a verdict, status, or correctness claim must end (internally, before sending) with the agent asking itself:
1. Did I read the writer of this value? — yes / no
2. Did I read the reader? — yes / no
3. Am I about to use the word "trivially" or "obviously" to skip a read? — if yes, STOP and read.
4. If a senior engineer asked "which file and line proves this?", can I quote it? — if no, STOP and read.

If any answer is "no", the response is not ready to send.

### Rule J — Failure of these rules = explicit retraction
- [ ] If, after sending, a previous answer is found to have violated Rules A–I, the agent MUST issue a clear retraction stating: (a) the wrong claim, (b) the rule violated, (c) the corrected claim with source-of-truth citation. No silent correction.

---

## Enforcement
These additions are part of the same mandatory protocol as the original AGENT_RULES.md. There is no "small task" exception, no "obvious answer" exception, and no "user is impatient" exception. Every task — including this one — must comply.

    