import type { InvestigationRecord, InvestigationResultItem } from "@/src/types/investigation";

const LABELS: Record<string, string> = {
  mailaccess: "MailAccess", holehe: "Holehe", maigret: "Maigret", ghunt: "GHunt",
  blackbird: "Blackbird", sherlock: "Sherlock",
  hibp: "Have I Been Pwned",
  phoneinfoga: "PhoneInfoga", ignorant: "Ignorant", detectdee: "DetectDee",
};

function flatten(value: unknown, indent: string, lines: string[], depth = 0): void {
  if (value === null || value === undefined || value === "") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 200)) {
      if (item && typeof item === "object") { lines.push(`${indent}-`); flatten(item, indent + "  ", lines, depth + 1); }
      else lines.push(`${indent}- ${String(item)}`);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      if (typeof v === "object" && depth < 6) { lines.push(`${indent}${key}:`); flatten(v, indent + "  ", lines, depth + 1); }
      else lines.push(`${indent}${key}: ${String(v)}`);
    }
  }
}

function section(title: string): string[] {
  return ["", "=".repeat(72), title, "=".repeat(72)];
}

function renderItem(item: InvestigationResultItem): string[] {
  const lines = [`- ${item.platform}${item.confidence ? `  [confidence: ${item.confidence}]` : ""}`];
  if (item.url) lines.push(`    URL: ${item.url}`);
  if (item.errorMessage) lines.push(`    Note: ${item.errorMessage}`);
  const detail: string[] = [];
  flatten(item.details, "    ", detail);
  return [...lines, ...detail];
}

/** Plain-text report for ONE investigation. */
export function buildTextReport(record: InvestigationRecord): string {
  const out: string[] = [
    "CLEARTRACE — AUTHORIZED INVESTIGATION REPORT",
    `Target ${record.targetType === "phone" ? "phone" : "email"} : ${record.target ?? record.email}`,
    `Scan ID      : ${record.scanId}`,
    `Status       : ${record.status}`,
    `Started      : ${record.createdAt}`,
    `Completed    : ${record.completedAt ?? "in progress"}`,
    `Duration     : ${(record.durationMs / 1000).toFixed(1)} s`,
    `Tools        : ${record.selectedTools.map((t) => LABELS[t] ?? t).join(", ")}`,
    `Authorization confirmed at: ${record.authorizationConfirmedAt ?? "n/a"}`,
    "",
    "NOTE: Results are unverified signals, not proof of identity or account ownership.",
  ];
  if (record.selectedTools.includes("maigret") || record.selectedTools.includes("sherlock")) {
    out.push("Username-based hits are guesses derived from the email's local part and may belong to a different person.");
  }
  if (record.selectedTools.includes("hibp")) {
    out.push(
      "HIBP source: https://haveibeenpwned.com/",
      "HIBP data types and affected-account totals describe each breach overall, not confirmed fields for the target email.",
    );
  }

  out.push(...section("SUMMARY"));
  out.push(`Found: ${record.summary.found}   Not found: ${record.summary.notFound}   Not checked: ${record.summary.notChecked}   Errors: ${record.summary.errors}   Total: ${record.summary.total}`);
  for (const run of record.toolExecutions) {
    out.push(`  ${LABELS[run.tool] ?? run.tool}: ${run.status} — ${run.message ?? ""} (${(run.durationMs / 1000).toFixed(1)} s)`);
  }

  const byTool = new Map<string, InvestigationResultItem[]>();
  for (const item of record.results) byTool.set(item.tool, [...(byTool.get(item.tool) ?? []), item]);

  for (const [tool, items] of byTool) {
    const found = items.filter((i) => i.status === "found");
    out.push(...section(`${(LABELS[tool] ?? tool).toUpperCase()} — ${found.length} found`));
    const order = { high: 0, medium: 1, low: 2 } as const;
    found.sort((a, b) => (order[a.confidence ?? "medium"] - order[b.confidence ?? "medium"]) || a.platform.localeCompare(b.platform));
    if (!found.length) out.push("(no positive results)");
    for (const item of found) out.push(...renderItem(item), "");
    const errors = items.filter((i) => i.status === "error");
    if (errors.length) { out.push("Errors:"); for (const e of errors) out.push(`  - ${e.platform}: ${e.errorMessage ?? "error"}`); }
    const notChecked = items.filter((i) => i.status === "not_checked");
    if (notChecked.length) out.push(`Not checked (blocked/rate-limited): ${notChecked.map((i) => i.platform).join(", ")}`);
    const absent = items.filter((i) => i.status === "not_found");
    if (absent.length > 1 || (absent.length === 1 && absent[0].platform !== (LABELS[tool] ?? tool))) {
      out.push(`Checked, not found: ${absent.map((i) => i.platform).join(", ")}`);
    }
  }
  out.push("", `Generated ${new Date().toISOString()}`);
  return out.join("\n") + "\n";
}
