#!/usr/bin/env node
/**
 * repo-guards.mjs -- deterministic repo-hygiene gates (2026-07-27).
 *
 * Pattern adapted from block/buzz `desktop/scripts/check-file-sizes.mjs` +
 * `check-px-text.mjs` (Apache 2.0) -- the "fixture gate" school: conventions
 * that used to live in prose (CLAUDE.md's 500-line rule, the type-ramp rule,
 * money-through-a-shared-formatter) become CI checks with a RATCHET: existing
 * violations are frozen in scripts/repo-guards-ratchet.json and may only go
 * DOWN. New files start clean. Do not raise a ratchet number; fix the file.
 *
 * Checks:
 *   sizes       -- no src file over 500 lines (CLAUDE.md file discipline);
 *                  warn at 400. Exempt classes (not overrides): generated
 *                  code (src/integrations/supabase/) and vendored shadcn
 *                  (src/components/ui/).
 *   px-text     -- no `text-[Npx]` / `text-[Nrem]` Tailwind literals; use the
 *                  type-ramp classes so zoom/rem scaling stays coherent.
 *   formatters  -- money/number rendering goes through src/lib/formatters.ts;
 *                  raw .toFixed( / toLocaleString( in components is ratcheted.
 *
 * Usage:
 *   node scripts/repo-guards.mjs                  # run all gates (exit 1 on violation)
 *   node scripts/repo-guards.mjs --update-ratchet # tighten ratchet to current counts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const RATCHET_FILE = path.join(ROOT, "scripts", "repo-guards-ratchet.json");

const MAX_LINES = 500;
const WARN_LINES = 400;
const EXEMPT_DIRS = ["src/integrations/supabase", "src/components/ui"]; // generated / vendored
const PX_TEXT_RE = /text-\[[0-9.]+(?:px|rem)\]/g;
const RAW_FORMAT_RE = /\.toFixed\(|toLocaleString\(/g;

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p, exts, out);
    } else if (exts.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const isExempt = (r) => EXEMPT_DIRS.some((d) => r.startsWith(d + "/"));
const countMatches = (p, re) => (fs.readFileSync(p, "utf8").match(re) || []).length;

function loadRatchet() {
  try { return JSON.parse(fs.readFileSync(RATCHET_FILE, "utf8")); }
  catch { return { "px-text": {}, formatters: {}, sizes: {} }; }
}

function run() {
  const update = process.argv.includes("--update-ratchet");
  const ratchet = loadRatchet();
  const next = { sizes: {}, "px-text": {}, formatters: {} };
  const failures = [];
  const warnings = [];
  const files = walk(SRC, new Set([".ts", ".tsx"]));

  // -- sizes --
  for (const p of files) {
    const r = rel(p);
    if (isExempt(r)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n").length;
    const cap = ratchet.sizes?.[r] ?? MAX_LINES;
    if (lines > cap) {
      failures.push(`sizes: ${r} is ${lines} lines (cap ${cap}) -- split it (CLAUDE.md: break up at 400)`);
    } else if (lines > WARN_LINES && lines <= MAX_LINES) {
      warnings.push(`sizes: ${r} is ${lines} lines -- approaching the 500 cap, split soon`);
    }
    if (lines > MAX_LINES) next.sizes[r] = lines; // only legacy overages carry a ratchet entry
  }

  // -- px-text + formatters (both ratcheted per file) --
  for (const p of files) {
    const r = rel(p);
    if (isExempt(r)) continue;
    const px = countMatches(p, PX_TEXT_RE);
    if (px > 0) next["px-text"][r] = px;
    const cap = ratchet["px-text"]?.[r] ?? 0;
    if (px > cap) failures.push(`px-text: ${r} has ${px} text-[Npx/rem] literals (ratchet ${cap}) -- use the type-ramp classes`);

    if (!r.startsWith("src/lib/")) {
      const raw = countMatches(p, RAW_FORMAT_RE);
      if (raw > 0) next.formatters[r] = raw;
      const fcap = ratchet.formatters?.[r] ?? 0;
      if (raw > fcap) failures.push(`formatters: ${r} has ${raw} raw .toFixed/toLocaleString (ratchet ${fcap}) -- add/use a shared formatter in src/lib/`);
    }
  }

  if (update) {
    fs.writeFileSync(RATCHET_FILE, JSON.stringify(next, null, 2) + "\n");
    console.log(`repo-guards: ratchet updated -> ${rel(RATCHET_FILE)} (sizes ${Object.keys(next.sizes).length}, px-text ${Object.keys(next["px-text"]).length}, formatters ${Object.keys(next.formatters).length} files)`);
    return 0;
  }

  for (const w of warnings) console.log(`WARN  ${w}`);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL  ${f}`);
    console.error(`\nrepo-guards: ${failures.length} violation(s). Fix the file -- do not raise the ratchet.`);
    return 1;
  }
  // loosen detection: praise shrinkage so ratchets get tightened
  const shrunk = [];
  for (const [check, entries] of Object.entries(ratchet)) {
    for (const [f, cap] of Object.entries(entries || {})) {
      const now = next[check]?.[f] ?? 0;
      if (now < cap) shrunk.push(`${check}:${f} ${cap} -> ${now}`);
    }
  }
  if (shrunk.length) console.log(`repo-guards: ${shrunk.length} ratchet(s) can tighten (run --update-ratchet):\n  ` + shrunk.join("\n  "));
  console.log(`repo-guards: checked ${files.length} files -> all gates pass`);
  return 0;
}

process.exit(run());
