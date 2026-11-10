# Jaryo interface spec — composed from the 17 design picks

Version 0.5e, 2026-11-07, drafted by Claude on the Mac. It was revised after 15 Codex review rounds. Rounds 1–4, 6, 7, 10, 11 and 14 returned REVISE and each was fixed; rounds 5, 8, 9, 12, 13 and 15 returned **KEEP** with no findings (rounds 13–15 reviewed only the website fix and the accessibility-structure changes). v0.5 added the five owner decisions (§10), v0.5b the 701–1099px fixes, v0.5c the home-screen safe-area padding, v0.5d the website phone-overflow fix, v0.5e the accessibility-structure fixes.
Status: **DESIGN SPEC**. It is not a production build, and none of it has been user-tested.

## Sources
- **Picks:** the 17 design picks, recorded against the lab-v1 catalog (personal pick export not published).
- **Reference screens:** `index.html`, the app (v0.5e, sha256 `f06b31eb…`), and `hero.html`, the website (v0.5e, sha256 `0420bde0…`), in `reference/`. Both use a fictional sample pipeline.

## 1. What Jaryo looks like
A pipeline reads top to bottom as **one vertical bus**. Each step is a hard-edged **box with its frame broken at the IN and OUT ports**. It is named in plain language, with the exact step id beneath in mono.

Selecting a step inverts it and lights up only its declared neighbours. Detail opens in a **side inspector** while the bus stays put, and you can walk the flow with a **prev/next pager**. A few rules hold everywhere:
- **State:** always a word plus a glyph.
- **Unknown:** what Jaryo has not discovered is drawn as unknown.
- **Optional:** optional steps sit hidden behind an honest dashed gap.
- **Motion:** it happens only when a real event arrives.

**Color.** The skin is **Copper Workshop**:
- a dark warm-graphite ground;
- copper on the brand mark and **the one primary action per view**;
- cool, desaturated status tints, so copper never reads as a status.

**Phone.** One-handed, with a 56px thumb bar.

**Website.** It leads with one install command next to a GUI connect path.

## 2. The 17 picks and their jobs
| Layer | Pick | Job in the composition |
|---|---|---|
| Skeleton | **F01.01 Main Bus Spine** | Canvas default: a vertical spine; branches tap off at right angles |
| Step container | **F06.02 Ported Box** | Each step is a box broken at IN/OUT ports. On ≤700px the ports become text labels (`IN ← …` / `OUT → …`) |
| Wiring | **F05.02 Port Socket** | Sockets sit in the box's ports. The **binding list** in the inspector is a first-class editing mode (keyboard and narrow screens use the same thing) |
| Naming | **F02.04 Human Label + Technical Subline** | Plain name first, `step_id:` in mono beneath. Applies to steps, pager, neighbour list and inspector title. The subline may truncate, but shows in full on focus and selection, and is part of the step's accessible name |
| Selection | **F04.01 Step Focus + Neighbours** | Selected = inverted + ▶. Declared inputs/outputs get a full-strength outline plus a "← input" / "output →" word. Others recede to a **hairline frame and a muted title, never opacity**, so every token keeps its measured contrast. The inspector also lists the neighbours, which is how phones see them (catalog: "Neighbours listed under selection") |
| Detail | **F11.01 Side Inspector** | A right column that is **always reserved** (empty state when nothing is selected), so opening detail never reflows the spine |
| Walking | **F03.03 Step Pager** | Prev/next in dependency order, by name. At a fork it shows every branch and says "fork: n next steps — choose one" |
| Data | **F07.01 Mono Ledger Table** | Runs and metrics: right-aligned mono numbers, a rule every row, sticky first column, horizontal scroll inside its own region. A **RUNNING row is inverted** (F17.01) |
| State | **F09.01 Word+Glyph State** | `● [OK]` `▶ [RUNNING]` `✕ [BLOCKED]` `? [UNKNOWN]` `◆ [REVIEW]` |
| Unknowns | **F08.10 Unknown-aware Graph** | Undeclared nodes that a run log implies: 1px dashed frame + hatch strip + `? [UNKNOWN]` + "not declared by adaptor" |
| Hidden steps | **F12.10 Underground Dash** | Hidden steps become a dashed gap on the spine. The wording states what they do: `[+n optional] steps — off by default` for steps that will not run, and `[+n collapsed] steps — will run` for a folded-up required subflow. Never hides errors or consent: a group holding a blocked, unknown or review step **opens itself and cannot be hidden** (`opened: n inside need attention — cannot hide`) |
| Activity | **F13.02 Event Tick** | One glyph advances per **real** event. The bar **resets at each run**, fills to 8 glyphs, and prints the exact count for this run (`n this run`), which is also announced. No decorative or looping motion |
| Empty | **F10.01 Honest Empty** | Says why it is empty, then gives one next step |
| Commands | **F16.01 Command Palette** | ⌘K/Ctrl-K **and** a visible button (⌘ More on phones). Combobox semantics; the result count is announced. Undeclared actions are listed as `(n/a)` with the adaptor's reason. **Full sheet on ≤700px** |
| Phone | **F14.02 Thumb Bar** | A 56px bottom bar: `◀ Prev` · **primary** · `Next ▶` · `⌘ More` |
| Website | **F15.01 Install Line Hero** | One install command with copy (aria-live confirmation) **plus** a primary GUI connect path |
| Color | **F17.01 Copper Workshop** | **Explicitly selected by the owner**, no longer EXAMPLE-only. Tokens are in §4 |

## 3. Layout skeleton
| Width | Layout |
|---|---|
| ≥ 1100px | Header (mark · pipeline name + id · declared capabilities · ⌘K button · primary) → spine column (flexible, min 300px) + inspector column (340–420px, always present) |
| 701–1099px | Same two columns. The inspector keeps its width and the spine scrolls; ledgers scroll inside their region. The header wraps rather than truncating |
| ≤ 700px | Spine only. The inspector becomes a **full sheet**: focus moves to its heading, **everything it covers is `inert`**, and Close or Esc returns focus to the step. The **thumb bar** replaces the header actions, and the **pager merges into it**. The bar's Prev/Next show the destination's plain name (truncated). **At a fork, Next reads `choose (n)` and opens a branch chooser** (a modal listing each branch with its `step_id:`; Esc returns focus to Next). The full name and `step_id:` are in the accessible name and the tooltip, and visible in the sheet's neighbour list, since a 56px bar cannot hold the subline. At a fork, the sheet keeps the branch buttons. The neighbour list and port labels replace the drawn graph |

## 4. Tokens: Copper Workshop (F17.01) with measured WCAG contrast
| Token | Hex | Measured |
|---|---|---|
| bg | `#0B1012` | — |
| surface | `#141A1C` | — |
| text | `#F4F1EA` | 16.97:1 on bg · 15.59:1 on surface |
| muted | `#9AA3A8` | 7.45 · 6.85 |
| border | `#5A676C` | 3.27 · **3.01** (UI minimum; do not lighten surface) |
| focus_ring | `#E8D7A8` | 13.41 on bg · 12.32 on surface · **1.27 on selected fill → must be offset outside** |
| selected_bg / selected_fg | `#F4F1EA` / `#0B1012` | 16.97 |
| accent_identity (copper) / accent_ink | `#C47A3A` / `#0B1012` | 5.64 · copper on bg 5.64 · on surface 5.18 |
| status_ok | `#8FC4A0` | 9.64 · 8.85 |
| status_run | `#8FB4D6` | 8.81 · 8.09 |
| status_blocked on blocked_bg | `#FFD2C8` / `#3A2020` | 10.87 |
| status_unknown | `#9AA3A8` | 7.45 · 6.85 |
| *derived:* sel-sub / sel-blocked / sel-run (ink on the selected fill) | `#3B4448` / `#6B2A1E` / `#1F4A72` | 8.84 · 9.43 · 8.16 on `#F4F1EA` |

**Rules**
- Copper fills only the brand mark and one primary action per view. It is never used for OK, RUNNING, BLOCKED or a warning.
- Every color comes from a token. The reference screen's mono skin measured pure `#000/#fff`, plus the modal scrim.
- **Mono fallback:** pure `#000/#fff`. Copper becomes a white fill, tints become white text, the hatch is kept, selection is an invert and focus is a dashed ring. It is the high-contrast mode and the brand's B/W heritage.

## 5. Line and pattern vocabulary
Four picks plus the focus ring all use dashes. Each meaning gets its own stroke **and** a word, so no dash is ever the only signal.

| Meaning | Stroke | Word |
|---|---|---|
| **Focus** | 3px dashed, `focus_ring` color, **offset 3px outside** | — (keyboard position) |
| **Unknown** (F08.10) | 1px dashed box + 12px hatch strip on the left edge (never behind text) | `? [UNKNOWN]` + "not declared by adaptor" |
| **Unavailable action** | 2px dashed button border, muted text | reason, e.g. `n/a: adaptor does not declare pause` |
| **Optional / collapsed** (F12.10) | a dashed **gap on the spine line** (a line, never a box) + dashed-top button | `[+n optional] steps — off by default` |
| **Blocked** | **filled panel** (`status_blocked_bg`) + **left hatch strip** + 6px double left rule + chip; the strip and rule survive selection (drawn in `sel-blocked`) | `✕ [BLOCKED]` + reason line |
| **Review gate** | 2px solid hard border | `◆ [REVIEW]` |

## 6. Interaction rules
1. **Capabilities are declared, never assumed.**
   - The header lists what the adaptor declares, e.g. "declares: run · logs · retry — no pause".
   - The palette, buttons and empty states only offer declared actions. Others appear as `(n/a)` with the reason.
2. **Consequential actions pass a review gate.** Run, deploy, delete and overwrite each open a `◆ [REVIEW]` dialog:
   - It gives an honest summary, e.g. "6 steps will run. 1 blocked (Load to warehouse); 1 undiscovered step."
   - **Cancel is focused by default.**
   - Closing returns focus to the opener.
3. **Selection** never moves focus on desktop. On phones it opens the sheet and moves focus to the sheet heading. Selection never erases a state's own marks: BLOCKED keeps its strip and rule, and UNKNOWN stays dashed.
   - **RUNNING vs selection.** F17.01 asks for an "inverted row" for RUNNING, but on the spine an invert means selection. So RUNNING is an inverted *row* in ledgers, where rows are not selectable. On the spine it is `▶ [RUNNING]` plus the Event Tick.
   - **Focus after actions.** Every action that closes a layer returns focus to a visible control: the opener if it is still visible, otherwise the thumb bar's ⌘ More. Commands that move you somewhere focus the destination. Pager navigation keeps focus on the same-direction button, so pressing Enter on Next repeatedly walks forward.
   - **Escape** closes one layer at a time: palette or review first, then the phone sheet.
4. **Pager at a fork.** It lists every branch by name. On phones, the thumb bar's Next never guesses: it opens a branch chooser, and picking a branch selects it.
5. **Bindings.** Each binding is an editable list item (`rows ← dedupe_v2.out [Change]`). Drawn sockets are a shortcut to the same list, not the only way in.
6. **Event tick.**
   - It advances only on a received event and announces "Event received: n this run". A new run starts it empty again.
   - Under reduced motion it still updates, because that is a state change, not an animation.
   - If no event stream is declared, there is no tick.
7. **Empty, unknown and never-ran states** are worded differently:
   - Empty: "No step selected…"
   - Unknown: "Unknown: the adaptor has not declared this step…"
   - Never ran: "This step has never run: it is blocked (warehouse credential not set)."
   - Each gives one next step.
8. **Optional steps.** Revealing them is a toggle (`aria-expanded`). Selecting an optional step from the palette or the pager reveals the group first.

## 7. Accessibility baseline
These are required, not optional:
- **Targets:** 44px minimum; the thumb bar is 56px.
- **Focus:** always visible and offset outside the element.
- **Screen readers:** each step's name includes its state and its relation to the selection (e.g. "Clean customer rows, ● [OK], input of selected step").
- **Live region:** announces selection, palette result counts, events and gated refusals.
- **Palette:** a single focus stop (combobox); arrows move through options; Enter runs; Esc closes and returns focus.
- **Color:** no meaning by color alone, and no motion except real events.
- **Contrast:** every text pair ≥ 4.5:1 and every UI stroke ≥ 3:1 (measured in §4).

## 8. Tensions between picks, and how they are resolved
| Tension | Resolution |
|---|---|
| Five dashed meanings (F08 / F12 / unavailable / unknown / focus) | §5: separate stroke + word for each |
| Receding with opacity breaks the token contrast (muted drops to ~3.4:1) and turns mono grey | Recede with a hairline frame + muted title only; state chips keep full color |
| F17 "RUNNING = inverted row" vs "selection = invert" | Invert = RUNNING in ledgers; invert = selection on the spine (§6.3) |
| F03 pager wants a bottom bar on narrow, and so does F14 | The pager merges into the thumb bar. Forks keep their branch buttons in the sheet |
| F11 inspector steals width, and the canvas reflows mid-inspection | The inspector column is always reserved, so nothing reflows |
| F07 wide ledger inside the inspector | The ledger scrolls inside its own focusable region with a sticky first column |
| F09 state words widen dense tables | State words **never truncate**; names truncate instead (full value on focus) |
| F17 focus ring on the light selected fill = 1.27:1 | The focus ring is always offset outside the element, over bg (13.4:1) |
| F17 copper next to the salmon blocked tint can read as "warning" | Copper only on the mark and the one primary action; blocked is always chip + ✕ + word + reason |
| F12 optional gap could hide a problem | **Decided:** the group auto-expands and says why, and cannot be hidden while the problem is inside |
| F02 two strings per item | Unknown nodes say what they are ("not declared by adaptor") instead of inventing an id |
| Copper (dark) vs the original pure #000/#fff identity | Copper is the default skin; mono is the high-contrast fallback, using the same structure and tokens |

## 9. Reference screens, as checked on the Mac
These checks ran in the Chromium pane on 2026-11-07, each against the build named in its block. After v0.5c, the behaviour paths below were re-run once more on 2026-11-07 (desktop 1280 and phone 375, no failures; the page was rendered as a data: snapshot, not a file origin), and the thumb-bar buttons now measure 87–113 × 54 px inside the 56px bar.

**`index.html`, the app (re-checked after review round 1):**
- **Desktop:**
  - The selected step is inverted. Its neighbours are outlined and labeled; the others recede with no opacity.
  - Selected BLOCKED keeps its 6px double rule and hatch strip. Neighbour UNKNOWN stays dashed.
  - The ledger's RUNNING row is inverted.
  - The pager and neighbour buttons show `step_id:`.
  - Enter on Next walks forward (fetch → clean → score).
  - The Event Tick count goes past 8 (13 after 10 demo events).
  - No console errors.
- **Keyboard:**
  - Enter selects and keeps focus, with the ring outside the element.
  - ⌘K → "pause" → Enter announces why it is unavailable.
  - The review opens with Cancel focused.
  - Esc closes one layer at a time.
- **Phone (375px emulated):**
  - The sheet opens with focus on its heading. Shift+Tab ×3 stays inside the sheet and thumb bar, with the spine `inert`.
  - Port labels replace the sockets, and the neighbour list is visible.
  - The palette is a full sheet (375×812).
  - Palette → Run → review → Esc returns focus to ⌘ More, and the sheet stays open. A second Esc closes the sheet, returns focus to the step and removes `inert`.
  - No horizontal overflow, and no button under 44px.
- **Colors:**
  - Mono skin: only `#000` and `#fff` (plus the scrim).
  - Copper skin: only token colors.

**Round-2 fixes (re-checked):**
- **Selected-state contrast:**
  - Selected BLOCKED rule: 9.43:1 (was 1.22).
  - Selected UNKNOWN dashes: 16.97:1, now visible.
  - Selected optional tag: 8.84:1.
- **Phone paths:**
  - On phones, "Show optional steps" closes the sheet first and focuses the revealed step.
  - Choosing a non-fork branch hands focus to the thumb bar's Next, whose label carries the step id. Enter again keeps walking forward.
- **Leaving phone width while the palette is open:**
  - The sheet closes and `inert` is cleared without stealing focus from the palette, and Esc then closes the palette.
  - Caveat: the pane's viewport emulation fires no `resize` event, so this was triggered by hand. A media-query listener and a resize listener both cover a real window resize.
- **⌘K during the review:** ignored.
- **Hero:** all links and buttons are at least 44×44.
- **Accessibility structure (v0.5e):** the app has one `main` and one h1 and its step names use the state word, not the glyph; the website's in-page links all have targets, "Open connect UI" is a button, and Before/After are visible labels. Checked by `tests/reference-a11y.test.mjs` (markup only) and Codex rounds 14–15. Not a screen-reader test.

**Round-3/4 fixes (re-checked):**
- The thumb bar's Prev/Next show the destination name, e.g. "Clean customer rows" / "Write audit log" `+1`.
- The `+n` fork count sits in its own non-shrinking span, so at 375px it stays fully visible (13px) while the name ellipsizes.
- Buttons stay 87×56 with no overflow (v0.5b). In v0.5c they are 54px high inside the 56px bar, because the bar's 2px top border is inside its box.

**`hero.html`, the website (F15.01):**
- One install line with Copy, plus the GUI connect path, with one copper primary.
- No control under 44px, and no console errors.
- When the clipboard is blocked, it shows a fallback instead of claiming the copy worked.

**Not covered:**
- a screen reader listened to end to end;
- *a real phone: partly closed 2026-11-07. The iPhone 17 Pro **iOS Simulator** in real mobile Safari, with real taps, was checked:*
  - *the thumb bar sits above Safari's floating toolbar, uncovered;*
  - *tapping a step opens the full sheet, with fork branches and the neighbour list;*
  - *`choose (2)` opens the branch chooser, with the offset dashed focus ring on the first branch;*
  - *picking a branch selects it, and Close returns to the spine with context kept.*
  - *Home-screen (standalone) safe-area added in v0.5c: `viewport-fit=cover` plus `env(safe-area-inset-*)` on the thumb bar, sheet, palette, dialogs, skip link and body. Checked in iOS Safari (browser mode, zero bottom inset) and by Codex source review only; the standalone launch itself was not run. Not covered: physical hardware.*
- real adaptor data;
- *(closed 2026-11-07: the 701–1099px band was checked at 768px and 900px. The two columns hold (spine 348/480px + inspector 420px), with no overflow and no target under 44px. Two fixes: the neighbour label now sits on its own line instead of over the subline, and the skip link is 44px tall when focused.)*

## 10. Decisions (owner, 2026-11-07)
1. **F12 safety:** a hidden group that contains a blocked, unknown or review step **auto-expands**. It says why and cannot be hidden until the problem is gone.
2. **Fork default on phones:** **Next opens a branch chooser**. It never silently takes the first branch.
3. **Copper on the website:** **the same as the app**. The dark Copper skin is used across marketing pages, with copper only on the mark and one primary action per page.
4. **Event tick:** **resets per run**. The count shown is for the current run.
5. **Repo home:** the spec and both reference screens move **into the lab's repo** (e.g. `docs/spec/` and `reference/`) once it exists. Notion stays the readable home, and both stay separate from AGIW Suite.
