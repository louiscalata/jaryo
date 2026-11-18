# Contributing

Jaryo is a work-in-progress interface design lab for comparing layouts, typography and controls. It is a documentation and design tool, not a production product.

## Open the lab

```bash
git clone https://github.com/louiscalata/jaryo.git
cd jaryo
```

Open `index.html` in your browser. Embedded data loads if fetch is blocked.

To inspect the static lab from a local server, from the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Live lab: [louiscalata.github.io/jaryo](https://louiscalata.github.io/jaryo/).

## Checks

Run from the repository root. These are the same commands listed in [README.md](README.md#checks):

```bash
python3 scripts/validate_lab.py
python3 scripts/export_tokens.py --check
python3 scripts/test_export_tokens.py
python3 scripts/check_assets.py
node --check lab.js
node --check lab-stages.js
node scripts/test_persistence_rules.mjs
node scripts/test_smoke_cli.mjs
node scripts/test_focus_coverage.mjs
node scripts/test_lab_dom.mjs
```

The DOM check requires jsdom 26.1.0. Point `JARYO_JSDOM_PATH` at an existing package, or create an isolated temporary dependency directory:

```bash
task_deps="$(mktemp -d)"
npm install --prefix "$task_deps" --ignore-scripts --no-audit --no-fund jsdom@26.1.0
export JARYO_JSDOM_PATH="$task_deps/node_modules/jsdom"
```

Missing jsdom is a failure. Do not report a static-only result as a DOM pass. Do not use a global jsdom install or a shared fixed temporary directory. Further setup and spec checks are in [AGENTS.md](AGENTS.md#static-and-dom-checks).

Browser smoke and axe scripts live under `scripts/browser/` and need Playwright. Run browser checks on the hosted Linux runners; Mac checks stay browser-free (see [AGENTS.md](AGENTS.md#ci-and-browser-boundary)).

## Issues

Issues are an appropriate way to report problems.

## License

[Apache License 2.0](LICENSE). Copyright 2026 Louis Calata. See [NOTICE](NOTICE).
