# Jaryo Adaptive Design Lab — review checklist

Non-browser validator: `python3 scripts/validate_lab.py` (expect PASS, 17×5=85).

## Pending browser checks (not yet executed in agent box)
- [ ] Keyboard: per-family radios — unselected entry, arrow wrap, Space select, Expand separate, focus retained after choose
- [ ] Focus visible at 200% zoom; no focus loss when switching families
- [ ] Narrow 320/375: family selector usable; cards stack; summary table scrolls locally; no page-wide horizontal scroll
- [ ] localStorage: save/reload; malformed JSON; unavailable storage; orphaned IDs preserved separately; reset reports persist vs in-memory
- [ ] Two tabs: conflict notice or documented last-write-wins policy
- [ ] prefers-reduced-motion: F13 demos static/useful
- [ ] DEMO/SAMPLE labels visible; journeys labeled as reference sketches not live composition
- [ ] F17.01 Copper still EXAMPLE only unless Louis selects it

## Rollback
Before applying lab patches: copy files from `astra-1103/scope-b/backups/`. Restore if validate_lab fails.
