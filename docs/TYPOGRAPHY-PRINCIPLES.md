# Typography principles — from Louis Calata, Typography 1

Source: https://louiscalata.myportfolio.com/typography-1  
Local: `public portfolio (typography-1)`, `/typographyy.html`, `/typography/`  
Booklet dated on pages: **FALL 2021**. Client: **not stated** (course collection).  
This file records what the pages **show**, then turns that into Jaryo type tokens. Unidentified faces are marked; names are not guessed.

---

## 1. What the pages show

### Type families / classifications (as labeled or named on the art)

| Face / sample | How identified | Classification on page | Role in booklet |
|---|---|---|---|
| **Baskerville** | Spec lines print `8/12 URLO BASKERVILLE / REGULAR` (and tracking) | Transitional serif (classification not printed; name is) | Reading body, citations, some all-caps heads |
| **Antique Olive** | Large name + “Roger Excoffon”; top label **Humanist Sans Serif** | Humanist sans | Specimen / poster study |
| **All Around Gothic** | Large name + “Ryoichi Tsunekawa”; top label **Neoclassical Sans Serif?** (question mark on page) | Uncertain on page (label includes `?`) | Specimen / poster study |
| TOC / project titles (bold italic red sans) | Appears throughout TOC and project footers | **Unidentified** — no foundry name on these pages | Structural titles, project IDs |
| Tiny all-caps spec footers | `8/12 … / REGULAR / ±N TRACKING` | **Unidentified** sans (small caps/uppercase) | Technical meta |
| Large folio numerals | Pages 1, 18–23, 46–47, etc. | **Unidentified** (often matching body serif) | Folios |

Do **not** treat Adobe Portfolio chrome fonts as part of the work.

### Scale and contrast
- Body reading repeatedly specified as **8/12** (8 pt type on 12 pt leading → **line-height 1.5**).
- Display: typeface names set much larger and heavier than body; designer names one step smaller/lighter.
- Folios: large corner numerals vs tiny meta — high size contrast.
- Ink contrast is near-max: black on white paper. Red is accent only (see Color).

### Weight
- Body: Regular.
- Display names: Bold / heavy.
- Designer credit under display: lighter than the name.
- Project titles (red): bold.
- Spec lines: regular/medium small caps feel; not heavy.

### Tracking and leading
- Leading for body: **12 on 8** → 1.5.
- Tracking is an explicit study variable, printed on the page:
  - Left-aligned body: **−15** tracking (tighter).
  - Justified / centered samples: **+15** tracking.
  - Right-aligned sample: **+25** tracking.
- All-caps heads use visibly open letter-spacing (wider than body).
- Kerning is a named project topic in the TOC (`Kerning` entries); individual kern pairs are not labeled on the screenshots reviewed.

### Case
- Section titles often **ALL CAPS** (e.g. `VISIBLE AND INVISIBLE LANGUAGE`).
- Body: sentence case / U&LC Baskerville.
- Spec footers: **ALL CAPS**.
- Project labels: title case with numbers (`Project 5.1 …`).

### Alignment and grid
- Explicit alignment studies: **justified**, **centered**, **left (rag right)**, **right (rag left)**, **shape** (hexagon text block on Project 5.5).
- **Cross-alignment** (Project 5.6): meta labels share baselines/columns with the reading column.
- Generous margins; red **crop / registration marks** and hairline guides show a print grid.
- TOC: strong left column for `Project N.N`, dotted leaders, right-aligned page numbers.

### Hierarchy (how type carries structure)
1. **Red project / identity labels** — find the page in the system.
2. **Display typeface name** — subject of the specimen.
3. **All-caps section title** — names the reading excerpt.
4. **Body column** — the content.
5. **Spec footer** — machine-readable recipe (`size/leading`, face, weight, tracking).
6. **Folio + name/date** — navigation and provenance.

Type alone builds the IA: no pictorial logo. That matches AGIW’s typography-only wordmark practice.

### Color
- Primary: black ink on white.
- Accent: **bright red** for project titles, `FALL 2021`, some anatomical callouts, registration marks.
- Red never carries long reading text; it marks **structure / identity / meta**.
- Gray appears only as guide lines in specimen grids, not as body ink.

---

## 2. Jaryo type tokens and rules (derived)

Jaryo stays **factory mono for machine chrome** (IDs, tables, labels). Typography 1 teaches the **reading + meta** layer and the **spec-sheet discipline**. Screen sizes map print 8/12 up to AA-safe floors (body ≥ 12px).

### Families (roles, not marketing names)
| Token | Stack | Use |
|---|---|---|
| `--font-machine` | IBM Plex Mono, JetBrains Mono, Menlo, ui-monospace, monospace | IDs, labels, tabs, tables, ASCII, chips |
| `--font-reading` | IBM Plex Sans, Inter, system-ui, sans-serif | Body prose, mechanisms, tradeoffs, docs |
| `--font-display` | same as machine (stencil plate) | Section titles, wordmarks in lab chrome |
| `--font-serif-study` | `Baskerville, "Times New Roman", Times, serif` | Optional specimen / reading-study only — **not** default chrome |

Serif is available for study previews; the lab shell stays sans+mono so AGIW/OPOS/Nisi monochrome identity is unchanged.

### Scale steps (screen)
| Token | Size | Maps from | Usage |
|---|---|---|---|
| `--fs-0` | 11px | tiny print specs (↑ from 8pt) | Non-essential chrome only; AA contrast required |
| `--fs-1` | 12px | raised floor for meta | Spec labels, chips, table headers |
| `--fs-2` | 13px | — | Nav, secondary UI |
| `--fs-3` | 14px | body ↑ from 8pt→screen | **Reading body** (mechanisms, tradeoffs) |
| `--fs-4` | 16px | — | Card titles, docs h3 |
| `--fs-5` | 20px | — | Panel titles |
| `--fs-6` | 24px | display | Section / family titles |
| `--fs-7` | 32px | folio / wordmark | Rare display lockups |

**Floor:** body and interactive labels ≥ 12px. Do not ship 10px text.

### Weights
| Token | Value | Usage |
|---|---|---|
| `--fw-regular` | 400 | Reading body, designer-credit pattern |
| `--fw-semibold` | 600 | Spec labels, nav groups |
| `--fw-bold` | 700 | Titles, IDs, chosen markers |

### Line-height
| Token | Value | Usage |
|---|---|---|
| `--lh-tight` | 1.2 | Display / titles (folio energy without collision) |
| `--lh` / `--lh-body` | **1.5** | Reading body — direct from **8/12** |
| `--lh-ui` | 1.35 | Dense mono UI rows, ASCII |

### Letter-spacing
| Token | Value | Usage |
|---|---|---|
| `--track-body` | 0 | Default reading (tracking studies stay optional) |
| `--track-meta` | 0.06em | Uppercase machine labels (TOC/spec energy) |
| `--track-display` | 0.04em | All-caps display titles |
| `--track-display-tight` | −0.01em | Large title optical sizing |
| `--track-open` | 0.12em | Plate badges / wordmark plates |

### Case and alignment rules
1. Machine labels: `uppercase` + `--track-meta` + `--font-machine`.
2. Reading body: sentence case, `--font-reading`, `--lh-body`, measure comfortable (cards already constrain width).
3. Family/section titles: uppercase or title-case mono display; prefer size+weight over color for hierarchy in the default mono set.
4. Default alignment in app chrome: **left / rag right**. Justified and shape text are study options only (not default UI).
5. Meta (provenance, specs) **cross-aligns** under the content it describes — left rule + shared column, as in Project 5.6.

### Color rules (type)
1. Default Jaryo: black/white (or theme tokens) for all reading text.
2. Red (`#9B1B1B` light / `#FF6B6B` dark) is **identity/meta accent only** — F19 Red interactive UI and optional wordmark rules. Never the sole status signal; never long body copy.
3. Status stays glyph + word + border (existing grammar).

### Accessibility floors (must keep)
- Contrast: body/meta AA (≥ 4.5:1); UI chrome same.
- Min sizes: body ≥ 12px; hit targets ≥ 44px (unchanged).
- Reduced motion: no reliance on animated type; tracking/leading are static.
- Forced colors: type roles still resolve to system fonts via stacks above.

### Mapping to AGIW / OPOS / Nisi
- Shell wordmark = typography-only (Typography 1 lesson) → F19.03 Red Wordmark Plate when accent is wanted; mono plate otherwise.
- Spec footers (`size/leading · face · weight · tracking`) → provenance lines and lab meta.
- TOC structure → family nav: ID column + title, not decoration.

---

## 3. Application note (this pass)
Applied in `lab.css` as shared tokens and role classes.  
`data/curated-85.json` remains byte-identical. Additive F18/F19 data unchanged except docs.  
