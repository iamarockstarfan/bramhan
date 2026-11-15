import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import {
  hibpBrowserExecutable,
  searchHibp,
  type HibpLookupResult,
} from "@/src/server/hibpBrowser";
import type {
  InvestigationResultItem,
  PlatformResultStatus,
  ResultConfidence,
  MatchScope,
  InvestigationTargetType,
  ToolId,
} from "@/src/types/investigation";


type ToolRunResult = {
  tool: ToolId;
  results: InvestigationResultItem[];
  error?: string;
};

const CORE_TOOLS: ToolId[] = ["mailaccess", "holehe", "maigret", "ghunt"];
const RUNNABLE_TOOLS: ToolId[] = [
  ...CORE_TOOLS,
  "sherlock",
  "blackbird",
  "phoneinfoga",
  "ignorant",
  "detectdee",
];

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAILACCESS_EMAIL_ONLY_MODULES = [
  "account_discovery",
  "browser_account_probe",
  "breach_aggregator",
  "breachdirectory",
  "dns_lookup",
  "domain_intel",
  "email_credibility",
  "emailrep",
  "google_account_intel",
  "google_dork",
  "gravatar",
  "haveibeenpwned",
  "github_code_search",
  "github_commits",
  "hudson_rock",
  "imap_existence",
  "intelx_lookup",
  "keybase",
  "leakcheck",
  "m365_active_intel",
  "m365_passive_intel",
  "outlook_autodiscover",
  "pastebin_search",
  "pgp_keyserver",
  "ransomware_intel",
  "shodan",
  "social",
  "wayback",
  "whois_lookup",
  "xposedornot",
].join(",");

export function mailAccessExecutionConfig(email: string, matchScope: MatchScope): {
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const isEmailOnly = matchScope === "email";
  const args = [
    ...(process.env.MAILACCESS_LOCAL_ONLY?.toLowerCase() === "false" ? [] : ["--local-only"]),
    "investigate",
    ...(isEmailOnly ? ["--modules", MAILACCESS_EMAIL_ONLY_MODULES] : []),
    "--format", "jsonl",
    "--budget", String(envNumber("MAILACCESS_BUDGET_SEC", 120, 5, 1700)),
    email,
  ];
  return {
    args,
    env: {
      ENABLE_ACCOUNT_DISCOVERY:
        process.env.ENABLE_ACCOUNT_DISCOVERY?.toLowerCase() === "false" ? "false" : "true",
      ...(isEmailOnly
        ? {
          ENABLE_USERNAME_PLATFORMS: "false",
          ENABLE_USERNAME_PIVOT: "false",
          ENABLE_PERMUTATION_DISCOVERY: "false",
        }
        : {}),
    },
  };
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.max(value, min), max) : fallback;
}

/** Per-tool wall-clock timeout. MailAccess needs minutes because it checks thousands of platforms. */
export function toolTimeoutMs(tool: ToolId): number {
  const base = envNumber("SCAN_TIMEOUT_MS", 240_000, 1_000, 900_000);
  if (tool === "hibp") return 240_000;
  if (tool === "mailaccess") return envNumber("MAILACCESS_TIMEOUT_MS", Math.max(base, 300_000), 1_000, 1_800_000);
  if (tool === "maigret") return envNumber("MAIGRET_TIMEOUT_MS", Math.max(base, 300_000), 1_000, 1_800_000);
  return base;
}

type RunOutcome = {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: NodeJS.ErrnoException;
};

/**
 * Streaming process runner. Unlike execFile it never throws away output:
 * on timeout/abort/non-zero exit we still hand back everything printed so far,
 * so long MailAccess runs keep their partial findings.
 */
function runProcess(command: string, args: string[], timeoutMs: number, signal?: AbortSignal, cwd?: string, envOverrides?: NodeJS.ProcessEnv): Promise<RunOutcome> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const isWindows = process.platform === "win32";
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      detached: !isWindows, // own process group so we can kill grandchildren too
      env: { ...process.env, ...envOverrides, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", NO_COLOR: "1", TERM: "dumb" },
    });
    const finish = (outcome: Partial<RunOutcome>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, code: null, timedOut, aborted, ...outcome });
    };
    const killTree = (signal: NodeJS.Signals) => {
      try {
        if (isWindows && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
        else if (child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { try { child.kill(signal); } catch { /* already gone */ } }
    };
    const kill = () => {
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), 2000).unref();
      // Never wait on pipes that grandchildren may keep open: return what we have.
      setTimeout(() => finish({}), 2500).unref();
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const onAbort = () => { aborted = true; kill(); };
    if (signal?.aborted) onAbort(); else signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk; });
    child.on("error", (error) => finish({ spawnError: error as NodeJS.ErrnoException }));
    child.on("close", (code) => finish({ code }));
  });
}

function executable(tool: ToolId): string {
  const envName = `${tool.toUpperCase()}_BIN`;
  const configured = process.env[envName]?.trim();
  if (configured) return configured;

  const extension = process.platform === "win32" ? ".exe" : "";
  const binaryName = tool === "detectdee" ? "DetectDee" : tool;
  const relativeBin = process.platform === "win32" ? "Scripts" : "bin";
  const goBin = process.env.GOBIN?.trim();
  const goPaths = (process.env.GOPATH || join(homedir(), "go"))
    .split(delimiter)
    .filter(Boolean)
    .map((path) => join(path, "bin", `${binaryName}${extension}`));
  const candidates = [
    join(process.cwd(), ".venv", relativeBin, `${binaryName}${extension}`),
    join(homedir(), "Documents", "email-footprint-checker", ".venv", relativeBin, `${binaryName}${extension}`),
    ...(goBin ? [join(goBin, `${binaryName}${extension}`)] : []),
    ...goPaths,
  ];
  candidates.push(join(homedir(), ".local", "bin", `${binaryName}${extension}`));
  if (tool === "ghunt") candidates.unshift(join(homedir(), ".local", "bin", `ghunt${extension}`));
  const found = candidates.find(existsSync);
  if (found) return found;
  const pathCommand = (process.env.PATH || "").split(delimiter)
    .map((directory) => join(directory, `${binaryName}${extension}`))
    .find(existsSync);
  return pathCommand || binaryName;
}

function detectDeeDataFile(command: string): string | undefined {
  const configured = process.env.DETECTDEE_DATA?.trim();
  const candidates = [
    ...(configured ? [configured] : []),
    join(dirname(command), "data.json"),
    join(process.cwd(), "data.json"),
  ];
  return candidates.find(existsSync);
}

function cleanUsername(email: string): string {
  // "jane+newsletters@x.com" -> "jane": the +tag is a mail alias, not part of the person's handle.
  return email.split("@")[0].split("+")[0].replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}


const CATEGORY_KEYWORDS: Array<[InvestigationResultItem["category"], RegExp]> = [
  ["Developer & Technical", /github|gitlab|bitbucket|docker|npm|pypi|stack ?(overflow|exchange)|codepen|replit|hackerone|bugcrowd|leetcode|kaggle|hacker ?news|sourceforge|dev\.to|hashnode|codeforces|hackerrank|gitea|jsfiddle|glitch|heroku|vercel|netlify|gist|crates|rubygems|launchpad|sentry/i],
  ["Productivity & Cloud", /google|microsoft|office|outlook|notion|atlassian|jira|slack|dropbox|adobe|trello|evernote|zoom|asana|box\.com|canva|figma|airtable|miro|clickup|monday|onedrive|icloud|proton|zoho|mailchimp|hubspot|salesforce/i],
  ["Commerce & Media", /spotify|amazon|ebay|netflix|steam|etsy|paypal|aliexpress|shopify|soundcloud|deezer|tidal|imdb|goodreads|audible|bandcamp|last\.?fm|twitch|youtube|vimeo|flickr|aliexpress|wish|walmart|target|ikea|nike|adidas|booking|airbnb|uber|lyft|doordash|fiverr|upwork|patreon|kickstarter/i],
];

export function categorize(tool: ToolId, platform: string): NonNullable<InvestigationResultItem["category"]> {
  if (tool === "hibp") return "Data Breaches";
  if (tool === "mailaccess") return "Email & Domain";
  if (tool === "ghunt") return "Productivity & Cloud";
  for (const [category, pattern] of CATEGORY_KEYWORDS) if (category && pattern.test(platform)) return category;
  return "Social & Community";
}

function createResult(
  tool: ToolId,
  platform: string,
  status: PlatformResultStatus,
  details: Record<string, unknown> = {},
  errorMessage?: string,
  url?: string,
  confidence?: ResultConfidence,
): InvestigationResultItem {
  const category = categorize(tool, platform);
  return {
    tool,
    platform,
    category,
    status,
    ...(url ? { url } : {}),
    ...(confidence ? { confidence } : {}),
    details,
    duration: 0,
    checkedAt: new Date().toISOString(),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

const MAILACCESS_NON_FINDING_TYPES = new Set(["start", "complete", "progress", "log", "debug", "status", "heartbeat", "error", "warning", "summary"]);

function toConfidence(value: unknown): ResultConfidence | undefined {
  if (typeof value === "number") return value >= 0.8 ? "high" : value >= 0.5 ? "medium" : "low";
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  return v === "high" || v === "medium" || v === "low" ? v : undefined;
}

export function parseMailAccessOutput(output: string, duration: number, options: { partial?: boolean; stderr?: string } = {}): ToolRunResult {
  const rows = output.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return [];
    try {
      const value: unknown = JSON.parse(trimmed);
      return value && typeof value === "object" && !Array.isArray(value) ? [value as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
  const complete = [...rows].reverse().find((row) => row.type === "complete");
  const findings = rows.filter((row) => !MAILACCESS_NON_FINDING_TYPES.has(String(row.type || "").toLowerCase()));

  // Previously a run without a "complete" row (timeout, killed, crash) threw every finding away.
  if (!complete && !findings.length) {
    const hint = options.stderr?.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 300);
    return {
      tool: "mailaccess",
      results: [{
        ...createResult("mailaccess", "MailAccess", "error", {}, options.partial
          ? "MailAccess hit the time limit before reporting anything. Raise MAILACCESS_TIMEOUT_MS / MAILACCESS_BUDGET_SEC."
          : `No structured response was returned.${hint ? ` ${hint}` : ""}`),
        duration,
      }],
    };
  }
  const reportSummary = complete ? {
    ...(typeof complete.score === "number" ? { score: complete.score } : {}),
    ...(typeof complete.risk === "string" ? { risk: complete.risk } : {}),
    ...(typeof complete.credential_risk_score === "number" ? { credentialRiskScore: complete.credential_risk_score } : {}),
    ...(typeof complete.credential_risk_band === "string" ? { credentialRiskBand: complete.credential_risk_band } : {}),
    ...(typeof complete.total_findings === "number" ? { totalFindings: complete.total_findings } : {}),
  } : {};
  const results = findings.map((finding, index) => {
    const platform = String(finding.platform || finding.service || finding.source || finding.module || `Finding ${index + 1}`);
    const url = typeof finding.profile_url === "string"
      ? finding.profile_url
      : typeof finding.url === "string"
        ? finding.url
        : undefined;
    return createResult(
      "mailaccess",
      platform,
      "found",
      {
        ...finding,
        ...(Object.keys(reportSummary).length ? { reportSummary } : {}),
        ...(options.partial ? { partialRun: true } : {}),
      },
      undefined,
      url,
      toConfidence(finding.confidence) ?? "medium",
    );
  });
  if (!results.length) results.push(createResult("mailaccess", "MailAccess", "not_found", {
    message: "No findings reported.",
    ...(Object.keys(reportSummary).length ? { reportSummary } : {}),
  }));
  return {
    tool: "mailaccess",
    results: results.map((item) => ({ ...item, duration })),
    ...(options.partial ? { error: `Time limit reached; showing ${findings.length} finding(s) collected so far.` } : {}),
  };
}

export function parseHoleheOutput(output: string, duration: number): ToolRunResult {
  const results: InvestigationResultItem[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*\[(\+|-|x)\]\s+(.+?)\s*$/i);
    if (!match || /^(email used|email not used|rate limit)$/i.test(match[2])) continue;
    const [, marker, platform] = match;
    const status: PlatformResultStatus =
      marker === "+"
        ? "found"
        : marker.toLowerCase() === "x"
          ? "not_checked"
          : "not_found";
    results.push({
      ...createResult(
        "holehe",
        platform,
        status,
        {},
        status === "not_checked" ? "This service blocked or rate-limited the check." : undefined,
      ),
      duration,
    });
  }
  if (!results.length) {
    results.push({
      ...createResult("holehe", "Holehe", "error", {}, "Holehe returned no platform results."),
      duration,
    });
  }
  return { tool: "holehe", results };
}

const GENERIC_LOCAL_PARTS = new Set(["info", "admin", "contact", "support", "sales", "hello", "mail", "office", "team", "service", "noreply", "no-reply", "webmaster", "postmaster", "user", "test", "me"]);

/** A username derived from an email is only a guess; short/common ones collide with strangers. */
export function usernameReliability(username: string): { reliable: boolean; reason?: string } {
  const bare = username.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (GENERIC_LOCAL_PARTS.has(username.toLowerCase())) return { reliable: false, reason: "Generic mailbox name shared by many unrelated people." };
  if (bare.length < 6) return { reliable: false, reason: "Short username; likely belongs to different people on many sites." };
  if (/^[a-z]+\d{0,3}$/.test(bare) && bare.length < 8) return { reliable: false, reason: "Common-looking username; matches are often other people." };
  return { reliable: true };
}

export async function parseMaigretOutput(reportDir: string, email: string, duration: number): Promise<ToolRunResult> {
  const expected = `report_${cleanUsername(email)}_simple.json`;
  const files = await readdir(reportDir);
  const reportFile = files.includes(expected) ? expected : files.find((name) => name.endsWith("_simple.json"));
  if (!reportFile) throw new Error("Maigret wrote no JSON report.");
  const report = JSON.parse(await readFile(join(reportDir, reportFile), "utf8")) as Record<string, Record<string, unknown>>;
  const reliability = usernameReliability(cleanUsername(email));
  const results = Object.entries(report).map(([platform, value]) => {
    const status = value.status && typeof value.status === "object"
      ? value.status as Record<string, unknown>
      : {};
    const url = typeof value.url_user === "string"
      ? value.url_user
      : typeof status.url === "string"
        ? status.url
        : typeof value.url === "string"
          ? value.url
          : undefined;
    const details: Record<string, unknown> = {
      usernameMatch: true,
      identityNote: "Matched by username guessed from the email's local part. This may be a different person.",
      ...(reliability.reliable ? {} : { reliabilityWarning: reliability.reason }),
      ...(typeof value.username === "string" ? { username: value.username } : {}),
      ...(typeof value.site_name === "string" ? { siteName: value.site_name } : {}),
      ...(Array.isArray(value.tags) ? { tags: value.tags } : {}),
      ...(Array.isArray(value.keywords) ? { keywords: value.keywords } : {}),
      ...(value.ids_data && typeof value.ids_data === "object" ? { linkedIdentifiers: value.ids_data } : {}),
      ...(typeof status.status === "string" ? { matchStatus: status.status } : {}),
    };
    return {
      ...createResult("maigret", platform, "found", details, undefined, url, "low"),
      duration,
    };
  });
  if (!results.length) results.push({ ...createResult("maigret", "Maigret", "not_found"), duration });
  return { tool: "maigret", results };
}

function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Pulls the richer structured fields out of `ghunt email --json`. Defensive: GHunt's schema varies by version. */
export function extractGHuntJson(raw: unknown): Record<string, unknown> {
  const container = (pick(raw, "PROFILE_CONTAINER") ?? raw) as Record<string, unknown> | undefined;
  const profile = (pick(container, "profile") ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const names: Record<string, unknown> = {};
  const nameObj = profile.names as Record<string, Record<string, unknown>> | undefined;
  for (const [source, value] of Object.entries(nameObj || {})) {
    if (value && typeof value === "object") {
      const full = value.fullname ?? value.fullName;
      if (typeof full === "string") names[source] = full;
    }
  }
  if (Object.keys(names).length) out.names = names;
  if (typeof profile.personId === "string") out.personId = profile.personId;
  const emails = profile.emails as Record<string, Record<string, unknown>> | undefined;
  if (emails && typeof emails === "object") {
    out.emails = Object.values(emails).map((e) => e?.value).filter((v): v is string => typeof v === "string");
  }
  const photoUrl = (group: unknown) => {
    const first = group && typeof group === "object" ? Object.values(group as Record<string, Record<string, unknown>>)[0] : undefined;
    const url = first && typeof first.url === "string" ? first.url : undefined;
    return url && /^https:\/\/[^/]*\.googleusercontent\.com\//i.test(url) ? url : undefined;
  };
  const profilePhoto = photoUrl(profile.profilePhotos);
  const coverPhoto = photoUrl(profile.coverPhotos);
  if (profilePhoto) out.profilePhotoUrl = profilePhoto;
  if (coverPhoto) out.coverPhotoUrl = coverPhoto;
  const sources = profile.sourceIds as Record<string, unknown> | undefined;
  if (sources && typeof sources === "object") out.profileSources = Object.keys(sources);
  const reach = profile.inAppReachability as Record<string, Record<string, unknown>> | undefined;
  if (reach && typeof reach === "object") {
    out.inAppReachability = Object.fromEntries(Object.entries(reach).map(([k, v]) => [k, (v?.apps as unknown) ?? v?.status ?? true]));
  }
  const maps = pick(container, "maps");
  if (maps && typeof maps === "object") {
    const m = maps as Record<string, unknown>;
    const stats = m.stats ?? m.contributorStats;
    if (stats && typeof stats === "object") out.mapsStatsJson = stats;
    if (Array.isArray(m.reviews)) out.mapsReviewCount = m.reviews.length;
    if (Array.isArray(m.photos)) out.mapsPhotoCount = m.photos.length;
  }
  const cal = pick(container, "calendar");
  if (cal && typeof cal === "object") {
    const c = cal as Record<string, unknown>;
    if (Array.isArray(c.events)) out.calendarEventCount = c.events.length;
  }
  return out;
}


function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** Sherlock prints "[+] SiteName: https://..." for every hit (with --print-found). */
export function parseSherlockOutput(output: string, username: string, duration: number): ToolRunResult {
  const reliability = usernameReliability(username);
  const seen = new Set<string>();
  const results: InvestigationResultItem[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*\[\+\]\s+(.+?):\s+(https?:\/\/\S+)\s*$/);
    if (!match || seen.has(match[2])) continue;
    seen.add(match[2]);
    results.push({
      ...createResult("sherlock", match[1], "found", {
        usernameMatch: true,
        username,
        identityNote: "Matched by username guessed from the email's local part. This may be a different person.",
        ...(reliability.reliable ? {} : { reliabilityWarning: reliability.reason }),
      }, undefined, match[2], "low"),
      duration,
    });
  }
  if (!results.length) {
    const failed = /command not found|No module named|Traceback/i.test(output);
    results.push({ ...createResult("sherlock", "Sherlock", failed ? "error" : "not_found", {}, failed ? "Sherlock failed to run: " + output.trim().split(/\r?\n/).slice(-1)[0].slice(0, 160) : undefined), duration });
  }
  return { tool: "sherlock", results };
}

/**
 * Blackbird: best-effort. Newer versions write a JSON file; older ones print "[+]"/"✔" lines with URLs.
 * Both are accepted; anything that looks like a found account with a URL becomes a result.
 */
export function parseBlackbirdOutput(output: string, jsonFiles: unknown[], duration: number): ToolRunResult {
  const found = new Map<string, string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    const url = [row.url, row.uri, row.link].find((v): v is string => typeof v === "string" && /^https?:\/\//.test(v));
    const status = String(row.status ?? row.result ?? row.found ?? "").toLowerCase();
    if (url && /found|true|claimed|exists|ok/.test(status) && !/not.?found|false/.test(status)) {
      found.set(url, String(row.name ?? row.site ?? row.platform ?? hostLabel(url)));
    }
    Object.values(row).forEach((v) => { if (v && typeof v === "object") visit(v); });
  };
  jsonFiles.forEach(visit);
  if (!found.size) {
    for (const line of output.split(/\r?\n/)) {
      const url = line.match(/https?:\/\/[^\s\]\)]+/)?.[0];
      if (!url || !/(\[\+\]|✔|found|FOUND)/.test(line) || /not found|\[-\]|✖/i.test(line)) continue;
      const label = line.match(/\[([^\]+\-\s][^\]]*)\]\s*(?:https?:)/)?.[1] ?? hostLabel(url);
      found.set(url, label.trim());
    }
  }
  const results = [...found].map(([url, name]) => ({
    ...createResult("blackbird", name, "found", {
      note: "Reported by Blackbird using the email address. Not independently verified.",
    }, undefined, url, "medium"),
    duration,
  }));
  if (!results.length) results.push({ ...createResult("blackbird", "Blackbird", "not_found"), duration });
  return { tool: "blackbird", results };
}

export function parseIgnorantOutput(output: string, duration: number): ToolRunResult {
  const results: InvestigationResultItem[] = [];
  for (const line of output.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    const match = line.trim().match(/^\[(\+|-|x)\]\s+(.+)$/i);
    if (!match) continue;
    const [, marker, value] = match;
    const platform = value.split(/\s{2,}/, 2)[0].trim();
    if (!platform) continue;
    const status: PlatformResultStatus =
      marker === "+" ? "found" : marker.toLowerCase() === "x" ? "not_checked" : "not_found";
    results.push({
      ...createResult(
        "ignorant",
        platform,
        status,
        { output: value },
        status === "not_checked" ? "The service check was rate-limited." : undefined,
      ),
      duration,
    });
  }
  return {
    tool: "ignorant",
    results: results.length
      ? results
      : [{ ...createResult("ignorant", "Ignorant", "error", {}, "Ignorant returned no parseable service results."), duration }],
  };
}

export function parseDetectDeeOutput(output: string, duration: number): ToolRunResult {
  const results = output.split(/\r?\n/).flatMap((line) => {
    const [target, platform, ...urlParts] = line.split(",");
    const url = urlParts.join(",").trim();
    if (!target || !platform || !url || !/^https?:\/\//i.test(url)) return [];
    return [{
      ...createResult("detectdee", platform.trim(), "found", { target: target.trim() }, undefined, url),
      duration,
    }];
  });
  return {
    tool: "detectdee",
    results: results.length
      ? results
      : [{ ...createResult("detectdee", "DetectDee", "not_found"), duration }],
  };
}

export function parsePhoneInfogaOutput(output: string, duration: number, exitCode: number | null): ToolRunResult {
  const report = output.trim().slice(0, 20_000);
  const status: PlatformResultStatus = exitCode === 0 && report ? "found" : exitCode === 0 ? "not_found" : "error";
  return {
    tool: "phoneinfoga",
    results: [{
      ...createResult(
        "phoneinfoga",
        "Phone number report",
        status,
        report ? { report } : {},
        status === "error" ? "PhoneInfoga did not complete successfully." : undefined,
      ),
      duration,
    }],
  };
}

export function parseGHuntOutput(output: string, duration: number, jsonExtras?: Record<string, unknown>): ToolRunResult {
  if (/the target wasn.t found|does not match a public google account/i.test(output)) {
    return { tool: "ghunt", results: [{ ...createResult("ghunt", "Google", "not_found"), duration }] };
  }
  if (/google account data|gaia id:/i.test(output)) {
    const readLine = (label: string) =>
      output.match(new RegExp(`^\\s*(?:\\[[+x-]\\]\\s*)?${label}\\s*:\\s*(.+)$`, "im"))?.[1].trim();
    const readSectionLines = (label: string) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const section = output.match(new RegExp(`${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:Entity Type\\s*:|Customer ID\\s*:|Entreprise User\\s*:|📞|🌐|🎮|🗺️|🗓️)|\\n\\s*\\n|$)`, "i"))?.[1] || "";
      return section.match(/^\s*-\s+(.+)$/gm)?.map((line) => line.replace(/^\s*-\s+/, "").replace(/\s+\[italic\].*$/, "").trim()) || [];
    };
    const readGoogleImage = (value?: string) => {
      if (!value) return undefined;
      try {
        const image = new URL(value);
        return image.protocol === "https:" && image.hostname.endsWith(".googleusercontent.com")
          ? image.href
          : undefined;
      } catch {
        return undefined;
      }
    };
    const readImage = (label: string) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const value = output.match(new RegExp(`${escaped}[\\s\\S]{0,100}?=>\\s*(https:\\/\\/\\S+)`, "i"))?.[1];
      return readGoogleImage(value);
    };
    const servicesSection =
      output.match(/Activated Google services\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\[\+]|$)/i)?.[1] || "";
    const services = servicesSection.match(/^\s*-\s+(.+)$/gm)?.map((line) => line.replace(/^\s*-\s+/, "").trim()) || [];
    const profileImageUrl = readImage("Custom profile picture");
    const coverImageUrl = readImage("Custom cover picture");
    const userTypes = readSectionLines("User types");
    const activatedServices = readSectionLines("Activated Google services");
    const mapsStats = Object.fromEntries(
      [...output.matchAll(/^\s*(Reviews|Ratings|Photos)\s*:\s*(\d+)\s*$/gim)]
        .map((match) => [match[1].toLowerCase(), Number(match[2])]),
    );
    const mapsProfile = output.match(/Profile page\s*:\s*(https:\/\/www\.google\.com\/maps\/contrib\/\S+)/i)?.[1];
    const mapsStatus = /Your IP has been blocked by Google/i.test(output)
      ? "blocked"
      : /Google Maps returned an unexpected or unavailable response/i.test(output)
        ? "unavailable"
        : /Reviews are private/i.test(output)
          ? "private"
          : /No reviews, ratings or photos found/i.test(output)
            ? "no_public_activity"
            : Object.keys(mapsStats).length
              ? "available"
              : "unknown";
    const avatarUrl = readGoogleImage(readLine("Avatar"));
    const playerGames: Record<string, unknown> = {
      status: /Found player profile/i.test(output)
        ? /Profile is public/i.test(output) ? "public" : "found"
        : /Profile is private/i.test(output) ? "private" : "not_found",
      ...(readLine("Username") ? { username: readLine("Username") } : {}),
      ...(readLine("Player ID") ? { playerId: readLine("Player ID") } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(output.match(/Played to\s+(\d+)\s+games/i) ? { gamesPlayed: Number(output.match(/Played to\s+(\d+)\s+games/i)?.[1]) } : {}),
      ...(output.match(/Got\s+(\d+)\s+achievements/i) ? { achievements: Number(output.match(/Got\s+(\d+)\s+achievements/i)?.[1]) } : {}),
      ...(readLine("Last played game") ? { lastPlayedGame: readLine("Last played game") } : {}),
      ...(readLine("Game with the most achievements") ? { topAchievementGame: readLine("Game with the most achievements") } : {}),
    };
    const calendarFound = /Public Google Calendar found/i.test(output);
    const calendarNamesSection =
      output.match(/Found other names used by the target\s*:\s*([\s\S]*?)(?:\n\s*\n|$)/i)?.[1] || "";
    const calendarNames = calendarNamesSection.match(/^\s*-\s+(.+)$/gm)?.map((line) => line.replace(/^\s*-\s+/, "").trim()) || [];
    const calendarEvents = output.split(/\r?\n/).flatMap((line) => {
      if (!line.includes("|")) return [];
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 3 || cells[0] === "Name" || cells.every((cell) => /^[-+]+$/.test(cell))) return [];
      return [{ name: cells[0], dateTimeUtc: cells[1], duration: cells[2] }];
    });
    const calendarDownloadUrl =
      output.match(/=>\s*(https:\/\/calendar\.google\.com\/calendar\/ical\/\S+\/public\/basic\.ics)/i)?.[1];
    const calendar: Record<string, unknown> = {
      status: calendarFound ? "public" : "not_found",
      ...(readLine("Calendar ID") ? { id: readLine("Calendar ID") } : {}),
      ...(readLine("Calendar Summary") ? { summary: readLine("Calendar Summary") } : {}),
      ...(readLine("Calendar Timezone") ? { timeZone: readLine("Calendar Timezone") } : {}),
      ...(output.match(/(\d+)\s+events? dumped/i) ? { eventsDumped: Number(output.match(/(\d+)\s+events? dumped/i)?.[1]) } : {}),
      ...(calendarEvents.length ? { recentEvents: calendarEvents } : {}),
      ...(calendarNames.length ? { otherNames: calendarNames } : {}),
      ...(calendarDownloadUrl ? { downloadUrl: calendarDownloadUrl } : {}),
    };
    const details: Record<string, unknown> = {
      ...(readLine("Email") ? { email: readLine("Email") } : {}),
      ...(readLine("Gaia ID") ? { gaiaId: readLine("Gaia ID") } : {}),
      ...(readLine("Last profile edit") ? { lastProfileEdit: readLine("Last profile edit") } : {}),
      ...(readLine("Entity Type") ? { entityType: readLine("Entity Type") } : {}),
      ...(readLine("Entreprise User") ? { enterpriseUser: readLine("Entreprise User") } : {}),
      ...(readLine("Customer ID") ? { customerId: readLine("Customer ID") } : {}),
      ...(profileImageUrl ? { profileImageUrl } : {}),
      ...(coverImageUrl ? { coverImageUrl } : {}),
      ...(userTypes.length ? { userTypes } : {}),
      ...(activatedServices.length ? { activatedServices } : {}),
      ...(Object.keys(mapsStats).length ? { mapsContributorStats: mapsStats } : {}),
      ...(mapsProfile ? { mapsProfile } : {}),
      mapsStatus,
      playGames: playerGames,
      calendar,
      ...(jsonExtras && Object.keys(jsonExtras).length ? { structured: jsonExtras } : {}),
    };
    return {
      tool: "ghunt",
      results: [{
        ...createResult("ghunt", "Google Account", "found", details, undefined, mapsProfile, "high"),
        duration,
      }],
    };
  }
  return {
    tool: "ghunt",
    results: [{
      ...createResult("ghunt", "Google", "error", {}, /jsondecodeerror|json\.decoder/i.test(output)
        ? "GHunt received a response it could not parse. Results may be incomplete; try again later."
        : /GHuntInvalidSession|ghunt login/i.test(output)
          ? "Complete GHunt's one-time login in a local terminal."
          : "GHunt did not return recognizable account output."),
      duration,
    }],
  };
}

function plainText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hibpNotFound(message: string, duration: number): ToolRunResult {
  return {
    tool: "hibp",
    results: [{ ...createResult("hibp", "Have I Been Pwned", "not_found", { message }), duration }],
  };
}

function hibpError(message: string, duration: number): ToolRunResult {
  return {
    tool: "hibp",
    results: [{ ...createResult("hibp", "Have I Been Pwned", "error", {}, message), duration }],
  };
}

export function hibpLookupToToolRunResult(
  lookup: HibpLookupResult,
  duration: number,
): ToolRunResult {
  if (lookup.status === "not_found") return hibpNotFound(lookup.message, duration);
  if (lookup.status === "error") return hibpError(lookup.message, duration);
  if (lookup.breaches.length === 0) {
    return hibpError("HIBP showed a breach history, but returned no readable breach cards.", duration);
  }

  return {
    tool: "hibp",
    results: lookup.breaches.map((breach) => ({
      ...createResult("hibp", breach.title, "found", {
        source: "Have I Been Pwned",
        matchContext: "This exact email address appears in HIBP's record for this breach.",
        ...(breach.breachDate ? { breachDate: breach.breachDate } : {}),
        ...(breach.dataClasses.length ? { dataClasses: breach.dataClasses } : {}),
        ...(breach.description ? { description: breach.description } : {}),
        dataScopeNote: "Data types describe the breach overall, not confirmed fields for this email.",
      }, undefined, breach.url),
      duration,
    })),
  };
}

async function runHibp(email: string, signal?: AbortSignal): Promise<ToolRunResult> {
  const started = Date.now();
  try {
    return hibpLookupToToolRunResult(await searchHibp(email, signal), Date.now() - started);
  } catch (error) {
    return hibpError(
      error instanceof Error ? error.message : "The HIBP browser check failed.",
      Date.now() - started,
    );
  }
}

export async function scannerAvailability(): Promise<Record<ToolId, "ready" | "optional" | "unavailable">> {
  const availability = {} as Record<ToolId, "ready" | "optional" | "unavailable">;
  for (const tool of RUNNABLE_TOOLS) {
    const path = executable(tool);
    const isPath = path.includes("/") || path.includes("\\");
    const blackbirdScript = tool === "blackbird" ? process.env.BLACKBIRD_SCRIPT?.trim() : undefined;
    const detectDeeData = tool === "detectdee" ? detectDeeDataFile(path) : undefined;
    const installed =
      isPath &&
      existsSync(path) &&
      (!blackbirdScript || existsSync(blackbirdScript)) &&
      (tool !== "detectdee" || Boolean(detectDeeData));
    availability[tool] = installed ? (CORE_TOOLS.includes(tool) ? "ready" : "optional") : "unavailable";
  }
  availability.hibp = hibpBrowserExecutable() ? "ready" : "unavailable";
  return availability;
}

export async function runScanner(
  tool: ToolId,
  target: string,
  signal?: AbortSignal,
  matchScope: MatchScope = "email_and_username",
  targetType: InvestigationTargetType = "email",
  phoneCountryCode?: string,
): Promise<ToolRunResult> {
  if (tool === "hibp") return runHibp(target, signal);
  if (!RUNNABLE_TOOLS.includes(tool)) {
    return { tool, results: [createResult(tool, tool, "error", {}, `${tool} is not supported.`)] };
  }
  const phoneTools: ToolId[] = ["phoneinfoga", "ignorant"];
  if (targetType === "phone" && !phoneTools.includes(tool) && tool !== "detectdee") {
    return { tool, results: [createResult(tool, tool, "error", {}, `${tool} does not support phone-number scans.`)] };
  }
  if (targetType === "email" && phoneTools.includes(tool)) {
    return { tool, results: [createResult(tool, tool, "error", {}, `${tool} requires a phone number.`)] };
  }

  const command = executable(tool);
  const workDir = await mkdtemp(join(tmpdir(), `cleartrace-${tool}-`));
  const started = Date.now();
  const timeout = toolTimeoutMs(tool);
  try {
    const ghuntJsonPath = join(workDir, "ghunt.json");
    const detectDeeOutputPath = join(workDir, "detectdee-results.txt");
    const detectDeeDataPath = tool === "detectdee" ? detectDeeDataFile(command) : undefined;
    const normalizedPhone = target.replace(/\D/g, "");
    const normalizedCountryCode = phoneCountryCode?.replace(/\D/g, "") || "";
    const nationalNumber = normalizedPhone.startsWith(normalizedCountryCode)
      ? normalizedPhone.slice(normalizedCountryCode.length)
      : "";
    if ((tool === "ignorant" || tool === "phoneinfoga" || tool === "detectdee") &&
        targetType === "phone" &&
        (!normalizedCountryCode || nationalNumber.length < 4)) {
      return { tool, results: [createResult(tool, tool, "error", {}, "Enter a country calling code and a complete international phone number.")] };
    }
    if (tool === "detectdee" && !detectDeeDataPath) {
      return { tool, results: [createResult(tool, tool, "error", {}, "DetectDee site data is missing. Set DETECTDEE_DATA to its data.json file.")] };
    }
    const mailConfig = mailAccessExecutionConfig(target, matchScope);
    const blackbirdScript = tool === "blackbird" ? process.env.BLACKBIRD_SCRIPT?.trim() : undefined;
    let blackbirdScriptToRun = blackbirdScript;
    if (blackbirdScript) {
      const sourceRoot = dirname(blackbirdScript);
      blackbirdScriptToRun = join(workDir, basename(blackbirdScript));
      await cp(blackbirdScript, blackbirdScriptToRun);
      for (const directory of ["assets", "data", "src"]) {
        await cp(join(sourceRoot, directory), join(workDir, directory), { recursive: true });
      }
      await mkdir(join(workDir, "logs"), { recursive: true });
    }
    const args = tool === "phoneinfoga"
      ? ["scan", "-n", `+${normalizedPhone}`]
      : tool === "ignorant"
        ? [`+${normalizedCountryCode}`, nationalNumber, "--no-color", "--no-clear"]
        : tool === "detectdee"
          ? [
            "detect",
            targetType === "phone" ? "--phone" : "--email",
            targetType === "phone" ? `+${normalizedPhone}` : target,
            "--file", detectDeeDataPath!,
            "--output", detectDeeOutputPath,
            "--precisely",
          ]
      : tool === "mailaccess"
      ? mailConfig.args
      : tool === "holehe"
        ? [target, "--no-color", "--no-clear"]
        : tool === "maigret"
          ? [cleanUsername(target), "--no-progressbar", "--no-autoupdate", "--no-recursion",
             "--top-sites", String(envNumber("MAIGRET_TOP_SITES", 200, 10, 3000)),
             "--json", "simple", "--folderoutput", workDir]
          : tool === "sherlock"
            ? [cleanUsername(target), "--print-found", "--no-color", "--timeout", "15", "--folderoutput", workDir]
            : tool === "blackbird"
              ? ["-e", target, "--json", "--no-update"]
              : ["email", target, "--json", ghuntJsonPath];
    if (blackbirdScriptToRun) args.unshift(blackbirdScriptToRun);

    const outcome = await runProcess(
      command,
      args,
      timeout,
      signal,
      tool === "blackbird" ? workDir : undefined,
      tool === "mailaccess" ? mailConfig.env : undefined,
    );
    const duration = Date.now() - started;
    const output = `${outcome.stdout}\n${outcome.stderr}`.trim();

    if (outcome.spawnError) {
      const message = outcome.spawnError.code === "ENOENT"
        ? `${tool} is not installed or not found. Set ${tool.toUpperCase()}_BIN in .env to its full path.`
        : outcome.spawnError.message;
      return { tool, results: [{ ...createResult(tool, tool, "error", {}, message), duration }] };
    }
    if (outcome.aborted) {
      return { tool, results: [{ ...createResult(tool, tool, "error", {}, "Cancelled."), duration }] };
    }

    if (tool === "phoneinfoga") return parsePhoneInfogaOutput(output, duration, outcome.code);
    if (tool === "ignorant") return parseIgnorantOutput(output, duration);
    if (tool === "detectdee") {
      if (outcome.code !== 0 && !existsSync(detectDeeOutputPath)) {
        return {
          tool,
          results: [{
            ...createResult(tool, "DetectDee", "error", {}, output.slice(-500) || "DetectDee did not complete successfully."),
            duration,
          }],
        };
      }
      const report = existsSync(detectDeeOutputPath)
        ? await readFile(detectDeeOutputPath, "utf8")
        : "";
      return parseDetectDeeOutput(report, duration);
    }

    if (tool === "mailaccess") {
      return parseMailAccessOutput(outcome.stdout, duration, { partial: outcome.timedOut, stderr: outcome.stderr });
    }
    if (tool === "holehe") {
      const parsed = parseHoleheOutput(output, duration);
      return outcome.timedOut ? { ...parsed, error: "Time limit reached; showing the services checked so far." } : parsed;
    }
    if (tool === "maigret") {
      try {
        const parsed = await parseMaigretOutput(workDir, target, duration);
        return outcome.timedOut ? { ...parsed, error: "Time limit reached; showing the sites checked so far." } : parsed;
      } catch {
        return { tool, results: [{ ...createResult(tool, tool, "error", {}, outcome.timedOut
          ? "Maigret timed out before writing a report. Lower MAIGRET_TOP_SITES or raise MAIGRET_TIMEOUT_MS."
          : "Maigret did not write a report. " + outcome.stderr.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 200)), duration }] };
      }
    }
    if (tool === "sherlock") {
      const parsed = parseSherlockOutput(output, cleanUsername(target), duration);
      return outcome.timedOut ? { ...parsed, error: "Time limit reached; showing the sites checked so far." } : parsed;
    }
    if (tool === "blackbird") {
      const jsons: unknown[] = [];
      const walk = async (dir: string, depth = 0): Promise<void> => {
        if (depth > 3) return;
        for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) await walk(full, depth + 1);
          else if (entry.name.endsWith(".json")) { try { jsons.push(JSON.parse(await readFile(full, "utf8"))); } catch { /* skip */ } }
        }
      };
      await walk(workDir);
      const parsed = parseBlackbirdOutput(output, jsons, duration);
      return outcome.timedOut ? { ...parsed, error: "Time limit reached; showing what Blackbird found so far." } : parsed;
    }
    // ghunt
    let extras: Record<string, unknown> | undefined;
    try {
      extras = extractGHuntJson(JSON.parse(await readFile(ghuntJsonPath, "utf8")));
    } catch { /* older GHunt or no account: fall back to text parsing */ }
    if (/GHuntInvalidSession|ghunt login/i.test(output)) {
      return { tool, results: [{ ...createResult(tool, tool, "error", {}, "Complete GHunt's one-time login (ghunt login) in a local terminal."), duration }] };
    }
    if (outcome.timedOut) {
      return { tool, results: [{ ...createResult(tool, tool, "error", {}, "GHunt timed out."), duration }] };
    }
    return parseGHuntOutput(output, duration, extras);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
