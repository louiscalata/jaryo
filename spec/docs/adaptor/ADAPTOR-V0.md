# Adaptor v0.1: a read-only spike on a self-authored sample pipeline

Status: a working spike, 2026-11-07 (record timestamps are UTC, so they read as 2026-11-08). It shows that the "declared, never assumed" rule can be held in code for one manifest and record format. The pipeline was written for this spike by the same author as the adaptor, and its steps verify this repository, so it is a sample, not independent evidence. It is not an install route and not yet a general adaptor.

## The sample pipeline
`pipeline/run.mjs` runs the steps in `pipeline/jaryo-verify.manifest.json` (hash check, decision tests, color-token check, contrast check, adaptor tests, renderer tests, and a consequential "Request Codex review" step it never runs by itself). It writes one JSONL run record per run to `pipeline/runs/`. It does not import or call any Jaryo code; its steps do check this repository.

## What an adaptor reads
1. **The manifest** (what the pipeline declares): `id`, `name`, `declares.actions`, `declares.events`, optional `declares.heartbeat` (`{ intervalMs, staleAfterMs }`), and `steps[]` with `id`, `name`, `needs[]`, optional `consequential`.
2. **The latest run record** (what it recorded): JSON lines with `event` (`run-start`, `run-end`, `step-start`, `heartbeat`) or `step` plus `status` (`ok`, `failed`, `blocked`, `review`), `reason`, `exit`, `ms`, `tail[]`. One run is shown: the last `run-start` in the newest file.

## What it emits
`jaryo-view/0`: `generatedAt`, `lastEventAt`, `pipeline`, `run`, `capabilities` (`declared`, `eventStream`, `heartbeat`), `actions[]` (declared, or `n/a` with a reason), `steps[]` (state, reason, needs, next, last output), `undeclared[]`, `review.counts`, `warnings[]`.

## The rule, and its one exception
A step's state is copied from a record. It is never inferred from dependencies or from absence. **Exception: RUNNING.** A record cannot say "still running"; it can only say a step started and nothing has ended it. RUNNING is shown only when the manifest declares a heartbeat, the run is open, the step has started, and that step's newest valid timestamp (its latest `step-start` or a `heartbeat` after it) is no older than the declared `staleAfterMs`. Clock skew is tolerated up to `SKEW_MS` (60 s): a step timestamp up to 60 s ahead of the clock counts as fresh, and a record whose newest timestamp is more than 60 s ahead is not trusted for liveness at all. Without a declared heartbeat a started step is UNKNOWN, never RUNNING. A page built from the view also refuses to show RUNNING once its snapshot is older than 2 minutes.

## The declared heartbeat
`declares.heartbeat` is `{ "intervalMs": <integer>, "staleAfterMs": <integer> }`. `intervalMs` is from 100 to 600000; `staleAfterMs` is above `intervalMs` and at most 3600000 (one hour). Anything else is a warning and counts as no heartbeat. The view copies the accepted declaration to `capabilities.heartbeat` (or `null`). `pipeline/run.mjs` writes `{ "step": <id>, "event": "heartbeat" }` every `intervalMs` while that step's command runs, and none when the manifest declares no heartbeat or one the adaptor would reject (the runner applies the same bounds). Commands run through async `spawn` so the timer can fire; as before, each of stdout and stderr is capped at 1 MiB, and a step over it is stopped and failed with an `ENOBUFS` reason. A command that cannot start now records `spawn <cmd> ENOENT` where the synchronous runner recorded `spawnSync <cmd> ENOENT`. The sample manifest declares 5000 / 30000. The recorded runs 1 to 5 predate the declaration and contain no heartbeat lines; every step in them has a result, so their views are unchanged apart from the new `capabilities.heartbeat` field. The `reference/adaptor-view*.html` pages embed views built before that field existed and were not rebuilt, so a rebuild would add it.

| Situation | State shown |
|---|---|
| Record says ok / failed / blocked / review | OK / FAILED / BLOCKED / REVIEW, with the record's reason |
| ok with a non-zero exit, or failed with exit 0 | UNKNOWN: the record contradicts itself |
| No record for the step in the latest run | UNKNOWN |
| Started again after an earlier result | RUNNING (fresh) or UNKNOWN (stale), never the old result |
| Started, run open, heartbeat declared, the step's latest start or heartbeat within `staleAfterMs` | RUNNING |
| Started, run open, but no heartbeat declared (or a malformed one) | UNKNOWN: "the manifest declares no heartbeat" |
| Started, run open, the step's own start or heartbeat older than `staleAfterMs` (another step's heartbeat does not count), or no valid timestamp, or a record timestamp more than 60 s in the future | UNKNOWN |
| A heartbeat with no `step-start` for that step, or after its result | ignored for state |
| Started, run ended, no result for it | UNKNOWN: "the run ended with no result recorded" |
| Unrecognised status string | UNKNOWN, reason quotes it |
| Record mentions a step the manifest does not declare | `undeclared`, UNKNOWN, no name, record id shown as a record id |
| Manifest declares the same id twice | both rows UNKNOWN, warning |
| Corrupt line, non-object line, BOM | ignored or stripped; corrupt lines are listed in `warnings` |
| File holds several runs, or a run-end from another run | last run only, warning |
| Malformed manifest | no steps or no actions, warnings, never a crash |
| Action not in `declares.actions` | `n/a: manifest does not declare <action>` |
| Event stream not mentioned by the manifest | "not declared", not "none" |

Actions that require a review in the view: run, retry, deploy, delete, overwrite. Retry is included because it can re-execute consequential steps.

## What is tested
`tests/adaptor.test.mjs`: 97 checks. They cover the table above, 11 malformed heartbeat declarations, the runner against real child processes (exit codes, a command that cannot start, a failed dependency, a missing env var, a consequential step never executed, numbering after pruning, scrubbed paths, heartbeats written only when declared, never for a declaration the adaptor rejects, and only between a step's start and its result, the 1 MiB per-stream output cap), end-to-end checks (including a record cut mid-step that is RUNNING within `staleAfterMs` of its last heartbeat and UNKNOWN after it), and 18 mutants of the adaptor (guess OK, show RUNNING when stale, assume an undeclared heartbeat, ignore the declared window, judge a step by another step's heartbeat, accept a window at or below the interval or above the cap, trust a future timestamp, accept any status, offer every action, ignore a restart, ignore exit contradictions, merge runs, accept another run's end, drop retry from review, sort files as text, uncapped tail, keep a duplicate id's state, copy an undeclared step's status), each of which must make the suite fail.
`tests/nisi-journal-adaptor.test.mjs`: 119 checks, run by `tests/adaptor.test.mjs` (so the CI step runs them) or on its own. They cover the Nisi table and rules above, the Nisi sample fixture, the CLI, the bounded file read, that the view has `buildView`'s keys plus `source`, and 27 mutants of the Nisi adaptor (show OK because of the footer, copy every Nisi state, treat QUEUED as RUNNING, show RUNNING without a declared heartbeat, never expire an entry, expire it one millisecond late, use `ttlMs` as a heartbeat tolerance, count expiry from the heartbeat, ignore the header's `heartbeatTtlMs`, ignore the declared window, accept a header without a `heartbeatTtlMs`, accept a `heartbeatAt` after `createdAt`, go stale one millisecond late, use the header's `now`, trust a future timestamp, ignore revocations, let a revocation be a stage's result, skip the project check, accept another project's entries, no byte limit, count characters instead of bytes, read past the footer, merge runs, drop the unauthenticated label, call the journal authenticated, read a file unbounded, let the first entry win), each of which must make the suite fail.
`tests/nisi-differential.test.mjs`: 27 checks, run by `tests/adaptor.test.mjs` (the combined total is 243) or on its own. It replays the recorded Nisi corpus (previous section), checks that the corpus is what its generator writes, that it reaches the boundaries it claims to, and that 12 mutants of the Nisi adaptor each make the replay fail.
`tests/render.test.mjs`: 21 checks, needs `JSDOM`. A hostile view document (script close tags, an img with an onerror handler, markup, U+2028, comment openers in names, ids, reasons and output) must not create an element or a script; wrong or incomplete documents are refused, not half-rendered; an old snapshot never shows RUNNING; the page says it is read-only.

## A second adaptor: the Nisi run journal
`adaptor/nisi-journal-adaptor.mjs` reads a pipeline manifest and a Nisi run journal (`nisi-run-journal-v1` JSONL: one header line, entry lines, one footer line) and emits the same `jaryo-view/0` document as `buildView`, so `build-view-page.mjs`, the page and `tests/render.test.mjs` apply unchanged. It reads the manifest through `buildView` itself, so actions, capabilities, the heartbeat declaration, needs and duplicate ids behave as above. It is read-only and does not import Nisi: Nisi is a separate repository. Usage: `node adaptor/nisi-journal-adaptor.mjs <manifest.json> <journal.jsonl>`.

A journal entry maps to the manifest step whose `id` equals its `stage`. Only the run of the last entry is shown (several runs: warning). Within that run, the latest entry for a stage is its state.

| Journal | State shown |
|---|---|
| `SUCCEEDED` / `FAILED` | OK / FAILED (FAILED is still an open spec question, finding 1) |
| `RUNNING`, manifest declares a heartbeat, the entry has not expired (Jaryo's clock is before `createdAt` + `ttlMs`), and its `heartbeatAt` is no older than the smaller of the declared `staleAfterMs` and the header's `config.heartbeatTtlMs` | RUNNING |
| `RUNNING`, but no declared heartbeat, an expired entry, an older `heartbeatAt`, no valid `createdAt`, `heartbeatAt` or `ttlMs`, a `heartbeatAt` after `createdAt`, an entry that is not a valid Nisi journal entry, no valid `heartbeatTtlMs` in the header, or a journal timestamp more than 60 s in the future | UNKNOWN, with the reason |
| `QUEUED`, `CANCELLED` | UNKNOWN: "journal says QUEUED" (or CANCELLED) |
| An entry named by the `revokes` of a `REVOKED` entry in the same run, wherever that entry is in the journal | UNKNOWN: "revoked by <id>". A `REVOKED` entry is never itself a stage's result |
| Any other state value | UNKNOWN, reason quotes it |
| No entry for a declared step | UNKNOWN |
| A stage the manifest does not declare | `undeclared`, UNKNOWN, no name |

These rules follow the Nisi journal authentication review (Nisi `docs/reviews/2026-11-14-journal-auth-review.md`, "For the Jaryo Nisi-journal adaptor"):

- **Project.** The header's `config.projectId` must equal the manifest `id`. A mismatch is a warning and every step is UNKNOWN. An entry whose `projectId` differs from the header is ignored and warned about.
- **Clock.** Liveness uses Jaryo's clock. The header's `now` is never used.
- **Liveness follows Nisi.** Nisi's reader (`history/run-journal-v1.mjs`, `docs/run-journal.md`) reports a `RUNNING` entry as `EXPIRED` once the clock reaches `createdAt` + `ttlMs`, and as `UNKNOWN` when `heartbeatAt` is null or older than the header's `heartbeatTtlMs`. `ttlMs` is the entry's lifetime, not a heartbeat tolerance. The adaptor applies both rules and then the manifest's `staleAfterMs`, so it never shows RUNNING where Nisi's reader does not. The header's `heartbeatTtlMs` can only shorten the window; a header without a valid one (a safe integer of at least 1) leaves every `RUNNING` entry UNKNOWN. A `QUEUED` entry is UNKNOWN whether or not it has expired. `RUNNING` is also never shown for an entry that Nisi's writer would refuse (its exact keys, identifier format, integer-only values, no negative zero, no `retryOf` outside a `QUEUED` entry, `revokes` only on a `REVOKED` entry); every other state is still copied from the record, which stays unauthenticated. The differential check below found this gap.
- **Size.** Input over `MAX_JOURNAL_BYTES` (4 MiB, counted in UTF-8 bytes) is refused before it is decoded or parsed, and every step is UNKNOWN. The CLI reads at most that many bytes plus one from one file descriptor. Invalid UTF-8 is refused the same way.
- **Unauthenticated.** The hash chain, the fingerprints and the footer's `lastHash` are not checked. The view carries `source: { format, authenticated: false, chainChecked: false, projectId }`, and its first warning says the journal is unauthenticated, so the page always shows it. Checking the chain would not change that: it is unkeyed and shows only that the file is intact.
- **The footer is not a result.** The footer never makes a step OK and never ends the run: the format has no run-end, so `run.endedAt` is null and `run.state` is `running` or `unknown`. A missing footer, a footer count that does not match the entry lines, and lines after the footer are warnings; lines after the footer are ignored.

Unreadable lines, entries without a string `id`, `runId` and `stage`, and repeated entry ids are ignored and counted in a warning. `spec/pipeline/fixtures/nisi-journal-sample.jsonl` is a byte-for-byte copy of Nisi's synthetic `fixtures/sample-data/journal.jsonl` (Nisi `cf1eece`). It is not working data.

## Differential check against Nisi
The adaptor re-implements Nisi's liveness rules, so the claim "never RUNNING where Nisi says otherwise" needs Nisi's own answers, not only the tests' reading of them. `adaptor/differential-nisi.mjs` generates journal states and `pipeline/fixtures/nisi-differential-corpus.jsonl` records what Nisi's reader (`history/run-journal-v1.mjs`, Nisi `3bfc6021a6f3ce7d3482851ca5081e06d979b8bc`) said about each. `tests/nisi-differential.test.mjs` replays the corpus against the adaptor with no Nisi and no network, so the repositories stay separate.

**Generate.** Export Nisi with `git archive` into a folder outside this repository, then `node adaptor/differential-nisi.mjs --nisi <export dir> --commit <40-hex>` (`--check` compares with the tracked file instead of writing). The generator is seeded, so the same Nisi gives the same bytes. For each state it creates a Nisi journal with the header's `heartbeatTtlMs`, appends the entries, and records `list(now).liveness` per entry; when Nisi can hold the journal it also checks that `reopen` of Nisi's own serialization gives the same liveness and that the adaptor shows the same view for Nisi's text as for the corpus's placeholder-hash text.

**What the corpus covers.** 4,624 states: every boundary of the entry's `ttlMs`, the header's `heartbeatTtlMs` and the manifest's `staleAfterMs` (equal timestamps, one millisecond either side, `heartbeatAt` null or after `createdAt`), every state before, at and after expiry, revocations in both orders and in the wrong run or attempt, several stages and runs, repeated ids, retries, an invalid or missing header limit, a clock behind the journal's, every entry field set to 21 odd values (null, empty and long strings, negative, fractional and unsafe numbers, booleans, arrays, objects) or removed, and 1,399 seeded random states. Nisi held every entry, its clock and its header in 2,226 of them and refused something in 2,398 (1,383 entries refused as `ENTRY`, 707 clocks refused as `TIME`, 269 revocations, 23 headers, 7 retries, 7 projects, 1 duplicate, 1 conflict).

**Judge.** Where Nisi held everything, every declared step must equal what Nisi's liveness allows: `SUCCEEDED`, `FAILED` copied as OK, FAILED; `RUNNING` shown only while `now - heartbeatAt` is within the manifest's `staleAfterMs`, UNKNOWN beyond it; every other liveness (`EXPIRED`, `UNKNOWN`, `REVOKED`, `QUEUED`, `CANCELLED`) UNKNOWN. Where Nisi refused something, the adaptor is judged on the claim: no step RUNNING when Nisi refused the header or Jaryo's clock is more than 60 s behind the journal's, and none RUNNING for an entry Nisi did not hold.

**Result.** The liveness rules agree with Nisi's in all 2,226 fully held states, including every boundary. The check found two classes of disagreement in the other states:

| Class | States | What it is | Decision |
| --- | --- | --- | --- |
| Entry Nisi would refuse | 120 | The adaptor showed RUNNING for an entry with a wrong-typed or missing `attempt`, `candidateId`, `receiptId`, `retryOf`, `revokes` or `payload`, an extra key, an identifier outside Nisi's format, a float in the `payload`, `revokes` on a non-`REVOKED` entry or `retryOf` on a `RUNNING` entry. Nisi's `append` throws `ENTRY` or refuses the retry, and its `reopen` rejects a file that holds such a row. | Bug, fixed: the adaptor now requires Nisi's entry shape before showing RUNNING. Tests first: the pinned counts failed at 120 before the change and pass at 1 after. |
| Clock behind the journal by at most 60 s | 97 | Nisi's reader throws `TIME` when its clock is earlier than the journal's watermark. The adaptor judges against Jaryo's own clock and tolerates 60 s of skew. | Intended, documented here: not changed. Beyond 60 s the adaptor refuses to judge liveness and no state in the corpus shows RUNNING. |
| One repeated id | 1 | The same `RUNNING` entry appended twice. Nisi reports a duplicate and its `reopen` rejects the file; the adaptor ignores the repeat, warns, and shows the first entry, which Nisi holds as RUNNING. | Intended: the shown state equals Nisi's for the entry it holds. Not changed. |

The test pins these counts, so a new disagreement fails it. What the check does not show: the adaptor still copies OK and FAILED from entries Nisi would refuse and never checks the hash chain, so the view stays labelled unauthenticated; the corpus is generated, not a journal from a real Nisi run; and it compares one Nisi commit. A newer Nisi needs the corpus regenerated and the new verdicts reviewed.

## The pages
`reference/adaptor-view.html` shows the latest real run (all declared steps OK, the Codex-review step REVIEW). `adaptor-view-failed-example.html` shows run 2, where `JSDOM` was deliberately pointed at a missing path, so two steps FAILED and the review step is BLOCKED behind them. `adaptor-view-undeclared-fixture.html` is run 3 with one invented record line added, to show an undiscovered step. The pages only display a record; they cannot run anything.

The runs in `pipeline/runs/` are the ones made after the runner and adaptor were reviewed: run 1 had `JSDOM` unset (blocked steps), run 2 was the deliberate failure, runs 3, 4 and 5 were clean (run 5 is the latest and is what `adaptor-view.html` shows; it is the first with the reference accessibility checks as a step). Earlier runs from the first draft of the runner were discarded because they recorded absolute paths.

## Findings from building it
1. **The spec has no failed state and conflicts with this page.** Its five states are OK, RUNNING, BLOCKED, UNKNOWN, REVIEW. A step that ran and failed is none of these. The view uses `✕ [FAILED]` with the blocked styling, which section 5 reserves for BLOCKED ("a filled panel ... and a word"). Needs an owner decision and a spec change (F09.01, section 5).
2. **The spec does not say what a declared step with no record is.** This spike chose UNKNOWN.
3. **Liveness is a policy, now declared by the pipeline.** The adaptor no longer has a built-in 120 s window; it uses the manifest's `declares.heartbeat`. The bounds (100 ms to 10 min interval, window at most 1 hour) and the 2-minute snapshot rule in the page are still this spike's choices.
4. **Undeclared steps have no name.** The record id is shown as a record id.
5. **Records are trusted as written.** The sample pipeline's record has no hash chain or signature, so a hand-edited record cannot be detected beyond the self-contradiction check. A Nisi journal has an unkeyed hash chain, which this adaptor does not check; even a checked chain would not show who wrote the file or that the events happened, so the Nisi view is labelled unauthenticated.
6. **Not covered:** a pipeline that streams events, a long-lived process, several concurrent runs, adaptors for pipelines you cannot change, and any write action. The Nisi journal adaptor reads a format written by a separate repository, but it was tested only on synthetic journals: Nisi's sample fixture and journals built in the tests, not a journal from a real Nisi run. Nisi is not imported, but a recorded differential corpus now compares the adaptor with Nisi's own reader on generated journal states (next section); a journal from a real Nisi run is still not tested.

## Not covered
The install route (CLI, MCP or a host) is still undecided. The pages are static snapshots, not live views.
