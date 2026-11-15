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
`tests/render.test.mjs`: 21 checks, needs `JSDOM`. A hostile view document (script close tags, an img with an onerror handler, markup, U+2028, comment openers in names, ids, reasons and output) must not create an element or a script; wrong or incomplete documents are refused, not half-rendered; an old snapshot never shows RUNNING; the page says it is read-only.

## The pages
`reference/adaptor-view.html` shows the latest real run (all declared steps OK, the Codex-review step REVIEW). `adaptor-view-failed-example.html` shows run 2, where `JSDOM` was deliberately pointed at a missing path, so two steps FAILED and the review step is BLOCKED behind them. `adaptor-view-undeclared-fixture.html` is run 3 with one invented record line added, to show an undiscovered step. The pages only display a record; they cannot run anything.

The runs in `pipeline/runs/` are the ones made after the runner and adaptor were reviewed: run 1 had `JSDOM` unset (blocked steps), run 2 was the deliberate failure, runs 3, 4 and 5 were clean (run 5 is the latest and is what `adaptor-view.html` shows; it is the first with the reference accessibility checks as a step). Earlier runs from the first draft of the runner were discarded because they recorded absolute paths.

## Findings from building it
1. **The spec has no failed state and conflicts with this page.** Its five states are OK, RUNNING, BLOCKED, UNKNOWN, REVIEW. A step that ran and failed is none of these. The view uses `✕ [FAILED]` with the blocked styling, which section 5 reserves for BLOCKED ("a filled panel ... and a word"). Needs an owner decision and a spec change (F09.01, section 5).
2. **The spec does not say what a declared step with no record is.** This spike chose UNKNOWN.
3. **Liveness is a policy, now declared by the pipeline.** The adaptor no longer has a built-in 120 s window; it uses the manifest's `declares.heartbeat`. The bounds (100 ms to 10 min interval, window at most 1 hour) and the 2-minute snapshot rule in the page are still this spike's choices.
4. **Undeclared steps have no name.** The record id is shown as a record id.
5. **Records are trusted as written.** There is no hash chain or signature, so a hand-edited record cannot be detected beyond the self-contradiction check.
6. **Not covered:** a pipeline that streams events, a long-lived process, several concurrent runs, adaptors for pipelines you cannot change, any write action, and any pipeline not written alongside the adaptor.

## Not covered
The install route (CLI, MCP or a host) is still undecided. The pages are static snapshots, not live views.
