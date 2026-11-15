import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const HIBP_URL = "https://haveibeenpwned.com/";
const RESULT_TIMEOUT_MS = 60_000;
const CHALLENGE_TIMEOUT_MS = 180_000;

export interface HibpBreachCard {
  title: string;
  url: string;
  breachDate?: string;
  description?: string;
  dataClasses: string[];
}

interface RawBreachCard {
  title: string;
  url: string;
  text: string;
}

export type HibpLookupResult =
  | { status: "found"; breaches: HibpBreachCard[] }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

let browser: Browser | undefined;
let page: Page | undefined;
let lookupQueue: Promise<void> = Promise.resolve();

function edgeExecutableCandidates(): string[] {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";
  return [
    join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ...(localAppData ? [join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")] : []),
  ];
}

export function hibpBrowserExecutable(): string | undefined {
  const configured = process.env.HIBP_BROWSER_BIN?.trim();
  if (configured) return existsSync(configured) ? configured : undefined;
  return edgeExecutableCandidates().find(existsSync);
}

export function parseHibpBreachCards(cards: RawBreachCard[]): HibpBreachCard[] {
  const months = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?$/i;
  const parsed = new Map<string, HibpBreachCard>();

  for (const card of cards) {
    const title = card.title.trim();
    if (!title) continue;

    const lines = card.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const titleIndex = lines.findIndex((line) => line === title);
    const labelIndex = lines.findIndex((line) => /^compromised data:$/i.test(line));
    const dataClasses = labelIndex >= 0
      ? lines.slice(labelIndex + 1).filter((line) => !/^view details$/i.test(line))
      : [];
    const followingLines = titleIndex >= 0 ? lines.slice(titleIndex + 1) : lines;
    const descriptionEnd = followingLines.findIndex((line) => /^compromised data:$/i.test(line));
    const description = followingLines
      .slice(0, descriptionEnd >= 0 ? descriptionEnd : followingLines.length)
      .filter((line) => !/^view details$/i.test(line))
      .join(" ");

    let breachDate: string | undefined;
    for (let index = 0; index < Math.max(0, titleIndex); index += 1) {
      if (months.test(lines[index]) && /^\d{4}$/.test(lines[index + 1] || "")) {
        breachDate = `${lines[index]} ${lines[index + 1]}`;
      } else if (/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}$/i.test(lines[index])) {
        breachDate = lines[index];
      }
    }

    if (!parsed.has(card.url)) {
      parsed.set(card.url, {
        title,
        url: card.url,
        ...(breachDate ? { breachDate } : {}),
        ...(description ? { description } : {}),
        dataClasses,
      });
    }
  }

  return [...parsed.values()];
}

async function waitForResult(pageToCheck: Page, timeout: number): Promise<void> {
  await pageToCheck.waitForFunction(
    () => {
      const text = document.body?.innerText.toLowerCase() || "";
      return (
        text.includes("email breach history") ||
        text.includes("no pwnage found") ||
        text.includes("not been pwned") ||
        /good news.{0,80}no pwnage/.test(text)
      );
    },
    undefined,
    { timeout },
  );
}

async function getPersistentPage(): Promise<Page> {
  if (browser?.isConnected() && page && !page.isClosed()) return page;

  const executablePath = hibpBrowserExecutable();
  if (!executablePath) {
    throw new Error("Microsoft Edge was not found. Install Edge or set HIBP_BROWSER_BIN in .env.");
  }

  const launchedBrowser = await chromium.launch({ executablePath, headless: false });
  try {
    const launchedPage = await launchedBrowser.newPage();
    launchedPage.setDefaultTimeout(20_000);
    browser = launchedBrowser;
    page = launchedPage;
    return launchedPage;
  } catch (error) {
    await launchedBrowser.close();
    throw error;
  }
}

async function extractBreachCards(resultPage: Page): Promise<RawBreachCard[]> {
  return resultPage.locator("h5").evaluateAll((headings) => {
    const cards: RawBreachCard[] = [];
    const seen = new Set<string>();

    for (const heading of headings) {
      const title = heading.textContent?.trim() || "";
      let candidate = heading.parentElement;
      let depth = 0;
      while (candidate && depth < 8) {
        const links = Array.from(candidate.querySelectorAll<HTMLAnchorElement>('a[href*="Breach/"]'));
        if (links.length === 1) {
          const url = links[0].href;
          if (url.startsWith("https://haveibeenpwned.com/") && !seen.has(url)) {
            seen.add(url);
            cards.push({ title, url, text: candidate.innerText });
          }
          break;
        }
        if (links.length > 1) break;
        candidate = candidate.parentElement;
        depth += 1;
      }
    }

    return cards;
  });
}

async function lookup(email: string, signal?: AbortSignal): Promise<HibpLookupResult> {
  if (signal?.aborted) return { status: "error", message: "HIBP check cancelled." };

  let resultPage: Page;
  try {
    resultPage = await getPersistentPage();
    signal?.throwIfAborted();
    await resultPage.goto(HIBP_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await resultPage.getByRole("textbox", { name: "Email address" }).fill(email);
    await resultPage.getByRole("button", { name: "Check", exact: true }).click();

    try {
      await waitForResult(resultPage, RESULT_TIMEOUT_MS);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
      await waitForResult(resultPage, CHALLENGE_TIMEOUT_MS);
    }
    signal?.throwIfAborted();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The HIBP browser check failed.";
    return {
      status: "error",
      message: signal?.aborted
        ? "HIBP check cancelled."
        : `HIBP did not return a result. Check the reused browser window for a verification prompt. ${message}`,
    };
  }

  const body = (await resultPage.locator("body").innerText()).toLowerCase();
  if (
    body.includes("no pwnage found") ||
    body.includes("not been pwned") ||
    /good news.{0,80}no pwnage/.test(body)
  ) {
    return { status: "not_found", message: "HIBP did not find this exact email address in its breach records." };
  }

  if (!body.includes("email breach history")) {
    return { status: "error", message: "HIBP displayed an unrecognized result page." };
  }

  const breaches = parseHibpBreachCards(await extractBreachCards(resultPage));
  if (!breaches.length) {
    return { status: "error", message: "HIBP showed a breach history, but ClearTrace could not read its breach cards." };
  }
  return { status: "found", breaches };
}

export function searchHibp(email: string, signal?: AbortSignal): Promise<HibpLookupResult> {
  const result = lookupQueue.then(() => lookup(email, signal), () => lookup(email, signal));
  lookupQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function closeHibpBrowser(): Promise<void> {
  const openBrowser = browser;
  browser = undefined;
  page = undefined;
  await openBrowser?.close();
}
