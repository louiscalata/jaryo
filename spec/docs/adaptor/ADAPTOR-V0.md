# Adaptor v0.1: a read-only spike on a self-authored sample pipeline

Status: a working spike, 2026-11-07 (record timestamps are UTC, so they read as 2026-11-08). It shows that the "declared, never assumed" rule can be held in code for one manifest and record format. The pipeline was written for this spike by the same author as the adaptor, and its steps verify this repository, so it is a sample, not independent evidence. It is not an install route and not yet a general adaptor.

## The sample pipeline
`pipeline/run.mjs` runs the steps in `pipeline/jaryo-verify.manifest.json` (hash check, decision tests, color-token check, contrast check, adaptor tests, renderer tests, and a consequential "Request Codex review" step it never runs by itself). It writes one JSONL run record per run to `pipeline/runs/`. It does not import or call any Jaryo code; its steps do check this repository.

## What an adaptor reads
1. **The manifest** (what the pipeline declares): `id`, `name`, `declares.actions`, `declares.events`, and `steps[]` with `id`, `name`, `needs[]`, optional `consequential`.
2. **The latest run record** (what it recorded): JSON lines with `event` (`run-start`, `run-end`, `step-start`) or `step` plus `status` (`ok`, `failed`, `blocked`, `review`), `reason`, `exit`, `ms`, `tail[]`. One run is shown: the last `run-start` in the newest file.

## What it emits
`jaryo-view/0`: `generatedAt`, `lastEventAt`, `pipeline`, `run`, `capabilities`, `actions[]` (declared, or `n/a` with a reason), `steps[]` (state, reason, needs, next, last output), `undeclared[]`, `review.counts`, `warnings[]`.

## The rule, and its one exception
A step's state is copied from a record. It is never inferred from dependencies or from absence. **Exception: RUNNING.** A record cannot say "still running"; it can only say a step started and nothing has ended it. RUNNING is shown only when the run is open, the step has started, and the newest valid timestamp is under 120 s old and not in the future. A page built from the view also refuses to show RUNNING once its snapshot is older than 2 minutes. A real adaptor needs the pipeline to declare a heartbeat.

| Situation | State shown |
|---|---|
| Record says ok / failed / blocked / review | OK / FAILED / BLOCKED / REVIEW, with the record's reason |
| ok with a non-zero exit, or failed with exit 0 | UNKNOWN: the record contradicts itself |
| No record for the step in the latest run | UNKNOWN |
| Started again after an earlier result | RUNNING (fresh) or UNKNOWN (stale), never the old result |
| Started, run open, record recent | RUNNING |
| Started, run open, record stale, or no valid timestamp, or timestamp in the future | UNKNOWN |
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
`tests/adaptor.test.mjs`: 63 checks. They cover the table above, the runner against real child processes (exit codes, a command that cannot start, a failed dependency, a missing env var, a consequential step never executed, numbering after pruning, scrubbed paths), an end-to-end check, and 14 mutants of the adaptor (guess OK, show RUNNING when stale, trust a future timestamp, accept any status, offer every action, ignore a restart, ignore exit contradictions, merge runs, accept another run's end, drop retry from review, sort files as text, uncapped tail, keep a duplicate id's state, copy an undeclared step's status), each of which must make the suite fail.
`tests/render.test.mjs`: 21 checks, needs `JSDOM`. A hostile view document (script close tags, an img with an onerror handler, markup, U+2028, comment openers in names, ids, reasons and output) must not create an element or a script; wrong or incomplete documents are refused, not half-rendered; an old snapshot never shows RUNNING; the page says it is read-only.

## The pages
`reference/adaptor-view.html` shows the latest real run (all declared steps OK, the Codex-review step REVIEW). `adaptor-view-failed-example.html` shows run 2, where `JSDOM` was deliberately pointed at a missing path, so two steps FAILED and the review step is BLOCKED behind them. `adaptor-view-undeclared-fixture.html` is run 3 with one invented record line added, to show an undiscovered step. The pages only display a record; they cannot run anything.

The runs in `pipeline/runs/` are the ones made after the runner and adaptor were reviewed: run 1 had `JSDOM` unset (blocked steps), run 2 was the deliberate failure, runs 3, 4 and 5 were clean (run 5 is the latest and is what `adaptor-view.html` shows; it is the first with the reference accessibility checks as a step). Earlier runs from the first draft of the runner were discarded because they recorded absolute paths.

## Findings from building it
1. **The spec has no failed state and conflicts with this page.** Its five states are OK, RUNNING, BLOCKED, UNKNOWN, REVIEW. A step that ran and failed is none of these. The view uses `✕ [FAILED]` with the blocked styling, which section 5 reserves for BLOCKED ("a filled panel ... and a word"). Needs an owner decision and a spec change (F09.01, section 5).
2. **The spec does not say what a declared step with no record is.** This spike chose UNKNOWN.
3. **Liveness is a policy.** The 120 s window is arbitrary.
4. **Undeclared steps have no name.** The record id is shown as a record id.
5. **Records are trusted as written.** There is no hash chain or signature, so a hand-edited record cannot be detected beyond the self-contradiction check.
6. **Not covered:** a pipeline that streams events, a long-lived process, several concurrent runs, adaptors for pipelines you cannot change, any write action, and any pipeline not written alongside the adaptor.

## Not covered
The install route (CLI, MCP or a host) is still undecided. The pages are static snapshots, not live views.
