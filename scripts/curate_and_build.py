#!/usr/bin/env python3
"""Curate 5 options × 17 families from the 170 catalog and emit lab data + validation helpers."""
from __future__ import annotations
import json, hashlib
from pathlib import Path

ROOT = Path(".")
LAB = ROOT / "adaptive-design-lab"
DATA = LAB / "data"

# Curated picks: maximize mechanism distinctness; preserve stable IDs.
# Rationale strings are short labels for the card UI.
CURATION = {
  "F01": {
    "slug": "layout",
    "title": "Layout / composition",
    "screen_contexts": ["pipeline canvas", "workbench", "multi-pipeline home", "run report", "product tour"],
    "picks": [
      ("F01.01", "Canonical linear pipeline reading path; adapts to stacked rows on narrow."),
      ("F01.02", "Parallel scan grid; badge discipline carries criticality when bays are equal."),
      ("F01.03", "Configure/run/read rails with persistent status; becomes labeled tabs on narrow."),
      ("F01.04", "Separates concurrent pipelines with islands — multi-workload home."),
      ("F01.08", "Plan vs run comparison layout for review journeys."),
    ],
  },
  "F02": {
    "slug": "type",
    "title": "Typography / hierarchy",
    "screen_contexts": ["ledgers", "step headers", "docs callouts", "stats", "section chrome"],
    "picks": [
      ("F02.01", "Pure mono ledger — baseline for dense ops reading."),
      ("F02.03", "Semantic bracket tags from backend declarations (unknown stays UNKNOWN)."),
      ("F02.04", "Human-first labels with technical sublines — non-terminal users."),
      ("F02.05", "Inverted section headers for fast skimming."),
      ("F02.09", "Glyph+word state prefixes without relying on color."),
    ],
  },
  "F03": {
    "slug": "navigation",
    "title": "Navigation / wayfinding",
    "screen_contexts": ["sidebar", "inspector", "app top nav", "power jump", "home switcher"],
    "picks": [
      ("F03.01", "Stage bus index — default jump list."),
      ("F03.02", "Upstream/downstream orientation for large DAGs."),
      ("F03.03", "Linear prev/next walk for inspector flows."),
      ("F03.07", "Lifecycle district tabs generated from declared districts."),
      ("F03.08", "Type-ahead step palette across pipelines (Cmd-K sibling)."),
    ],
  },
  "F04": {
    "slug": "actions",
    "title": "Actions / selection",
    "screen_contexts": ["graph selection", "run controls", "deploy/delete", "bulk ops", "dry-run"],
    "picks": [
      ("F04.01", "Selection shows declared neighbours — dependency-aware focus."),
      ("F04.02", "Mandatory review gate for consequential actions."),
      ("F04.03", "Unavailable actions stay visible with reason text."),
      ("F04.04", "RUN + DRY-RUN siblings; extras in options menu."),
      ("F04.09", "Preview-first primary action before real run."),
    ],
  },
  "F05": {
    "slug": "inputs",
    "title": "Forms / inputs",
    "screen_contexts": ["step params", "binding", "connect wizard", "advanced JSON", "validation"],
    "picks": [
      ("F05.01", "Schema-driven auto-form from discovered inputs."),
      ("F05.02", "Port socket wiring with first-class binding list mode."),
      ("F05.05", "Synced form/JSON twin for trust."),
      ("F05.08", "Inferred defaults marked INFERRED; consequential confirm."),
      ("F05.09", "Validation ledger with jump links."),
    ],
  },
  "F06": {
    "slug": "containers",
    "title": "Content containers",
    "screen_contexts": ["step panel", "FAQ/detail", "run list", "gated feature", "facet tabs"],
    "picks": [
      ("F06.01", "Hard panel with inverted title — default grouping."),
      ("F06.02", "Ported box that exposes I/O on the frame."),
      ("F06.04", "Accordion decks; review actions never collapsed inside."),
      ("F06.08", "Hatched placeholder for unsupported/reserved regions."),
      ("F06.09", "Tabbed container; stacks on narrow (no off-screen scroll)."),
    ],
  },
  "F07": {
    "slug": "dense-data",
    "title": "Tables / dense data",
    "screen_contexts": ["run tables", "review gate", "cost/duration", "schema mapping", "logs drill"],
    "picks": [
      ("F07.01", "Mono ledger table with sticky first column."),
      ("F07.03", "Status-first column with glyph+word."),
      ("F07.05", "Plan vs actual diff table."),
      ("F07.07", "Expandable row → pinned log panel (Esc to close)."),
      ("F07.09", "Schema→UI mapping table with evidence + confirm."),
    ],
  },
  "F08": {
    "slug": "diagrams",
    "title": "Diagrams / data graphics",
    "screen_contexts": ["graph view", "resource lanes", "lineage", "integrations", "partial discovery"],
    "picks": [
      ("F08.01", "Orthogonal DAG — primary dependency view."),
      ("F08.02", "Swimlane bus for who/what runs where."),
      ("F08.05", "Declared field lineage as ledger (no invented braid)."),
      ("F08.07", "Island topology with CONNECTED/PROPOSED/UNKNOWN text."),
      ("F08.10", "Unknown-aware graph with hatched [? ] nodes."),
    ],
  },
  "F09": {
    "slug": "feedback",
    "title": "Status / feedback",
    "screen_contexts": ["everywhere", "post-connect", "errors", "live views", "run end"],
    "picks": [
      ("F09.01", "Word+glyph state marks including BLOCKED/UNKNOWN."),
      ("F09.02", "Evidence stamp (state + source + time)."),
      ("F09.03", "Capability check grid YES/NO/UNKNOWN + evidence."),
      ("F09.05", "Blocked always carries reason (or honest fallback)."),
      ("F09.08", "Freshness stamp to avoid stale trust."),
    ],
  },
  "F10": {
    "slug": "empty-loading-error",
    "title": "Empty / loading / error",
    "screen_contexts": ["fresh install", "connect", "step error", "offline", "gated feature"],
    "picks": [
      ("F10.01", "Honest empty with one next step."),
      ("F10.02", "Discovery scan listing checked declarations."),
      ("F10.05", "Error card with raw message + retry/edit."),
      ("F10.07", "Offline/disconnected with last-known timestamp."),
      ("F10.08", "Unsupported adaptor capability with why."),
    ],
  },
  "F11": {
    "slug": "overlays",
    "title": "Overlays / progressive disclosure",
    "screen_contexts": ["step detail", "deploy review", "error strip", "capability panel", "layers"],
    "picks": [
      ("F11.01", "Side inspector keeps graph in place."),
      ("F11.02", "Focus-trapped review modal for consequential acts."),
      ("F11.04", "Persistent error trace strip under graph."),
      ("F11.05", "Layer toggles with always-visible failed count."),
      ("F11.08", "Capability ledger immediately after connect."),
    ],
  },
  "F12": {
    "slug": "patterns",
    "title": "Patterns / shapes / textures",
    "screen_contexts": ["disabled/reserved", "group membership", "flow edges", "loops", "optional steps"],
    "picks": [
      ("F12.01", "Slash hatch for reserved/disabled (never alone as meaning)."),
      ("F12.03", "Missing-tooth comb for declared group membership."),
      ("F12.04", "Belt rule for real direction."),
      ("F12.05", "Square loop for declared cycles."),
      ("F12.10", "Underground dash for optional/collapsed steps."),
    ],
  },
  "F13": {
    "slug": "motion",
    "title": "Motion / loops / transitions",
    "screen_contexts": ["live activity", "selection feedback", "lineage", "run replay", "map→step"],
    "picks": [
      ("F13.02", "Event tick advances only on real events."),
      ("F13.03", "Hard cut default transition (clarity over easing)."),
      ("F13.07", "One-shot dependency trace on select."),
      ("F13.08", "Recorded replay scrubber — never simulated."),
      ("F13.10", "Hard-cut drilldown map→step with breadcrumb."),
    ],
  },
  "F14": {
    "slug": "responsive",
    "title": "Responsive / touch",
    "screen_contexts": ["phone graph", "one-handed actions", "phone run", "touch lists", "phone review"],
    "picks": [
      ("F14.01", "Spine collapse to ordered list with branch blocks."),
      ("F14.02", "Thumb bar primary actions (56px)."),
      ("F14.03", "Phone run ledger — no swipe carousel."),
      ("F14.05", "Big hit rows 44–56px."),
      ("F14.08", "Fullscreen review on phone for consequential."),
    ],
  },
  "F15": {
    "slug": "website-editorial",
    "title": "Website / editorial",
    "screen_contexts": ["landing", "value demo", "try without install", "features", "integrations"],
    "picks": [
      ("F15.01", "Install command + GUI connect dual path."),
      ("F15.02", "Before/after CLI vs Jaryo for one real run shape."),
      ("F15.05", "Labeled DEMO connect playground (one adapter scope)."),
      ("F15.06", "Capability honesty table."),
      ("F15.07", "Integration islands CLI/MCP/SDK with PROPOSED/SHIPPED."),
    ],
  },
  "F16": {
    "slug": "search",
    "title": "Search / filter / command",
    "screen_contexts": ["palette", "non-tech find", "help", "chip filters", "CLI bridge"],
    "picks": [
      ("F16.01", "Capability-gated command palette + visible button."),
      ("F16.03", "Plain-language find → confirmable chips."),
      ("F16.05", "Action discovery panel of adaptor support."),
      ("F16.07", "Filter chips with aria-pressed + text ON cue."),
      ("F16.10", "CLI mirror only when adapter declares parity."),
    ],
  },
  "F17": {
    "slug": "color",
    "title": "Color systems",
    "screen_contexts": ["identity + status grammar", "mono fallback", "day/night", "hazard emphasis", "terminal ops"],
    "picks": [
      ("F17.01", "EXAMPLE ONLY — Copper Workshop warm identity; not a chosen default."),
      ("F17.04", "Blueprint Paper cool paper system — distinct from copper."),
      ("F17.06", "Cursor Signal — selection/focus grammar stress test."),
      ("F17.09", "Hazard Stripe — blocked/review emphasis without traffic-light OK."),
      ("F17.10", "Terminal Phosphor — ops console dialect with mono fallback."),
    ],
  },
}

FAM_ORDER = [f"F{i:02d}" for i in range(1, 18)]


def load_catalog():
    opts = {o["id"]: o for o in json.load(open(ROOT / "options.json"))}
    f17 = json.load(open(DATA / "f17-color-systems-v2.json"))
    for o in f17["options"]:
        # Normalize F17 into catalog-like shape for the lab
        opts[o["id"]] = {
            "id": o["id"],
            "family": "Color systems",
            "name": o["name"],
            "mechanism": o.get("architecture", ""),
            "job": o.get("hierarchy", ""),
            "website": "Brand / marketing surfaces + product chrome",
            "app": "Product UI under chosen color system",
            "narrow": "Same tokens; touch targets and mono fallback apply",
            "tradeoff": o.get("tradeoff", ""),
            "preview": [],
            "tokens": o.get("tokens", {}),
            "tokens_night": o.get("tokens_night"),
            "color_independent_signals": o.get("color_independent_signals", {}),
            "mono_fallback": o.get("mono_fallback", ""),
            "extra_tokens": o.get("extra_tokens"),
        }
    return opts


def build_curated(catalog):
    families = []
    all_ids = []
    for fid in FAM_ORDER:
        meta = CURATION[fid]
        options = []
        for oid, rationale in meta["picks"]:
            src = catalog[oid]
            entry = {
                "id": oid,
                "name": src["name"],
                "mechanism": src["mechanism"],
                "job": src["job"],
                "website": src["website"],
                "app": src["app"],
                "narrow": src["narrow"],
                "tradeoff": src["tradeoff"],
                "preview_ascii": src.get("preview") or [],
                "curation_rationale": rationale,
                "status": "proposed-design",  # not production-implemented
            }
            if "tokens" in src:
                entry["tokens"] = src["tokens"]
                entry["mono_fallback"] = src.get("mono_fallback")
                entry["color_independent_signals"] = src.get("color_independent_signals")
                if src.get("tokens_night"):
                    entry["tokens_night"] = src["tokens_night"]
            options.append(entry)
            all_ids.append(oid)
        families.append({
            "id": fid,
            "slug": meta["slug"],
            "title": meta["title"],
            "screen_contexts": meta["screen_contexts"],
            "catalog_size": 10,
            "curated_count": 5,
            "options": options,
        })
    assert len(all_ids) == 85, len(all_ids)
    assert len(set(all_ids)) == 85, "duplicate ids"
    return {
        "product": "Jaryo adaptive UI/UX interface",
        "artifact": "interactive design lab companion",
        "version": "lab-v1",
        "created": "2026-11-06",
        "timezone_note": "America/Los_Angeles",
        "canonical_notion": "https://fortheloveof.studio/code/jaryo/",
        "source_catalog": {
            "options_json": "private source catalog",
            "interface_md": "private source catalog",
            "f17": "private source catalog",
            "state_grammar_v4": "private source catalog",
            "full_catalog_option_count": 170,  # 160 mono + 10 color
            "curated_count": 85,
        },
        "notices": [
            "A saved choice is a preference, not a product change.",
            "Demo pipelines and data are fictional.",
            "Copper is an example palette, not the default.",
            "MCP exposes tools and resources. It does not draw the interface by itself.",
            "This lab is a documentation demo, not an installable product.",
            "Project page: https://fortheloveof.studio/code/jaryo/",
            "Repository: https://github.com/louiscalata/jaryo",
        ],
        "state_grammar_v4": {
            "selected": "invert fill + ▶",
            "focus": "3px dashed focus-ring (≠ selected)",
            "blocked": "left hatch strip + double rule + × word + reason (never sole invert)",
            "unknown": "dashed outline + ?",
            "unavailable": "dashed border + reason (no invert)",
            "identity_accent": "brand + primary CTA only — never OK/BLOCKED",
        },
        "families": families,
        "journeys": [
            {
                "id": "J1",
                "name": "Connect → capabilities → safe run",
                "surfaces": ["browser", "desktop", "mobile"],
                "steps": ["Connect adapter (proposed)", "Capability ledger", "Dry-run / review gate", "Results with freshness"],
                "uses_families": ["F03", "F04", "F09", "F10", "F11", "F14", "F15", "F17"],
                "demo_note": "Fictional SAMPLE adapter; no live telemetry.",
            },
            {
                "id": "J2",
                "name": "Parallel workloads switcher",
                "surfaces": ["desktop", "browser"],
                "steps": ["Island / tab switch", "Per-workload pipeline view", "Independent status stamps"],
                "uses_families": ["F01", "F03", "F08", "F09"],
                "demo_note": "Independent session tabs metaphor; not AGIW-only monitoring.",
            },
            {
                "id": "J3",
                "name": "Phone one-handed run walk",
                "surfaces": ["mobile"],
                "steps": ["Spine collapse", "Thumb bar", "Run ledger", "Fullscreen review"],
                "uses_families": ["F14", "F04", "F10", "F07"],
                "demo_note": "Touch targets ≥44px; reduced-motion static equivalents.",
            },
            {
                "id": "J4",
                "name": "Website → install → try DEMO",
                "surfaces": ["browser", "mobile"],
                "steps": ["Install line hero", "Before/after", "Labeled DEMO playground", "Integration islands"],
                "uses_families": ["F15", "F16", "F05"],
                "demo_note": "CLI/MCP/SDK routes proposed; MCP alone has no renderer.",
            },
        ],
        "implemented_in_lab": [
            "Side-by-side 5-option cards per family (desktop grid; mobile stack/scroll)",
            "Distinct CSS/SVG preview widgets per option ID (not recolors of one widget)",
            "Expand preview / mechanism / tradeoff",
            "LocalStorage selection save with failure notice",
            "Selection summary + JSON export / copy / reset",
            "Demo state switches (selected/focus/blocked/unknown/unavailable) using v4 grammar",
            "Full-screen composed journeys for browser/desktop/mobile metaphors",
            "Reduced-motion CSS respect; visible focus rings; 44px hit targets in UI chrome",
        ],
        "proposed_not_implemented": [
            "Real CLI installer / MCP adaptor / SDK hosts",
            "Live capability discovery against a backend",
            "Production rendering host (desktop app / editor panel)",
            "Secret vault integration",
            "Live telemetry or real pipeline control",
            "Applying choices automatically to AGIW Suite or any product code",
        ],
    }


def main():
    catalog = load_catalog()
    curated = build_curated(catalog)
    out = DATA / "curated-85.json"
    out.write_text(json.dumps(curated, indent=2, ensure_ascii=False) + "\n")
    # compact for embedding
    (DATA / "curated-85.min.json").write_text(json.dumps(curated, separators=(",", ":"), ensure_ascii=False))
    # id index
    ids = [o["id"] for f in curated["families"] for o in f["options"]]
    index = {
        "count": len(ids),
        "ids": ids,
        "by_family": {f["id"]: [o["id"] for o in f["options"]] for f in curated["families"]},
        "sha256_ids": hashlib.sha256("|".join(ids).encode()).hexdigest(),
    }
    (DATA / "id-index.json").write_text(json.dumps(index, indent=2) + "\n")
    print(f"wrote {out} families={len(curated['families'])} options={len(ids)}")
    print("ids hash", index["sha256_ids"][:16])


if __name__ == "__main__":
    main()
