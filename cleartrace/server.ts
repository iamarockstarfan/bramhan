import "dotenv/config";
import express, { type Request, type Response } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createViteServer } from "vite";
import {
  InvestigationRecord,
  InvestigationResultItem,
  StartInvestigationRequest,
  ToolExecutionState,
  ToolId,
  isEmailLinkedResult,
} from "@/src/types/investigation";
import { GEMINI_MODEL, generateAiOverview } from "@/src/server/aiOverview";
import { closeHibpBrowser } from "@/src/server/hibpBrowser";
import { runScanner, scannerAvailability, toolTimeoutMs } from "@/src/server/scanner";
import { buildTextReport } from "@/src/server/report";

const app = express();
const records = new Map<string, InvestigationRecord>();
const controllers = new Map<string, AbortController[]>();
const MAX_HISTORY = Math.max(10, Number(process.env.MAX_HISTORY) || 200);
// Opt-in: scan history (which contains email addresses) is written to disk only if PERSIST_HISTORY=true.
const persistHistory = process.env.PERSIST_HISTORY?.toLowerCase() === "true";
const historyFile = join(process.cwd(), ".cleartrace", "history.json");
let saveTimer: NodeJS.Timeout | undefined;

function saveHistory(): void {
  if (!persistHistory) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(historyFile), { recursive: true });
      writeFileSync(historyFile, JSON.stringify([...records.values()]), { mode: 0o600 });
    } catch (error) { console.error("Could not save history:", error); }
  }, 500);
}

function loadHistory(): void {
  if (!persistHistory || !existsSync(historyFile)) return;
  try {
    const saved = JSON.parse(readFileSync(historyFile, "utf8")) as InvestigationRecord[];
    for (const record of saved) {
      if (record.status === "running" || record.status === "queued") {
        record.status = "failed";
        record.errorMessage = "The server restarted while this scan was running.";
        for (const run of record.toolExecutions) if (run.status === "running" || run.status === "queued") run.status = "skipped";
      }
      records.set(record.scanId, record);
    }
  } catch (error) { console.error("Could not load history:", error); }
}

function evictOldRecords(): void {
  if (records.size <= MAX_HISTORY) return;
  const finished = [...records.values()]
    .filter((item) => item.status !== "running" && item.status !== "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of finished.slice(0, records.size - MAX_HISTORY)) {
    records.delete(item.scanId);
    aiOverviewCache.delete(item.scanId);
  }
}
const aiOverviewCache = new Map<string, string>();
const aiOverviewInFlight = new Map<string, Promise<string>>();
const validTools = new Set<ToolId>([
  "mailaccess",
  "holehe",
  "maigret",
  "ghunt",
  "blackbird",
  "sherlock",
  "hibp",
  "phoneinfoga",
  "ignorant",
  "detectdee",
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phonePattern = /^\+[1-9]\d{6,14}$/;
const phoneCountryCodePattern = /^\+[1-9]\d{0,2}$/;

loadHistory();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

// ---- Programmatic API access -------------------------------------------------
// /api/v1/* is the same API as /api/* but intended for scripts and other programs.
// Set CLEARTRACE_API_KEY in .env to require "Authorization: Bearer <key>" (or X-API-Key).
// If HOST is changed from loopback, a key is mandatory for any non-local caller.
const apiKey = process.env.CLEARTRACE_API_KEY?.trim() || "";
const maxConcurrentScans = Math.max(1, Number(process.env.MAX_CONCURRENT_SCANS) || 50);

function keyMatches(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(apiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.use((request, response, next) => {
  const isV1 = request.url.startsWith("/api/v1/");
  const isApi = isV1 || request.url.startsWith("/api/");
  if (!isApi) { next(); return; }
  const remote = request.socket.remoteAddress || "";
  const isLocal = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (isV1 || !isLocal) {
    if (!apiKey) {
      if (!isLocal) { response.status(403).json({ error: "Remote API access requires CLEARTRACE_API_KEY to be set." }); return; }
    } else {
      const header = request.header("authorization") || "";
      const provided = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : (request.header("x-api-key") || "").trim();
      if (!provided || !keyMatches(provided)) {
        response.status(401).json({ error: "Missing or invalid API key." });
        return;
      }
    }
  }
  if (isV1) request.url = request.url.replace("/api/v1/", "/api/");
  next();
});

function updateSummary(record: InvestigationRecord): void {
  record.summary = {
    total: record.results.length,
    found: record.results.filter((item) => item.status === "found").length,
    notFound: record.results.filter((item) => item.status === "not_found").length,
    notChecked: record.results.filter((item) => item.status === "not_checked").length,
    errors: record.results.filter((item) => item.status === "error").length,
  };
}

function makeExecution(tool: ToolId): ToolExecutionState {
  return {
    tool,
    status: "queued",
    progress: 0,
    durationMs: 0,
    platformsChecked: 0,
    foundCount: 0,
    errorCount: 0,
    message: "Queued for investigation.",
  };
}

async function executeInvestigation(record: InvestigationRecord): Promise<void> {
  record.status = "running";
  const aborters = record.selectedTools.map(() => new AbortController());
  controllers.set(record.scanId, aborters);
  const executions = record.toolExecutions;

  await Promise.all(record.selectedTools.map(async (tool, index) => {
    const execution = executions[index];
    const started = Date.now();
    execution.status = "running";
    execution.progress = 5;
    execution.startedAt = new Date().toISOString();
    execution.message = tool === "hibp"
      ? "Checking this exact email address with Have I Been Pwned."
      : "Running local command-line check.";
    // Time-based estimate so long scans (MailAccess can take minutes) show live movement.
    const expectedMs = Math.min(toolTimeoutMs(tool), tool === "mailaccess" ? 150_000 : tool === "maigret" ? 120_000 : 60_000);
    const ticker = setInterval(() => {
      execution.durationMs = Date.now() - started;
      execution.progress = Math.max(execution.progress, Math.min(95, Math.round(5 + (execution.durationMs / expectedMs) * 90)));
    }, 500);
    try {
      const result = await runScanner(
        tool,
        record.target ?? record.email,
        aborters[index].signal,
        record.matchScope ?? "email_and_username",
        record.targetType ?? "email",
        record.phoneCountryCode,
      );
      execution.durationMs = Date.now() - started;
      if (aborters[index].signal.aborted) {
        execution.status = "skipped";
        execution.progress = 100;
        execution.message = "Cancelled.";
        return;
      }
      const emailLinkedResults = result.results.filter((item) =>
        isEmailLinkedResult(item, record.matchScope ?? "email_and_username"),
      );
      const excludedCount = result.results.length - emailLinkedResults.length;
      record.results.push(...emailLinkedResults);
      if (excludedCount > 0 && emailLinkedResults.length === 0) {
        record.results.push({
          tool,
          platform: tool,
          category: tool === "mailaccess" ? "Email & Domain" : tool === "hibp" ? "Data Breaches" : "Social & Community",
          status: "not_checked",
          details: {},
          duration: execution.durationMs,
          errorMessage: `${excludedCount} result(s) were excluded because they were not tied directly to the email address.`,
        });
      }
      execution.partial = Boolean(result.error) && emailLinkedResults.some((item) => item.status !== "error");
      execution.platformsChecked = emailLinkedResults.length;
      execution.foundCount = emailLinkedResults.filter((item) => item.status === "found").length;
      execution.errorCount = emailLinkedResults.filter((item) => item.status === "error").length;
      const notCheckedCount = emailLinkedResults.filter((item) => item.status === "not_checked").length;
      execution.status = excludedCount > 0 && emailLinkedResults.length === 0
        ? "warning"
        : execution.errorCount > 0 && execution.errorCount === emailLinkedResults.length
        ? "error"
        : execution.errorCount || notCheckedCount || execution.partial
          ? "warning"
          : "completed";
      execution.progress = 100;
      execution.message = [
        result.error || [
          `${execution.foundCount} found`,
          `${emailLinkedResults.filter((item) => item.status === "not_found").length} not found`,
          `${notCheckedCount} not checked`,
          `${execution.errorCount} errors`,
        ].join(" · "),
        ...(excludedCount > 0 ? [`${excludedCount} non-email-linked result(s) excluded.`] : []),
      ].join(" · ");
    } catch (error) {
      execution.durationMs = Date.now() - started;
      execution.status = "error";
      execution.progress = 100;
      execution.errorCount = 1;
      execution.message = error instanceof Error ? error.message : "The scanner failed.";
      record.results.push({
        tool,
        platform: tool,
        category: tool === "mailaccess" ? "Email & Domain" : tool === "hibp" ? "Data Breaches" : "Social & Community",
        status: "error",
        details: {},
        duration: execution.durationMs,
        errorMessage: execution.message,
      });
    } finally {
      clearInterval(ticker);
      updateSummary(record);
    }
  }));

  corroborate(record);
  controllers.delete(record.scanId);
  record.completedAt = new Date().toISOString();
  record.durationMs = new Date(record.completedAt).getTime() - new Date(record.createdAt).getTime();
  updateSummary(record);
  record.status = aborters.some((controller) => controller.signal.aborted)
    ? "cancelled"
    : record.summary.total === 0 || record.summary.errors === record.summary.total
      ? "failed"
      : record.summary.errors > 0 || record.summary.notChecked > 0
        ? "partial"
        : "completed";
  evictOldRecords();
  saveHistory();
}

/** Username-only hits get promoted when an email-keyed tool independently found the same platform. */
function corroborate(record: InvestigationRecord): void {
  const emailKeyed = new Set(
    record.results
      .filter((r) => r.status === "found" && (r.tool === "holehe" || r.tool === "mailaccess" || r.tool === "ghunt"))
      .map((r) => r.platform.toLowerCase().replace(/\.(com|net|org|io)$/, "").replace(/[^a-z0-9]/g, "")),
  );
  for (const item of record.results) {
    if (item.tool !== "maigret" || item.status !== "found") continue;
    const key = item.platform.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key && emailKeyed.has(key)) {
      item.confidence = "medium";
      item.details = { ...item.details, corroborated: "Also reported by an email-based check." };
    }
  }
}

function sendError(response: Response, status: number, message: string): void {
  response.status(status).json({ error: message });
}

app.get("/api/tools/health", async (_request: Request, response: Response) => {
  const availability = await scannerAvailability();
  const tools = Object.entries(availability).map(([tool, state]) => ({
    tool,
    availability: state,
    detail: tool === "hibp"
      ? state === "ready"
        ? "Microsoft Edge is ready for the HIBP browser search."
        : "Install Microsoft Edge or set HIBP_BROWSER_BIN in .env to enable the HIBP search."
      : tool === "detectdee" && state === "unavailable"
        ? "Install DetectDee and its data.json file, or set DETECTDEE_BIN and DETECTDEE_DATA in .env."
      : state === "ready"
        ? "Executable available locally."
      : state === "optional"
        ? "Optional tool detected and ready."
        : `Not installed or not found. Install it, or set ${tool.toUpperCase()}_BIN in .env to its full path.`,
  }));
  response.setHeader("Cache-Control", "no-store");
  response.json({ tools });
});

app.get("/api/investigations", (_request: Request, response: Response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ investigations: [...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.post("/api/investigations", (request: Request, response: Response) => {
  const body = request.body as Partial<StartInvestigationRequest> | undefined;
  const targetType = body?.targetType ?? "email";
  const target = typeof body?.target === "string"
    ? body.target.trim()
    : typeof body?.email === "string"
      ? body.email.trim()
      : "";
  const phoneCountryCode = typeof body?.phoneCountryCode === "string"
    ? body.phoneCountryCode.trim()
    : "";
  if (targetType !== "email" && targetType !== "phone") {
    sendError(response, 400, "Choose a supported investigation target.");
    return;
  }
  if (targetType === "email" && (!target || target.length > 254 || !emailPattern.test(target))) {
    sendError(response, 400, "Provide one valid email address.");
    return;
  }
  if (
    targetType === "phone" &&
    (
      !phonePattern.test(target) ||
      !phoneCountryCodePattern.test(phoneCountryCode) ||
      !target.startsWith(phoneCountryCode) ||
      target.slice(phoneCountryCode.length).length < 4
    )
  ) {
    sendError(response, 400, "Provide an international phone number, country calling code, and at least four national digits.");
    return;
  }
  if (body?.authorizedConfirmed !== true) {
    sendError(response, 403, "Confirm that you own this target or have explicit permission to check it.");
    return;
  }
  if (!Array.isArray(body.tools) || body.tools.length === 0 || body.tools.length > validTools.size || body.tools.some((tool) => !validTools.has(tool))) {
    sendError(response, 400, "Choose one or more supported scanner tools.");
    return;
  }
  const matchScope = body.matchScope === undefined ? "email" : body.matchScope;
  if (matchScope !== "email" && matchScope !== "email_and_username") {
    sendError(response, 400, "Choose a supported match scope.");
    return;
  }
  const selectedTools = [...new Set(body.tools)] as ToolId[];
  const phoneTools = new Set<ToolId>(["phoneinfoga", "ignorant"]);
  const compatibleTools = targetType === "phone"
    ? selectedTools.filter((tool) => phoneTools.has(tool) || tool === "detectdee")
    : selectedTools.filter((tool) => !phoneTools.has(tool));
  const tools = targetType === "email" && matchScope === "email"
    ? compatibleTools.filter((tool) => tool !== "maigret" && tool !== "sherlock")
    : compatibleTools;
  if (tools.length === 0) {
    sendError(response, 400, targetType === "phone"
      ? "Phone investigations require PhoneInfoga, Ignorant, or DetectDee."
      : "Choose at least one compatible email scanner for the selected match scope.");
    return;
  }
  const active = [...records.values()].filter((item) => item.status === "queued" || item.status === "running").length;
  if (active >= maxConcurrentScans) {
    response.setHeader("Retry-After", "30");
    sendError(response, 429, `Too many scans running (limit ${maxConcurrentScans}). Wait for one to finish.`);
    return;
  }
  const now = new Date().toISOString();
  const record: InvestigationRecord = {
    scanId: randomUUID(),
    email: target,
    target,
    targetType,
    phoneCountryCode: targetType === "phone" ? phoneCountryCode : undefined,
    status: "queued",
    createdAt: now,
    durationMs: 0,
    selectedTools: tools,
    matchScope,
    summary: { total: 0, found: 0, notFound: 0, notChecked: 0, errors: 0 },
    results: [],
    toolExecutions: tools.map(makeExecution),
    authorizationConfirmedAt: now,
  };
  records.set(record.scanId, record);
  response.setHeader("Cache-Control", "no-store");
  const run = executeInvestigation(record).catch((error: unknown) => {
    console.error("ClearTrace investigation failed:", error);
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    record.errorMessage = "The local investigation could not be completed.";
  });
  if (request.query.wait === "true") {
    // Synchronous mode for scripts: hold the connection until the scan finishes.
    request.setTimeout(0);
    void run.then(() => { if (!response.writableEnded) response.status(200).json(record); });
    return;
  }
  response.status(202).json(record);
});

app.get("/api/investigations/:scanId/report.txt", (request: Request, response: Response) => {
  const record = records.get(request.params.scanId);
  if (!record) { sendError(response, 404, "Investigation not found."); return; }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="cleartrace-${record.scanId.slice(0, 8)}.txt"`);
  response.send(buildTextReport(record));
});

app.get("/api/investigations/:scanId/report.json", (request: Request, response: Response) => {
  const record = records.get(request.params.scanId);
  if (!record) { sendError(response, 404, "Investigation not found."); return; }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Disposition", `attachment; filename="cleartrace-${record.scanId.slice(0, 8)}.json"`);
  response.json(record);
});

app.get("/api/investigations/:scanId", (request: Request, response: Response) => {
  const record = records.get(request.params.scanId);
  if (!record) {
    sendError(response, 404, "Investigation not found. Local history is cleared when the backend restarts.");
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  response.json(record);
});

app.post("/api/investigations/:scanId/overview", async (request: Request, response: Response) => {
  const record = records.get(request.params.scanId);
  if (!record) {
    sendError(response, 404, "Investigation not found.");
    return;
  }
  if (record.status !== "completed" && record.status !== "partial") {
    sendError(response, 409, "An AI overview is available only after a scan completes.");
    return;
  }
  if (!record.authorizationConfirmedAt) {
    sendError(response, 403, "The investigation has no authorization confirmation.");
    return;
  }
  const body = request.body as {
    authorizedConfirmed?: unknown;
    privacyAcknowledged?: unknown;
  } | undefined;
  if (body?.authorizedConfirmed !== true || body.privacyAcknowledged !== true) {
    sendError(response, 403, "Confirm authorization and acknowledge the Gemini data transfer.");
    return;
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    sendError(response, 503, "Gemini is not configured. Set GEMINI_API_KEY in .env and restart the backend.");
    return;
  }
  const cachedOverview = aiOverviewCache.get(record.scanId);
  if (cachedOverview) {
    response.setHeader("Cache-Control", "no-store");
    response.json({ overview: cachedOverview, model: GEMINI_MODEL, cached: true });
    return;
  }

  let generation = aiOverviewInFlight.get(record.scanId);
  if (!generation) {
    generation = generateAiOverview(record, process.env.GEMINI_API_KEY.trim());
    aiOverviewInFlight.set(record.scanId, generation);
  }
  try {
    const overview = await generation;
    aiOverviewCache.set(record.scanId, overview);
    response.setHeader("Cache-Control", "no-store");
    response.json({ overview, model: GEMINI_MODEL, cached: false });
  } catch (error) {
    console.error("ClearTrace Gemini overview failed:", error);
    sendError(response, 502, "Gemini could not generate an overview. Check the API key and try again.");
  } finally {
    if (aiOverviewInFlight.get(record.scanId) === generation) {
      aiOverviewInFlight.delete(record.scanId);
    }
  }
});

app.post("/api/investigations/:scanId/cancel", (request: Request, response: Response) => {
  const record = records.get(request.params.scanId);
  if (!record) {
    sendError(response, 404, "Investigation not found.");
    return;
  }
  if (record.status !== "queued" && record.status !== "running") {
    response.status(200).json({ cancelled: false, status: record.status });
    return;
  }
  for (const controller of controllers.get(record.scanId) || []) controller.abort();
  record.status = "cancelled";
  response.status(202).json({ cancelled: true });
});

app.use("/api", (_request: Request, response: Response) => {
  sendError(response, 404, "Unknown API endpoint.");
});

// Body-parser errors (bad JSON, payload too large) previously came back as HTML pages.
app.use((error: unknown, _request: Request, response: Response, next: (e?: unknown) => void) => {
  if (response.headersSent) { next(error); return; }
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 413) { sendError(response, status, status === 413 ? "Request body too large." : "Invalid JSON body."); return; }
  console.error("ClearTrace server error:", error);
  sendError(response, 500, "Unexpected server error.");
});

const port = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.use(express.static(join(process.cwd(), "dist"), { index: false }));
  app.get("*", (_request, response) => response.sendFile(join(process.cwd(), "dist", "index.html")));
} else {
  const vite = await createViteServer({
    configFile: join(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const host = process.env.HOST?.trim() || "127.0.0.1";
if (host !== "127.0.0.1" && host !== "localhost" && !apiKey) {
  console.error("Refusing to listen on a non-loopback HOST without CLEARTRACE_API_KEY set.");
  process.exit(1);
}
const httpServer = app.listen(port, host, () => {
  console.log(`ClearTrace ready at http://${host}:${port}${apiKey ? " (API key required for /api/v1)" : ""}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  httpServer.close((error) => {
    if (error) {
      console.error(`Could not close the HTTP server after ${signal}:`, error);
      process.exitCode = 1;
    }
    void closeHibpBrowser().catch((closeError) => {
      console.error("Could not close the HIBP browser:", closeError);
      process.exitCode = 1;
    });
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
