// Shared credential redactor for the adaptor's view and the sample pipeline runner's record.
// It has no imports, so the runner can use it without loading the adaptor.

// Start only at the beginning of a blank run, so a long run of spaces is scanned once, not from every position.
const KEY_END = /(?<![ \t])[ \t]*-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const KEY_BODY_LINE = /^[ \t]*[A-Za-z0-9+/=]+[ \t]*\r?$/;

// An END marker whose BEGIN line was cut off (for example by an earlier tail window) still follows key material:
// drop the marker and the base64-looking lines directly before it. One pass, so long output stays linear.
function redactOrphanKeyEnds(text) {
  if (!KEY_END.test(text)) return text;
  const out = [];
  for (const line of text.split("\n")) {
    if (!KEY_END.test(line)) { out.push(line); continue; }
    while (out.length && KEY_BODY_LINE.test(out[out.length - 1])) out.pop();
    out.push(line.replace(KEY_END, "[REDACTED PRIVATE KEY]"));
  }
  return out.join("\n");
}

// Remove common credential forms from text. Callers redact whole output before selecting lines or truncating text,
// so a multiline private key cannot escape a tail window. The URL scheme is bounded so a long word is scanned in
// linear time; the runner redacts up to 1 MiB per stream. A credential name is tried only from the first word
// character of its [\w-] run (the leftmost start the old nested-star form could match), so a long near-match run
// is scanned once instead of backtracking from every boundary inside it (LOU-89).
export function redactText(text) {
  const blocks = String(text)
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, "[REDACTED PRIVATE KEY]");
  return redactOrphanKeyEnds(blocks)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 [REDACTED]")
    .replace(/([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\b(?<=(?:^|[^\w-])-*)(?=[\w-]*?(?:token|secret|password|passwd|api[_-]?key|authorization|credential|private[_-]?key|access[_-]?key))([\w-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[REDACTED]");
}

// Redact a list of output lines as one text, then split it again. Empty output stays empty.
export function redactTail(tail) {
  if (!tail.length) return [];
  return redactText(tail.map(String).join("\n")).split("\n");
}
