import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  hibpLookupToToolRunResult,
  parseBlackbirdOutput,
  parseGHuntOutput,
  parseHoleheOutput,
  parseDetectDeeOutput,
  parseIgnorantOutput,
  parseMailAccessOutput,
  parseMaigretOutput,
  parsePhoneInfogaOutput,
  parseSherlockOutput,
  mailAccessExecutionConfig,
  runScanner,
  scannerAvailability,
} from "@/src/server/scanner";
import { parseHibpBreachCards } from "@/src/server/hibpBrowser";
import { isEmailLinkedResult } from "@/src/types/investigation";

test("Blackbird source script is launched through its configured Python executable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cleartrace-blackbird-test-"));
  const script = join(directory, "blackbird.py");
  const capturedArgs = join(directory, "args.json");
  const originalBin = process.env.BLACKBIRD_BIN;
  const originalScript = process.env.BLACKBIRD_SCRIPT;
  const originalCapture = process.env.BLACKBIRD_TEST_CAPTURE;
  for (const folder of ["assets", "data", "src"]) {
    await mkdir(join(directory, folder), { recursive: true });
  }
  await writeFile(
    script,
    'require("node:fs").writeFileSync(process.env.BLACKBIRD_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));',
  );
  process.env.BLACKBIRD_BIN = process.execPath;
  process.env.BLACKBIRD_SCRIPT = script;
  process.env.BLACKBIRD_TEST_CAPTURE = capturedArgs;

  try {
    assert.equal((await scannerAvailability()).blackbird, "optional");
    await runScanner("blackbird", "owner@example.test");
    assert.deepEqual(JSON.parse(await readFile(capturedArgs, "utf8")), [
      "-e",
      "owner@example.test",
      "--json",
      "--no-update",
    ]);

    process.env.BLACKBIRD_SCRIPT = join(directory, "missing.py");
    assert.equal((await scannerAvailability()).blackbird, "unavailable");
  } finally {
    if (originalBin === undefined) delete process.env.BLACKBIRD_BIN;
    else process.env.BLACKBIRD_BIN = originalBin;
    if (originalScript === undefined) delete process.env.BLACKBIRD_SCRIPT;
    else process.env.BLACKBIRD_SCRIPT = originalScript;
    if (originalCapture === undefined) delete process.env.BLACKBIRD_TEST_CAPTURE;
    else process.env.BLACKBIRD_TEST_CAPTURE = originalCapture;
    await rm(directory, { recursive: true, force: true });
  }
});

test("HIBP browser results parse breach cards and map them into investigation results", () => {
  const breaches = parseHibpBreachCards([{
    title: "Example Breach",
    url: "https://haveibeenpwned.com/Breach/ExampleBreach",
    text: [
      "January",
      "2025",
      "Example Breach",
      "Example breach description",
      "Compromised data:",
      "Email addresses",
      "Passwords",
    ].join("\n"),
  }]);

  assert.equal(breaches.length, 1);
  assert.equal(breaches[0].breachDate, "January 2025");
  assert.deepEqual(breaches[0].dataClasses, ["Email addresses", "Passwords"]);

  const result = hibpLookupToToolRunResult({ status: "found", breaches }, 42);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].tool, "hibp");
  assert.equal(result.results[0].platform, "Example Breach");
  assert.equal(result.results[0].category, "Data Breaches");
  assert.equal(result.results[0].status, "found");
  assert.equal(result.results[0].url, "https://haveibeenpwned.com/Breach/ExampleBreach");
  assert.equal(result.results[0].details.breachDate, "January 2025");
  assert.deepEqual(result.results[0].details.dataClasses, ["Email addresses", "Passwords"]);
  assert.equal(result.results[0].details.description, "Example breach description");
  assert.match(String(result.results[0].details.dataScopeNote), /not confirmed fields for this email/);
  assert.equal(result.results[0].duration, 42);

  const notFound = hibpLookupToToolRunResult({
    status: "not_found",
    message: "HIBP did not find this exact email address in its breach records.",
  }, 7);
  assert.equal(notFound.results[0].status, "not_found");
  assert.equal(notFound.results[0].details.message, "HIBP did not find this exact email address in its breach records.");
});

test("HIBP availability follows the configured local browser executable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cleartrace-hibp-test-"));
  const browser = join(directory, "msedge.exe");
  const originalBrowser = process.env.HIBP_BROWSER_BIN;
  await writeFile(browser, "");

  try {
    process.env.HIBP_BROWSER_BIN = browser;
    assert.equal((await scannerAvailability()).hibp, "ready");

    process.env.HIBP_BROWSER_BIN = join(directory, "missing.exe");
    assert.equal((await scannerAvailability()).hibp, "unavailable");
  } finally {
    if (originalBrowser === undefined) delete process.env.HIBP_BROWSER_BIN;
    else process.env.HIBP_BROWSER_BIN = originalBrowser;
    await rm(directory, { recursive: true, force: true });
  }
});

test("email-only result view hides username-derived findings but keeps email checks", () => {
  const usernameHit = {
    tool: "mailaccess",
    platform: "Example",
    status: "found",
    details: { module: "username_platforms" },
    duration: 1,
  } as const;
  const emailHit = {
    tool: "mailaccess",
    platform: "Example",
    status: "found",
    details: { module: "account_discovery" },
    duration: 1,
  } as const;

  assert.equal(isEmailLinkedResult(usernameHit, "email"), false);
  assert.equal(isEmailLinkedResult(emailHit, "email"), true);
  assert.equal(isEmailLinkedResult(usernameHit, "email_and_username"), true);
});

test("MailAccess email-only scope excludes username and local-part modules", () => {
  const originalAccountDiscovery = process.env.ENABLE_ACCOUNT_DISCOVERY;
  process.env.ENABLE_ACCOUNT_DISCOVERY = "true";
  try {
    const emailOnly = mailAccessExecutionConfig("owner@example.test", "email");
    const modules = emailOnly.args[emailOnly.args.indexOf("--modules") + 1];

    assert.ok(emailOnly.args.includes("--modules"));
    assert.match(modules, /account_discovery/);
    assert.doesNotMatch(modules, /username_platforms|username_pivot|social_links|hackernews/);
    assert.equal(emailOnly.env.ENABLE_ACCOUNT_DISCOVERY, "true");
    assert.equal(emailOnly.env.ENABLE_USERNAME_PLATFORMS, "false");
    assert.equal(emailOnly.env.ENABLE_USERNAME_PIVOT, "false");
    assert.equal(emailOnly.env.ENABLE_PERMUTATION_DISCOVERY, "false");

    const emailAndUsername = mailAccessExecutionConfig("owner@example.test", "email_and_username");
    assert.equal(emailAndUsername.args.includes("--modules"), false);
    assert.deepEqual(emailAndUsername.env, { ENABLE_ACCOUNT_DISCOVERY: "true" });

    process.env.ENABLE_ACCOUNT_DISCOVERY = "false";
    assert.equal(
      mailAccessExecutionConfig("owner@example.test", "email").env.ENABLE_ACCOUNT_DISCOVERY,
      "false",
    );
  } finally {
    if (originalAccountDiscovery === undefined) delete process.env.ENABLE_ACCOUNT_DISCOVERY;
    else process.env.ENABLE_ACCOUNT_DISCOVERY = originalAccountDiscovery;
  }
});

test("MailAccess JSONL keeps its result URL and completion summary", () => {
  const output = [
    JSON.stringify({ type: "start" }),
    JSON.stringify({
      module: "github",
      platform: "GitHub",
      profile_url: "https://github.com/test-user",
      confidence: "high",
      severity: "info",
      metadata: { username: "test-user" },
    }),
    JSON.stringify({
      type: "complete",
      score: 24,
      risk: "low",
      credential_risk_score: 10,
      credential_risk_band: "low",
      total_findings: 1,
    }),
  ].join("\n");

  const result = parseMailAccessOutput(output, 120);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, "found");
  assert.equal(result.results[0].url, "https://github.com/test-user");
  assert.equal(result.results[0].details.reportSummary && (result.results[0].details.reportSummary as Record<string, unknown>).totalFindings, 1);
});

test("Holehe distinguishes found, absent, and blocked checks", () => {
  const result = parseHoleheOutput([
    "[+] github.com",
    "[-] reddit.com",
    "[x] example.test",
  ].join("\n"), 300);

  assert.deepEqual(result.results.map((item) => item.status), [
    "found",
    "not_found",
    "not_checked",
  ]);
  assert.match(result.results[2].errorMessage || "", /blocked or rate-limited/i);
});

test("Maigret preserves profile URLs and returned public metadata", async () => {
  const reportDir = await mkdtemp(join(tmpdir(), "cleartrace-maigret-test-"));
  try {
    await writeFile(join(reportDir, "report_testuser_simple.json"), JSON.stringify({
      GitHub: {
        username: "testuser",
        url_user: "https://github.com/testuser",
        status: { status: "Claimed", url: "https://github.com/testuser" },
        tags: ["developer"],
        keywords: ["sample"],
        ids_data: { id: "123" },
      },
    }), "utf8");

    const result = await parseMaigretOutput(reportDir, "testuser@example.test", 450);
    assert.equal(result.results[0].status, "found");
    assert.equal(result.results[0].url, "https://github.com/testuser");
    assert.deepEqual(result.results[0].details.tags, ["developer"]);
    assert.equal(result.results[0].details.matchStatus, "Claimed");
  } finally {
    await rm(reportDir, { recursive: true, force: true });
  }
});

test("GHunt formats account, photo, Maps, Play Games, and Calendar output", () => {
  const output = [
    "Google Account data",
    "[+] Custom profile picture !",
    "=> https://lh3.googleusercontent.com/profile",
    "Last profile edit : 2026/01/01 00:00:00 (UTC)",
    "Email : owner@example.test",
    "Gaia ID : 123456",
    "User types :",
    "- GOOGLE_USER [italic](A Google user)[/italic]",
    "📞 Google Chat Extended Data",
    "Entity Type : CONSUMER",
    "Customer ID : Not found.",
    "🌐 Google Plus Extended Data",
    "Entreprise User : False",
    "[+] Activated Google services :",
    "- Gmail",
    "- Drive",
    "🎮 Play Games data",
    "[+] Found player profile !",
    "Username : Test Player",
    "Player ID : 987",
    "Avatar : https://lh3.googleusercontent.com/avatar",
    "[+] Profile is public !",
    "[+] Played to 12 games",
    "[+] Got 3 achievements",
    "[+] Last played game : Chess (2026-01-01 UTC)",
    "🗺️ Maps data",
    "Profile page : https://www.google.com/maps/contrib/123456/reviews",
    "[Statistics]",
    "Reviews : 2",
    "Ratings : 3",
    "Photos : 4",
    "🗓️ Calendar data",
    "[+] Public Google Calendar found !",
    "Calendar ID : owner@example.test",
    "[+] Calendar Summary : Personal",
    "Calendar Timezone : UTC",
    "[+] 1 event dumped ! Showing the last 1 one...",
    "+----------------+---------------------+----------+",
    "| Name           | Datetime (UTC)      | Duration |",
    "+----------------+---------------------+----------+",
    "| Sample event   | 2026/01/01 10:00:00 | 1 hour   |",
    "+----------------+---------------------+----------+",
  ].join("\n");

  const result = parseGHuntOutput(output, 600);
  const item = result.results[0];
  assert.equal(item.status, "found");
  assert.equal(item.url, "https://www.google.com/maps/contrib/123456/reviews");
  assert.equal(item.details.profileImageUrl, "https://lh3.googleusercontent.com/profile");
  assert.deepEqual(item.details.activatedServices, ["Gmail", "Drive"]);
  assert.deepEqual(item.details.userTypes, ["GOOGLE_USER"]);
  assert.equal(item.details.mapsStatus, "available");
  assert.deepEqual(item.details.mapsContributorStats, {
    reviews: 2,
    ratings: 3,
    photos: 4,
  });
  assert.equal((item.details.playGames as Record<string, unknown>).username, "Test Player");
  assert.equal((item.details.calendar as Record<string, unknown>).eventsDumped, 1);
  assert.deepEqual(
    (item.details.calendar as Record<string, unknown>).recentEvents,
    [{ name: "Sample event", dateTimeUtc: "2026/01/01 10:00:00", duration: "1 hour" }],
  );
});

test("GHunt represents a missing account as not found", () => {
  const result = parseGHuntOutput("[-] The target wasn't found.", 45);
  assert.equal(result.results[0].status, "not_found");
  assert.equal(result.results[0].duration, 45);
});

test("MailAccess keeps findings from a run that timed out before the completion row", () => {
  const output = [
    JSON.stringify({ type: "start" }),
    JSON.stringify({ type: "progress", done: 10 }),
    JSON.stringify({ platform: "GitHub", profile_url: "https://github.com/x", confidence: "high" }),
    '{"platform": "Broken',
  ].join("\n");
  const result = parseMailAccessOutput(output, 5000, { partial: true });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].platform, "GitHub");
  assert.equal(result.results[0].confidence, "high");
  assert.match(result.error || "", /time limit/i);
});

test("MailAccess with no output at all reports a clear error", () => {
  const result = parseMailAccessOutput("", 100, { partial: true });
  assert.equal(result.results[0].status, "error");
});

test("Maigret hits are low confidence and flag unreliable usernames", async () => {
  const { usernameReliability } = await import("@/src/server/scanner");
  assert.equal(usernameReliability("info").reliable, false);
  assert.equal(usernameReliability("john").reliable, false);
  assert.equal(usernameReliability("quentin.dubois87").reliable, true);
  const reportDir = await mkdtemp(join(tmpdir(), "cleartrace-maigret-conf-"));
  try {
    await writeFile(join(reportDir, "report_john_simple.json"), JSON.stringify({ GitHub: { url_user: "https://github.com/john", status: { status: "Claimed" } } }));
    const result = await parseMaigretOutput(reportDir, "john@example.com", 10);
    assert.equal(result.results[0].confidence, "low");
    assert.ok(result.results[0].details.reliabilityWarning);
  } finally {
    await rm(reportDir, { recursive: true, force: true });
  }
});

test("GHunt JSON extraction reads names, photos and sources defensively", async () => {
  const { extractGHuntJson } = await import("@/src/server/scanner");
  const extras = extractGHuntJson({ PROFILE_CONTAINER: { profile: {
    personId: "123",
    names: { PROFILE: { fullname: "Jane Doe" } },
    profilePhotos: { PROFILE: { url: "https://lh3.googleusercontent.com/a/abc" } },
    sourceIds: { PROFILE: {} },
  } } });
  assert.equal(extras.personId, "123");
  assert.deepEqual(extras.names, { PROFILE: "Jane Doe" });
  assert.equal(extras.profilePhotoUrl, "https://lh3.googleusercontent.com/a/abc");
  assert.deepEqual(extractGHuntJson(null), {});
});

test("platforms are categorized by name, not one fixed category per tool", async () => {
  const { categorize } = await import("@/src/server/scanner");
  assert.equal(categorize("holehe", "github.com"), "Developer & Technical");
  assert.equal(categorize("holehe", "spotify.com"), "Commerce & Media");
  assert.equal(categorize("maigret", "Dropbox"), "Productivity & Cloud");
  assert.equal(categorize("maigret", "Reddit"), "Social & Community");
  assert.equal(categorize("mailaccess", "anything"), "Email & Domain");
});

test("Maigret report is found even if its filename differs from the guess", async () => {
  const reportDir = await mkdtemp(join(tmpdir(), "cleartrace-maigret-name-"));
  try {
    await writeFile(join(reportDir, "report_some_other_name_simple.json"), JSON.stringify({ GitHub: { url_user: "https://github.com/jane" } }));
    const result = await parseMaigretOutput(reportDir, "jane+news@example.com", 5);
    assert.equal(result.results[0].platform, "GitHub");
  } finally {
    await rm(reportDir, { recursive: true, force: true });
  }
});

test("Sherlock hits parse to low-confidence username matches and dedupe", () => {
  const out = ["[*] Checking username jane.doe99 on:", "[+] GitHub: https://github.com/jane.doe99", "[+] GitHub: https://github.com/jane.doe99", "[+] Reddit: https://www.reddit.com/user/jane.doe99", "[*] Search completed with 2 results"].join("\n");
  const r = parseSherlockOutput(out, "jane.doe99", 10);
  assert.equal(r.results.length, 2);
  assert.ok(r.results.every((x) => x.confidence === "low" && x.status === "found"));
  assert.equal(parseSherlockOutput("[*] done", "jane.doe99", 1).results[0].status, "not_found");
});

test("Blackbird parses JSON rows and falls back to printed lines", () => {
  const fromJson = parseBlackbirdOutput("", [[{ name: "Spotify", url: "https://spotify.com/u/x", status: "FOUND" }, { name: "Nope", url: "https://nope.test", status: "NOT FOUND" }]], 5);
  assert.deepEqual(fromJson.results.map((x) => x.platform), ["Spotify"]);
  const fromText = parseBlackbirdOutput("[+] Reddit https://reddit.com/user/x\n[-] Foo https://foo.test", [], 5);
  assert.equal(fromText.results.length, 1);
  assert.equal(fromText.results[0].url, "https://reddit.com/user/x");
  assert.equal(parseBlackbirdOutput("nothing", [], 5).results[0].status, "not_found");
});

test("phone scanner outputs normalize into tool-specific results", () => {
  const ignorant = parseIgnorantOutput([
    "[+] Instagram",
    "[-] Facebook",
    "[x] WhatsApp",
  ].join("\n"), 12);
  assert.deepEqual(ignorant.results.map((item) => item.status), [
    "found",
    "not_found",
    "not_checked",
  ]);
  assert.ok(ignorant.results.every((item) => item.tool === "ignorant"));

  const detectDee = parseDetectDeeOutput(
    "+12025550123, Instagram, https://instagram.com/example",
    21,
  );
  assert.equal(detectDee.results[0].tool, "detectdee");
  assert.equal(detectDee.results[0].status, "found");
  assert.equal(detectDee.results[0].url, "https://instagram.com/example");

  const phoneInfoga = parsePhoneInfogaOutput("Country: US\nCarrier: Example", 34, 0);
  assert.equal(phoneInfoga.results[0].tool, "phoneinfoga");
  assert.equal(phoneInfoga.results[0].status, "found");
  assert.equal(phoneInfoga.results[0].details.report, "Country: US\nCarrier: Example");
  assert.equal(parsePhoneInfogaOutput("", 1, 1).results[0].status, "error");
});

test("phone scanners reject email-mode input before launching a command", async () => {
  for (const tool of ["phoneinfoga", "ignorant"] as const) {
    const result = await runScanner(tool, "owner@example.test", undefined, "email", "email");
    assert.equal(result.results[0].status, "error");
    assert.match(result.results[0].errorMessage || "", /requires a phone number/i);
  }
});

test("DetectDee health requires both its executable and site data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cleartrace-detectdee-test-"));
  const binary = join(directory, "DetectDee.exe");
  const data = join(directory, "data.json");
  const originalBin = process.env.DETECTDEE_BIN;
  const originalData = process.env.DETECTDEE_DATA;
  await writeFile(binary, "");
  await writeFile(data, "{}");

  try {
    process.env.DETECTDEE_BIN = binary;
    process.env.DETECTDEE_DATA = data;
    assert.equal((await scannerAvailability()).detectdee, "optional");

    await rm(data);
    assert.equal((await scannerAvailability()).detectdee, "unavailable");
  } finally {
    if (originalBin === undefined) delete process.env.DETECTDEE_BIN;
    else process.env.DETECTDEE_BIN = originalBin;
    if (originalData === undefined) delete process.env.DETECTDEE_DATA;
    else process.env.DETECTDEE_DATA = originalData;
    await rm(directory, { recursive: true, force: true });
  }
});
