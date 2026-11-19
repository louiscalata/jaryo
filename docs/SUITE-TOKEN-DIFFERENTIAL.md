# Lab export versus Suite tokens

The lab export and the Suite's token/configuration file are different contracts.
The snapshot comparison finds limited shared color values; it does not establish
that the Suite consumes `tokens/jaryo.tokens.json` or that the files are
interchangeable. The README's export-only wording is retained. A recorded browser
choice file is a different input from the lab's token export.

## Snapshot and complete receipt

- Lab: `tokens/jaryo.tokens.json` at Jaryo
  `da38e11`.
- Suite: `jaryo/tokens.json` at commit
  `5694d16e8d77e8a0dddd5cf597ac1a91f2db1784`.
- Input SHA-256 values and the complete inventories, unilateral names, shared
  values, and raw structural differences are in
  [`data/suite-token-differential.json`](data/suite-token-differential.json).
  The receipt contains no input filesystem paths or generation timestamp.

The Suite snapshot's `appliedChoiceFile` is **an object**, containing
`jaryo-lab-choices.json` and SHA-256
`6490e5b15b624b82703d2ce897054c2e9a40f6c8dcc5d389de45e86d7004be2d`.
Its `jaryo/contract.mjs` checks this against `jaryo/decision.mjs`; its kit
README describes the selected
choices and Copper override. These sources were read at the same pinned Suite
commit. The Suite contract was not executed, and no Suite source was changed.

## Results

The lab has **69 atomic tokens**: 34 color, 16 dimension, 6 number (the
`letterSpacing` group), 6 fontFamily, 3 fontWeight, and 4 typography.
A typography `$value` is one composite token.
Root `$description` is metadata, excluded from the token inventory.

The Suite has **167 leaves**, including metadata and configuration. Arrays and
empty objects count as one inventory leaf; this count does not label every Suite
field a design token. Its palette contains **36 colors**.

Exact full JSON Pointer names share **0** tokens: all 69 export names and all
167 Suite leaf names are unilateral. Their values are retained in the receipt.
The secondary comparison explicitly pairs `/color/<theme>/<name>` with
`/palette/<theme>/<name>`, preserving the exact theme and local name. This is a
declared namespace mapping, not an inferred semantic correspondence.

| Shared color name | Lab value | Suite value | Exact | Normalized |
| --- | --- | --- | --- | --- |
| `/dark/bg` | `#0c0c0c` | `#0B1012` | different | different |
| `/dark/border` | `#f0f0f0` | `#5A676C` | different | different |
| `/dark/muted` | `#ababab` | `#9AA3A8` | different | different |
| `/dark/surface` | `#121212` | `#141A1C` | different | different |
| `/light/bg` | `#ffffff` | `#FFFFFF` | different | equal |
| `/light/border` | `#000000` | `#000000` | equal | equal |
| `/light/muted` | `#4d4d4d` | `#000000` | different | different |
| `/light/surface` | `#ffffff` | `#FFFFFF` | different | equal |

Of **8** shared color names, **1** matches exactly and **7** differ exactly;
**3** match after normalization and **5** still differ. The normalized count
includes the exact match. There are **26** export-only color names and **28**
Suite-only color names. For both `light` and `dark`, they are:

- Export only: `chip`, `fg`, `fg2`, `focus`, `focus-halo`, `hair`, `hover`,
  `inv-bg`, `inv-fg`, `red`, `red-on`, `rule`, `surface-2`.
- Suite only: `accent_identity`, `accent_ink`, `focus_ring`, `sel_blocked`,
  `sel_run`, `sel_sub`, `selected_bg`, `selected_fg`, `status_blocked`,
  `status_blocked_bg`, `status_ok`, `status_run`, `status_unknown`, `text`.

No aliases such as `fg`/`text`, `focus`/`focus_ring`, `hit`/`controlMin`, or
`s1`/`space.1` are guessed. Shared values under different names do not count as
shared names.

## Structural differences

The raw JSON walk includes **499** lab nodes and **198** Suite nodes, including
containers, metadata, token wrappers, array elements, and value components.
Only the root object shares a raw path. The **695** structural rows consist of
**498** raw paths absent from the Suite and **197** absent from the lab; there
are **0** same-path type changes and **0** same-path array-length changes.
These raw node counts differ from atomic token/leaf inventory counts.

The export uses `color`, `dimension`, `letterSpacing`, `fontFamily`, `fontWeight`,
and `typography` groups with `$type`/`$value` wrappers. The comparison validates
exactly those groups and the DTCG 2025.10 value formats used by the export.
A color `$value` has `colorSpace` set to `srgb`, a `components` array of three
numbers from 0 to 1 inclusive, and a `hex` string that must round-trip with
the components. A dimension `$value` has a numeric `value` and a `unit` of `px`
or `rem`; the comparison rejects `em`. Tokens in the `letterSpacing` group have
`$type` `number`, while `letterSpacing` in a typography token is a `px`
dimension object. The Suite instead declares `agiw.jaryo-tokens.v1`, puts
primitive colors under `palette`, dimensions and other settings under `scale`
and `interaction`, and records choices, variants, patterns, and provenance.
The full raw path/type inventory in the receipt makes every structural
difference inspectable without treating one schema as the other's subset.

## Regenerate offline

From the repository root, with an already obtained Suite snapshot:

```bash
node scripts/suite_token_differential.mjs tokens/jaryo.tokens.json suite.tokens.json > report.json
node scripts/test_suite_token_differential.mjs
node scripts/test_suite_token_differential_mutations.mjs
python3 scripts/check_suite_token_differential.py
python3 scripts/check_suite_token_differential.py --export-file tokens/jaryo.tokens.json --suite-file suite.tokens.json --report-file docs/data/suite-token-differential.json
```

Both input paths are positional arguments. The script never fetches a repository,
starts a server, or writes either input. Exit status `0` means it generated a
valid comparison, including mismatches; `2` means invalid input or usage.
Errors are JSON on stderr and omit input filesystem paths. The CLI requires
regular UTF-8 files, bounds each input at 4 MiB, rejects a BOM, and rejects
duplicate decoded keys, reserved prototype keys, malformed JSON, non-finite
numbers, nesting beyond 64 levels, and more than 100000 JSON value nodes.

Names use escaped JSON Pointers and case-sensitive UTF-16 sorting across
complete pointers, including both inventories. Exact value
comparison retains JSON types and array order and ignores object insertion
order. Hex normalization lowercases digits, expands short forms, and includes
opaque `ff` alpha when absent; it preserves nonopaque alpha. The comparison
uses each export color's 6-digit lowercase `$value.hex`, which must agree with
`components`. Suite palette colors may use 3, 4, 6 or 8 hex digits.
Other CSS syntax, whitespace, units, font aliases, and typography
references are not normalized or resolved. Output is deterministic for the
same input bytes; hashes identify those bytes, not just their parsed values.

## Checks and limits

The focused fixture module passed **153 API cases and 23 CLI cases**. It covers
matching and differing values, missing and extra names, schema validation,
duplicate and hostile keys, exact depth/node/byte boundaries, UTF-8 byte counts,
full-pointer ordering, palette namespace separation, non-ASCII digests, exact
formatted stdout, BOM and malformed UTF-8 rejection, symlink invocation, and
special-file rejection before and after file replacement.

The mutation harness ran the API and CLI checks against a passing baseline and
**68 non-equivalent implementation mutants: 68 killed, 0 survived, 0 broken**.
Only contract assertion failures count as kills; syntax, import and execution
errors outside those assertions fail the harness. The bounded FIFO replacement
assertion detects a child process that blocks. It also executes **2 named equivalent mutations**:
removing the object-key quote guard still rejects unquoted keys through
`string()` and `JSON.parse`; removing the CLI byte guard leaves the parser's
UTF-8 byte limit intact. Temporary candidate directories are removed in `finally`.

The checked-in standard-library oracle and generated corpus are reproducible
with `scripts/check_suite_token_differential.py` and
`scripts/suite_token_differential_corpus.mjs`. The default seeded corpus passed
**9,000 comparisons: 6,000 structured pairs and 3,000 parser-focused pairs**.
There were **3,464 complete-report matches and 5,536 INVALID_INPUT matches**, with
**0 mismatches and 0 unexpected errors**. Repeated calls were deterministic for
every valid pair. The oracle implements its own parser validation, inventories,
strict equality, hex normalization and raw structural comparison. The optional
snapshot arguments compare the complete report with that oracle, run the CLI
twice, and check the saved receipt byte for byte.

The pinned snapshot passed that oracle comparison and both CLI runs matched the
saved receipt. The export at the documented Jaryo commit has identical bytes to
the input used in the receipt.

Targeted existing checks passed: exporter `--check`, its **5 regression tests**,
and `spec/tests/check-tokens.test.mjs`. Ruff **0.17.4** check and format checks
passed for the exporter, its tests, and the new Python oracle. Syntax checks
passed for all new Node modules and the modified Node runner.

The existing `scripts/test_lab_dom.mjs` runner invokes the focused API and CLI
regressions. The mutation and differential commands remain explicit targeted
checks; [CHECKS.md](CHECKS.md) lists their invocation and scope. No workflow
files change.

**NOT_RUN:** full Lab/spec suites, full-tree Ruff, jsdom DOM tests, browser/server
checks, Node 22, Suite contract execution, and current-head CI. Native rendering,
physical devices, assistive technology, deployed consumption, and OPOS checks
are also NOT_RUN. The comparison establishes only the supplied snapshots and
declared name mapping; it does not establish runtime integration or how broadly
the Suite uses them.
