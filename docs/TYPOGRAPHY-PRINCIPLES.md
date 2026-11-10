# Typography principles — Typography 1, applied to Jaryo

Source: [louiscalata.myportfolio.com/typography-1](https://louiscalata.myportfolio.com/typography-1)

The page is a FALL 2021 project collection. The text is in the images, not in the HTML. This note is from those spreads: cover, table of contents, Face-Off, Asymmetry, Unique Characters, Type Anatomy, Grids, Type History, Proportion, Typesetting Paragraphs (justified, centered, left, right, shape), Cross Alignment, Type Families, Kerning Serif, Hidden Characters, Type as Image, Complex Content, and Posters. Adobe Portfolio’s own interface type is not part of the work.

Licenses for the faces Jaryo actually loads: [FONTS.md](FONTS.md).

## What the spreads show

### Page furniture
- White paper, black ink, one red.
- A large folio numeral, a red italic project label (`Project 5.3 Typesetting Paragraphs Left Aligned`), a registration mark, and a small `LOUIS CALATA / FALL 2021` with the date in red.
- Red is the identity and the wayfinding color. It is not used for the reading paragraph.

### Table of contents
- Project numbers are black bold italic. Titles are red bold italic. Leaders are red dots. Page numbers are black.
- The footer title “Table of Contents” is large, black, and heavier than the entries.
- Hierarchy is type only. There is no pictorial logo.

### Specimens
- A face is shown much larger than its label. The label is a small stack: name, classification, size, tracking. Examples read on the spreads include `8/12 U&LC BASKERVILLE / REGULAR / +15 TRACKING`, `50 PT U&LC`, and `42 PT LC`.
- Named faces include Didot, Futura, Baskerville, Antique Olive (labeled grotesque), Univers, Helvetica Neue, Centaur, Calvert, Bodoni, Rockwell, Garamond, and Palatino. Classifications are printed next to the names (modern, geometric sans, transitional, slab, and so on).
- Weight contrast is deliberate: regular reading, bold or heavy display, a lighter credit under a poster name (Project 11.1).
- Proportion (Project 4.2) steps sizes through the Fibonacci sequence 5, 8, 13, 21, 34, 55. That sequence is a study, not a UI size chart.
- Kerning is measured on headlines (Project 7.4). All-caps settings are tracked more openly than the reading text.
- Type as image (Project 8.2) and the complex-content recipe (Project 9.1) show that a page can be mostly type and rules: columns, a heavy title, a smaller subtitle, and a grid.

### Reading settings (Projects 5.1–5.6)
- Body is Baskerville regular, marked `8/12 U&LC` (8 on 12, so leading is 1.5).
- The section title is small caps or all caps, separated from the paragraph by space.
- Tracking printed on the spreads reviewed: justified `+15`, centered `+15`, shaped `−5`, left-aligned `−25`, right-aligned `−25`.
- Cross Alignment puts a column of face/size/alignment specs beside the reading column so the notes share the column’s vertical rhythm. The reading text stays black. The red on that spread is the credit line and the project label, not the paragraph.

### Alignment
The booklet treats justified, centered, left (rag right), right (rag left), and a shaped block as separate studies. Left, rag right, is the setting the lab uses for interface text. The others stay in the study, not in the chrome.

## What Jaryo takes from that

The lab is a screen, so 8pt body and a 5pt Fibonacci step are not used. The lessons that carry over are the roles, the 1.5 leading, the size and weight contrast, the spec line, the left alignment, and red as identity rather than as body ink.

| Role | Token | Face | Use |
|---|---|---|---|
| Machine | `--font-machine` | IBM Plex Mono | IDs, nav, tabs, spec lines, section titles |
| Reading | `--font-reading` | IBM Plex Sans | Body, mechanisms, tradeoffs, card titles |
| Display | `--font-display` | IBM Plex Mono | Lab title and section titles. Size and caps, not a second color |
| Study serif | `--font-serif-study` | Libre Baskerville | Docs specimen and the F19 reading column |

Libre Baskerville is an OFL transitional serif used where the booklet used Baskerville. Baskerville is not shipped. Antique Olive, Didot, Futura, Univers, and Helvetica are not shipped.

### Scale
| Token | Size | Use |
|---|---|---|
| `--fs-0` | 11px | Kept in the token file. Not used for visible lab text |
| `--fs-1` | 12px | Spec line on a card |
| `--fs-2` | 13px | Nav, meta, chips |
| `--fs-3` | 14px | Reading body and controls |
| `--fs-4` | 16px | Card titles. The card face is unchanged |
| `--fs-5` | 20px | Panel titles |
| `--fs-6` | 24px | Section titles on a narrow screen |
| `--fs-7` | 32px | Section titles |
| `--fs-display` | 48px | Lab title |

Body and controls stay at 14px. The 11px step is unused on screen. The card title stays IBM Plex Sans at 16px.

### Weight, leading, tracking
| Token | Value | Use |
|---|---|---|
| `--fw-regular` | 400 | Reading |
| `--fw-semibold` | 600 | Spec labels, nav groups |
| `--fw-bold` | 700 | Titles, IDs, chosen markers |
| `--lh-body` | 1.5 | Reading. This is the 8/12 ratio |
| `--lh-tight` | 1.2 | Titles |
| `--lh-ui` | 1.35 | Mono rows |
| `--track-body` | 0 | Reading. The booklet’s tracking studies are not the default |
| `--track-meta` | 0.06em | Uppercase spec and machine labels |
| `--track-display` | 0.04em | All-caps section titles |
| `--track-display-tight` | −0.01em | Large titles |
| `--track-open` | 0.12em | Plate badges |

### How type is used in the lab
These rules apply to the shell, the docs, and every option card. They are not limited to F19.

1. Family IDs and spec lines are mono, uppercase, tracked.
2. Card titles are IBM Plex Sans bold. They are a different face and a larger size than the ID, which is the booklet’s classification contrast.
3. Reading copy is IBM Plex Sans regular, 14/21, left aligned.
4. Each card and each family heading carries a spec line in the booklet’s recipe form (`14/21 · IBM Plex Sans · regular · 0 tracking`).
5. The Docs tab shows the four roles together.
6. Red (`#9B1B1B` on white, `#FF6B6B` on `#0C0C0C`) is reserved for F19, Red interactive UI. It marks identity. It is not body text and it is not the only status signal.
7. Justified, centered, and shaped text are available inside the Red Spec Title study. They are not the default chrome.

### Contrast floors
Body and meta text in the lab tokens are at least 4.5:1. `#4d4d4d` on white is 8.45:1. `#ababab` on `#0c0c0c` is 8.52:1. The F19 pairs used by the interactive option are 8.18:1 (`#9B1B1B` / white) and 7.05:1 (`#FF6B6B` / `#0C0C0C`). Hit targets stay at least 44px. `prefers-reduced-motion` removes transitions. These ratios were calculated from the token hex values; they are not a full-page audit. Measured axe results are in [VERIFICATION.md](../VERIFICATION.md) when that file has been updated for a pass.
