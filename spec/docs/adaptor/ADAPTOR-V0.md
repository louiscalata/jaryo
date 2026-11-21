# Adaptor v0.1: a read-only spike on a self-authored sample pipeline

Status: a working spike, 2026-11-07 (record timestamps are UTC, so they read as 2026-11-08). It shows that the "declared, never assumed" rule can be held in code for one manifest and record format. The pipeline was written for this spike by the same author as the adaptor, and its steps verify this repository, so it is a sample, not independent evidence. It is not an install route and not yet a general adaptor.

## The sample pipeline
`pipeline/run.mjs` runs the steps in `pipeline/jaryo-verify.manifest.json` (hash check, decision tests, color-token check, contrast check, adaptor tests, renderer tests, and a consequential "Request Codex review" step it never runs by itself). It writes one JSONL run record per run to `pipeline/runs/`. It does not import or call any Jaryo code; its steps do check this repository.

## What an adaptor reads
1. **The manifest** (what the pipeline declares): `id`, `name`, `declares.actions`, `declares.events`, optional `declares.heartbeat` (`{ intervalMs, staleAfterMs }`), and `steps[]` with `id`, `name`, `needs[]`, optional `consequential`.
2. **The latest run record** (what it recorded): JSON lines with `event` (`run-start`, `run-end`, `step-start`, `heartbeat`) or `step` plus `status` (`ok`, `failed`, `blocked`, `review`), `reason`, `exit`, `ms`, `tail[]`. One run is shown: the last `run-start` in the newest file.

## What it emits
`jaryo-view/0`: `generatedAt`, `lastEventAt`, `pipeline`, `run`, `capabilities` (`declared`, `eventStream`, `heartbeat`), `actions[]` (declared, or `n/a` with a reason), `steps[]` (state, reason, needs, next, last output), `undeclared[]`, `review.counts`, `warnings[]`.

## Connect another pipeline

The pipeline host owns execution, declarations and run records. An adaptor reads
one source format and translates its evidence into `jaryo-view/0`. A front end
calls `connect` in [sources.mjs](../../adaptor/sources.mjs) and presents that view.
The current CLI reads the inputs and may write an HTML snapshot at the operator's
requested output path. It does not start, retry or change a pipeline.

Before connecting a pipeline, record its source format, the location of its
manifest and run records, and the following declarations. For each unavailable
item, record why in the integration handoff. Omit unsupported capabilities from
the manifest.

| Item | What the host or adaptor supplies |
|---|---|
| Pipeline and steps | A stable pipeline `id` and one unique `steps[].id` per named step. The record must use those same step identifiers. For Nisi, match the manifest `id` to the journal's `config.projectId` and each step ID to an entry's `stage`. |
| Links | Populate `steps[].needs` from declared upstream step IDs. Use an empty list for a step with no dependencies. If the source cannot describe dependencies, record that gap in the handoff. Step order gives no evidence of a dependency. |
| Inputs and outputs | Identify the pipeline inputs and outputs that the host actually declares, and where to see them. The current view reads step dependencies but has no fields for individual data bindings or input values. |
| Runs | Explain how the source identifies and selects a run. For `record`, use the last run in the newest numbered record file. For `nisi`, use the run of the journal's last entry. If the source supports liveness, declare the heartbeat and use the source's own step timestamps. |
| Logs and events | Document the source of output and reasons, and which of them can be shared. Declare `events: true` or `events: false` only when the host can make that statement. The current CLI reads a snapshot. Keep raw logs private and use redacted diagnostic output. |
| Actions | Put supported action names in `declares.actions`. Name unavailable actions and their reasons in the handoff. Declarations describe the host's capabilities. The read-only CLI has no action execution API. |

Use `jaryo sources` to list accepted inputs, or run
`node spec/adaptor/jaryo-cli.mjs sources` from the repository root. Pass the
exported journal file for `--kind nisi` or the directory of numbered JSONL run
records for `--kind record`.
A new record format requires a new adaptor and an entry in `SOURCES`.

Verify a real run by matching each displayed state to the selected source record.
Then repeat against scratch copies with one step declaration and one recorded
state removed. The undeclared row must be unnamed and UNKNOWN. The declared step
without evidence must also be UNKNOWN. Check that the manifest and records keep
the same bytes before and after the CLI reads them. Record what was verified
about the source in the integration handoff. The Nisi adaptor explicitly marks
its view unauthenticated.

## The rule, and its one exception
A step's state is copied from a record. It is never inferred from dependencies or from absence. **Exception: RUNNING.** A record cannot say "still running"; it can only say a step started and nothing has ended it. RUNNING is shown only when the manifest declares a heartbeat, the run is open, the step has started, and that step's newest valid timestamp (its latest `step-start` or a `heartbeat` after it) is no older than the declared `staleAfterMs`. Clock skew is tolerated up to `SKEW_MS` (60 s): a step timestamp up to 60 s ahead of the clock counts as fresh, and a record whose newest timestamp is more than 60 s ahead is not trusted for liveness at all. Without a declared heartbeat a started step is UNKNOWN, never RUNNING. A page built from the view also refuses to show RUNNING once its snapshot is older than 2 minutes.

## The declared heartbeat
`declares.heartbeat` is `{ "intervalMs": <integer>, "staleAfterMs": <integer> }`. `intervalMs` is from 100 to 600000; `staleAfterMs` is above `intervalMs` and at most 3600000 (one hour). Anything else is a warning and counts as no heartbeat. The view copies the accepted declaration to `capabilities.heartbeat` (or `null`). `pipeline/run.mjs` writes `{ "step": <id>, "event": "heartbeat" }` every `intervalMs` while that step's command runs, and none when the manifest declares no heartbeat or one the adaptor would reject (the runner applies the same bounds). Commands run through async `spawn` so the timer can fire; as before, each of stdout and stderr is capped at 1 MiB, and a step over it is stopped and failed with an `ENOBUFS` reason. A command that cannot start now records `spawn <cmd> ENOENT` where the synchronous runner recorded `spawnSync <cmd> ENOENT`. The sample manifest declares 5000 / 30000. The recorded runs 1 to 5 predate the declaration and contain no heartbeat lines; every step in them has a result. The generated pages replay their historical manifest declarations and generation times, with `capabilities.heartbeat: null` when no heartbeat was declared.

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
| Corrupt or non-object line in the selected run | warning; earlier step evidence becomes UNKNOWN with no old output, because the line may hide a restart; a newer result or start restores only its own step |
| Corruption before the selected run, or BOM | earlier corruption does not invalidate the new run; BOM is stripped at the start of the file |
| File holds several runs | last run only, warning |
| Selected run-start has an explicit run ID; event has a different explicit run ID | ignored with a warning, including results, restarts, heartbeats, timestamps, undeclared steps and run ends |
| Event has no run ID | remains eligible under legacy behavior |
| Selected run-start has no run ID | tagged events are also accepted; this path does not establish run isolation |
| Malformed manifest | no steps or no actions, warnings, never a crash |
| Action not in `declares.actions` | `n/a: manifest does not declare <action>` |
| Event stream not mentioned by the manifest | "not declared", not "none" |

Actions that require a review in the view: run, retry, deploy, delete, overwrite. Retry is included because it can re-execute consequential steps.

Output tails are redacted before selecting the last six lines and capping each
at 500 characters. The patterns cover Bearer/Basic authorization, credential
assignments (including quoted values with escapes), URL user/password pairs,
common provider-token forms and multiline private-key blocks, including an
unterminated block. Empty output remains empty. Ordinary output, including
token-check filenames, stays visible. This filtering does not guarantee removal
of arbitrary secrets in prose or unfamiliar encodings. Raw JSONL files are not
rewritten and still require private custody. The rule applies to sample-record
output; the separate Nisi reader's authority and clock rules are unchanged.

## What is tested
`tests/adaptor.test.mjs`: the combined entry point passes 587/587 checks, including the sample-record adaptor and runner, the Nisi journal and reader checks, corpus replay and 70 focused security checks. Existing heartbeat, caller-clock, explicit FAILED-reason and runner cases remain covered.

`tests/nisi-journal-adaptor.test.mjs`: 360/360 checks through the existing CI entry point. Journal coverage contributes 134 checks, including the synthetic sample fixture, CLI, bounded file reads, copied states, heartbeat boundaries and 26 mutants. Its liveness fixtures use canonical text, real hashes and a header clock at or after creation. A header more than 60 s ahead prevents RUNNING.

`tests/nisi-reader-agreement.test.mjs`: included in that journal total; 174 regression assertions and 52 distinct mutants of the reader boundary, all killed by failed assertions after successful imports. Syntax errors, import errors and thrown test runs are harness failures, never kills. The initial expanded regression suite was run before the implementation changed: 32/155 passed, with 123 false-RUNNING failures. The final suite against the saved old adaptor passes 40/174, with 134 failures; the fixed adaptor passes 174/174.

`tests/nisi-differential.test.mjs`: 33/33 checks, including replay of the recorded corpus, boundary and coverage assertions, deterministic case regeneration, and 12 mutations each caught by the replay.

`tests/render.test.mjs`: 51/51 checks, needs `JSDOM`. A hostile view document (script close tags, an img with an onerror handler, markup, U+2028, comment openers in names, ids, reasons and output) must not create an element or a script; wrong or incomplete documents are refused, not half-rendered; an old snapshot never shows RUNNING; the page says it is read-only; a FAILED row and a BLOCKED row are styled apart. Captured credentials must be absent from both generated HTML and the rendered inspector, while ordinary output remains visible. The checks also run from a copied path containing special characters.

`tests/adaptor-security.test.mjs`: 70/70 checks for corruption boundaries and
per-step recovery, foreign-run exclusion, existing per-step heartbeat rules,
redaction before tail selection, empty output and ordinary text. Against the
pre-change sample adaptor, 20/70 pass and 50 fail. The focused suite is imported
by the existing adaptor entry point.

`tests/adaptor-security-harness.mjs`: all 48 distinct behavioral mutants are
caught by named assertions after successful imports; import errors, syntax
errors and non-assertion failures do not count as kills. The seeded stream
differential checks 8,192 hostile records against a separate state model, 8,192
compatible whole views against the pre-change adaptor and 8,192 credential
outputs against literal expectations, with zero mismatches. The existing view
contract harness also catches 40 adaptor and 49 template mutants and reports
zero mismatches for 8,192 adaptor inputs, 8,192 journal clock checks, 4,137
baseline comparisons and 4,096 selections across 64 jsdom pages. Commands and
evidence limits are in `docs/CHECKS.md` at the repository root.

## A second adaptor: the Nisi run journal
`adaptor/nisi-journal-adaptor.mjs` reads a pipeline manifest and a Nisi run journal (`nisi-run-journal-v1` JSONL: one header line, entry lines, one footer line) and emits the same `jaryo-view/0` document as `buildView`, so `build-view-page.mjs`, the page and `tests/render.test.mjs` apply unchanged. It reads the manifest through `buildView` itself, so actions, capabilities, the heartbeat declaration, needs and duplicate ids behave as above. It is read-only and does not import Nisi: Nisi is a separate repository. Usage: `node adaptor/nisi-journal-adaptor.mjs <manifest.json> <journal.jsonl>`.

A journal entry maps to the manifest step whose `id` equals its `stage`. Only the run of the last entry is shown (several runs: warning). Within that run, the latest entry for a stage is its state.

| Journal | State shown |
|---|---|
| `SUCCEEDED` / `FAILED` | OK / FAILED (FAILED is a state in spec v0.6, finding 1) |
| `RUNNING`, Nisi's reader holds the entry, the header clock is within the skew allowance, the manifest declares a heartbeat, the entry has not expired (Jaryo's clock is before `createdAt` + `ttlMs`), and its `heartbeatAt` is no older than the smaller of the declared `staleAfterMs` and the header's `config.heartbeatTtlMs` | RUNNING |
| `RUNNING`, but no declared heartbeat, an expired entry, an older `heartbeatAt`, no valid `createdAt`, `heartbeatAt` or `ttlMs`, a `heartbeatAt` after `createdAt`, an entry that is not a valid Nisi journal entry, no valid `heartbeatTtlMs` in the header, or a journal timestamp more than 60 s in the future | UNKNOWN, with the reason |
| `QUEUED`, `CANCELLED` | UNKNOWN: "journal says QUEUED" (or CANCELLED) |
| An entry named by the `revokes` of a `REVOKED` entry in the same run, wherever that entry is in the journal | UNKNOWN: "revoked by <id>". A `REVOKED` entry is never itself a stage's result |
| Any other state value | UNKNOWN, reason quotes it |
| No entry for a declared step | UNKNOWN |
| A stage the manifest does not declare | `undeclared`, UNKNOWN, no name |

These rules follow the Nisi journal authentication review (Nisi `docs/reviews/2026-11-14-journal-auth-review.md`, "For the Jaryo Nisi-journal adaptor"):

- **Project.** The header's `config.projectId` must equal the manifest `id`. A mismatch is a warning and every step is UNKNOWN. An entry whose `projectId` differs from the header is ignored and warned about.
- **Clock.** Freshness and expiry use Jaryo's clock. A valid header's `now` more than 60 s ahead of that clock prevents RUNNING. The existing allowance at exactly 60 s remains; it intentionally differs from Nisi, whose `list(now)` rejects any clock earlier than its watermark.
- **Liveness follows Nisi.** Before showing RUNNING, a separate reader gate requires that Nisi's reader would hold the entry. It validates the exact header/config key sets, safe integer clock, identifier, heartbeat limit, `maxEntries` range and nonoverlapping redaction paths. It reads canonical JSON text only: alternate numeric forms, duplicate keys, different key order, spacing, BOM and CRLF are rejected. Each envelope, record and entry must satisfy the reader's key, type, content, retention, redaction, retry, revocation, sequence, hash and fingerprint rules. Parsing stops at the first rejected line; later entries cannot supply RUNNING. The legacy retired-fingerprint rule trims the held prefix only after an otherwise complete parse, as Nisi does.
- **Heartbeat.** Nisi reports a RUNNING entry as EXPIRED at `createdAt + ttlMs` and UNKNOWN for a null heartbeat or one older than `heartbeatTtlMs`. Jaryo applies those rules and the manifest's `staleAfterMs`, using the smaller heartbeat window. Missing or rejected header fields leave RUNNING entries UNKNOWN. Existing copying of terminal states remains unauthenticated, including on malformed input.
- **Size.** Input over `MAX_JOURNAL_BYTES` (4 MiB, counted in UTF-8 bytes) is refused before it is decoded or parsed, and every step is UNKNOWN. The CLI reads at most that many bytes plus one from one file descriptor. Invalid UTF-8 is refused the same way.
- **Unauthenticated.** Integrity checks apply to the RUNNING gate, not to copied terminal states. The overall view therefore retains `source: { format, authenticated: false, chainChecked: false, projectId }`, and its first warning explains that boundary. The unkeyed chain does not establish who wrote the file or that events happened.
- **The footer is not a result.** It never makes a step OK or ends the run: `run.endedAt` is null. Nisi can hold a recovered prefix despite a missing or rejected footer. An unterminated final line is dropped before reading; without a footer or final newline, that can drop the last entry. Data after a footer cannot supply RUNNING. Footer problems remain warnings for copied terminal results.

The terminal-state display still skips unreadable lines, entries without string `id`, `runId` and `stage`, and repeated ids, with warnings. RUNNING additionally requires membership in the strict reader-held prefix. A repeated id may leave the first held entry RUNNING, but neither the rejected repeat nor later entries can establish liveness. `spec/pipeline/fixtures/nisi-journal-sample.jsonl` is a byte-for-byte copy of Nisi's synthetic `fixtures/sample-data/journal.jsonl` (Nisi `cf1eece`). It is not working data.

## Differential check against Nisi
`adaptor/differential-nisi.mjs` generates journal text and `pipeline/fixtures/nisi-differential-corpus.jsonl` records the actual answers from Nisi's `reopen(text)` followed by `list(now)`. The pinned reader is `history/run-journal-v1.mjs` at `276ed7e5f4ba82ee7c64d5c1b342cffe883da145`. Replay needs neither Nisi nor a network.

**Generate.** Export Nisi with `git archive` into a folder outside this repository, then run `node adaptor/differential-nisi.mjs --nisi <export dir> --commit <40-hex>`. `--check` regenerates and compares bytes with the tracked corpus. The seed is 20261116. Journals have real hashes and fingerprints before wire mutations; forged valid chains exercise content rejection instead of stopping at a placeholder hash. The oracle is the file reader, not the append API.

**Coverage and result.** The corpus contains 6,923 states, including 2,297 new reader-specific states: header clocks independent of Jaryo's clock; missing, extra, wrong-typed and noncanonical header/config fields; redaction-path forms; rejected lines followed by live entries; duplicate ids and keys; decimal/exponent numeric spellings; creation after the header clock; record retention and envelope shapes; footer and final-newline variants. The existing expiry, heartbeat, state, retry, revocation and seeded random cases remain.

| Reader outcome | States |
| --- | ---: |
| COMPLETE and listable | 2,260 |
| COMPLETE but clock refused | 712 |
| Header refused | 687 |
| Recovered prefix and listable | 1,951 |
| Recovered prefix but clock refused | 1,313 |

Every declared state agrees with the expected state in the 2,260 complete, listable cases. Those views contain 240 RUNNING step outputs, 157 OK and 117 FAILED; 170 step outputs are UNKNOWN because the manifest's heartbeat window is tighter than Nisi's. Rejected journals are checked for false RUNNING against the held prefix. The saved old adaptor has 1,969 hard disagreements on this corpus; the fixed adaptor has none. Running the actual replay test against the saved old adaptor also fails its reader-agreement assertion.

The only allowed disagreement is the documented clock tolerance: 185 RUNNING step instances where Jaryo is at most 60 s behind the header. The test pins that count. Repeated ids have no blanket exception: the selected RUNNING entry must be one the reader holds.

**Additional generated checks.** A separate 12,000-state forged-journal differential compares the gate's recovered entry ids with Nisi's actual reader: no mismatches. A separate 3,000-journal control uses Nisi's writer, then compares old and new adaptor step states at or after the header clock: no mismatches, including 225 RUNNING outputs. The string-code-unit budget boundary was checked with a preseeded internal budget; a large end-to-end allocation was NOT_RUN on the shared machine.

These checks cover generated journals at one Nisi commit. A journal from a real Nisi run, full repository suites, browser checks, native devices and CI are NOT_RUN for this change. Regenerate and review the corpus when Nisi's reader changes. Copied terminal states remain unchecked, and no result authenticates the writer.

## The pages
`reference/adaptor-view.html` shows the latest real run (all declared steps OK, the Codex-review step REVIEW). `adaptor-view-failed-example.html` shows run 2, where `JSDOM` was deliberately pointed at a missing path, so two steps FAILED and the review step is BLOCKED behind them. `adaptor-view-undeclared-fixture.html` is run 3 with one invented record line added, to show an undiscovered step. The pages only display a record; they cannot run anything.

The runs in `pipeline/runs/` are the ones made after the runner and adaptor were reviewed: run 1 had `JSDOM` unset (blocked steps), run 2 was the deliberate failure, runs 3, 4 and 5 were clean (run 5 is the latest and is what `adaptor-view.html` shows; it is the first with the reference accessibility checks as a step). Earlier runs from the first draft of the runner were discarded because they recorded absolute paths.

## Findings from building it
1. **The spec had no failed state and conflicted with this page.** Spec v0.5e had five states (OK, RUNNING, BLOCKED, UNKNOWN, REVIEW), and the view drew `✕ [FAILED]` with the blocked styling that section 5 reserved for BLOCKED. Addressed in spec v0.6, proposed and awaiting the owner's confirmation: FAILED is a sixth state with its own word and shape (an unfilled row with a solid 6px rule, where BLOCKED is a filled panel with a double rule), and no new colour. The template styles FAILED that way, and the three `reference/adaptor-view*.html` pages carry the new template with their recorded views unchanged. The adaptor's states did not change.
2. **The spec did not say what a declared step with no record is.** This spike chose UNKNOWN; spec v0.6 section 6.9 now says the same, with the reason (blocked would claim a cause the record does not give).
3. **Liveness is a policy, now declared by the pipeline.** The adaptor no longer has a built-in 120 s window; it uses the manifest's `declares.heartbeat`. Spec v0.6 section 6.9 records the rule (RUNNING only with a declared heartbeat; the window belongs to the pipeline). The bounds (100 ms to 10 min interval, window at most 1 hour) and the 2-minute snapshot rule in the page are still this spike's choices, and the spec says so.
4. **Undeclared steps have no name.** The record id is shown as a record id.
5. **Records are trusted as written.** The sample pipeline's record has no hash chain or signature, so a hand-edited record cannot be detected beyond the self-contradiction check. A Nisi journal has an unkeyed hash chain, which this adaptor checks only to gate RUNNING; even a checked chain would not show who wrote the file or that the events happened, so the Nisi view is labelled unauthenticated.
6. **Not covered:** a pipeline that streams events, a long-lived process, several concurrent runs, adaptors for pipelines you cannot change, and any write action. The Nisi journal adaptor reads a format written by a separate repository, and it was tested on synthetic journals (Nisi's sample fixture and journals built in the tests) and, since 2026-11-19, on a journal written by Nisi's own bundle-restart demo (deterministic, no model calls; `pipeline/fixtures/nisi-bundle-demo-journal.jsonl`), where Nisi's reader agrees: COMPLETE, `fixed-run` SUCCEEDED, `tests` liveness UNKNOWN. Nisi is not imported, but a recorded differential corpus now compares the adaptor with Nisi's own reader on generated journal states (next section); a live, long-running Nisi pipeline is still not tested.

## Not covered
The install route is a read-only CLI (`adaptor/jaryo-cli.mjs`, LOU-29); an MCP server or MCP-Apps host can come later through `adaptor/sources.mjs`. The pages are still static snapshots, not live views.
