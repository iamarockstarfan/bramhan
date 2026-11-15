# ClearTrace

ClearTrace is a local-first interface for checking an email address or phone number you own or are explicitly authorized to assess. Scanner results are unverified signals, not proof of account ownership.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Express API and Vite frontend run together on loopback; the scan API is not exposed on the LAN.

Build and run the production version:

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

## Local scanners

The backend detects MailAccess, Holehe, and Maigret in this project's `.venv` or in `~/Documents/email-footprint-checker/.venv`. It detects pipx GHunt in `~/.local/bin`, and scans `PATH` for PhoneInfoga, Ignorant, and DetectDee. If your commands are elsewhere, set their executable paths in `.env`.

| Environment variable | Purpose |
| --- | --- |
| `PORT` | Local app port; defaults to `5173` |
| `MAILACCESS_BIN` | Optional MailAccess executable path |
| `ENABLE_ACCOUNT_DISCOVERY` | Enable MailAccess account discovery (default `true`; set `false` to disable) |
| `HOLEHE_BIN` | Optional Holehe executable path |
| `MAIGRET_BIN` | Optional Maigret executable path |
| `GHUNT_BIN` | Optional GHunt executable path |
| `SHERLOCK_BIN` | Optional Sherlock executable path |
| `BLACKBIRD_BIN` | Optional Blackbird executable path, or Python executable when using `BLACKBIRD_SCRIPT` |
| `BLACKBIRD_SCRIPT` | Optional path to a source checkout's `blackbird.py`; runs it with `BLACKBIRD_BIN` |
| `PHONEINFOGA_BIN` | Optional PhoneInfoga executable path |
| `IGNORANT_BIN` | Optional Ignorant executable path |
| `DETECTDEE_BIN` | Optional DetectDee executable path |
| `DETECTDEE_DATA` | Optional path to DetectDee's `data.json` site data |
| `HIBP_BROWSER_BIN` | Optional Microsoft Edge executable path for the HIBP browser script; auto-detected if blank |
| `SCAN_TIMEOUT_MS` | Default per-tool timeout in ms (default `240000`). MailAccess and Maigret always get at least 5 minutes |
| `MAILACCESS_BUDGET_SEC` | MailAccess `--budget` in seconds (default `120`; was hard-coded to 15) |
| `MAILACCESS_TIMEOUT_MS` | Hard kill time for MailAccess (default `300000`). Findings printed before the kill are kept |
| `MAILACCESS_LOCAL_ONLY` | Set `false` to drop the `--local-only` flag |
| `MAIGRET_TOP_SITES` | Sites Maigret checks (default `200`; was 50) |
| `CLEARTRACE_API_KEY` | If set, `/api/v1/*` requires `Authorization: Bearer <key>` or `X-API-Key` |
| `HOST` | Bind address (default `127.0.0.1`). Non-loopback requires `CLEARTRACE_API_KEY` |
| `MAX_CONCURRENT_SCANS` | Simultaneous scans allowed (default `50`) |
| `PERSIST_HISTORY` | `true` saves scan history (including target email addresses or phone numbers) to `.cleartrace/history.json`; off by default |
| `MAX_HISTORY` | Scans kept in memory (default `200`, oldest finished scans are dropped) |
| `GEMINI_MODEL` | Model for the optional AI overview (default `gemini-flash-latest`) |
| `GEMINI_API_KEY` | Optional Google AI Studio key for explicitly requested AI overviews |

### Optional AI overview

To enable the overview button, create a Gemini API key in Google AI Studio and put it in the local `.env` file:

```env
GEMINI_API_KEY=your-key-here
```

Restart `npm run dev` after adding the key. Keep it private; the browser never receives it. An overview is generated only after you click the button and confirm authorization and data sharing. The backend sends Gemini platform/tool names, categories, result statuses, and aggregate counts only. It excludes the target email or phone number, profile URLs, account IDs, images, and detailed metadata. Google processes the submitted summary under its API terms. The overview is cached for that scan in server memory and is cleared when the backend restarts.

Core scanner commands use argument arrays (not a shell). MailAccess runs a 15-second investigation budget, Holehe keeps blocked/rate-limited services in the inconclusive state, and Maigret checks up to 50 sites using the email's local part as an approximate username. GHunt requires its own local session. Sherlock (`sherlock <username>`) and Blackbird (`blackbird -e <email>`) are optional. For a Blackbird source checkout without a console executable, set `BLACKBIRD_BIN` to the checkout's venv Python and `BLACKBIRD_SCRIPT` to its `blackbird.py`. Sherlock matches are username guesses (low confidence). Blackbird's output differs between versions, so its parser is best-effort and has only been tested on sample output.

Each CLI may contact third-party services and maintain its own cache or reports. ClearTrace keeps scan history in process memory only unless you set `PERSIST_HISTORY=true`. Results may be incomplete, rate-limited, or incorrect.

The investigation form supports email and phone-number scans. Phone scans require a country calling code (for example `+1`) and the national number. PhoneInfoga and Ignorant require phone input; DetectDee supports both input types. These optional scanners must be installed locally and available on `PATH` or configured in `.env`. DetectDee also requires its `data.json` site-data file.

Email investigations default to **Email-linked only**. This mode limits MailAccess to email-focused modules and disables its username/local-part pivot modules; it also excludes Maigret and Sherlock. Choose **Email + username** for MailAccess's full module set and to include selected Maigret/Sherlock checks; username matches are guesses and may belong to someone else. The selected scope is saved with each scan.

The investigation form has a separate file-upload tab for up to 10,000 unique authorized email addresses. Put one address per line or separate them with commas or spaces. After confirming ownership of every listed address, the tab starts with five GHunt scans and adapts up to 50 based on scan duration and rate-limit/errors. It waits for all scans to finish and shows the results together. Failed scans are included with an error message rather than omitted. A combined `.txt` report is generated when finished (with a button to download it again), and each scan is also stored in history.

Result cards can display profile photos when a scanner returns a public HTTPS image URL. ClearTrace does not perform additional lookups to find photos, and image details remain hidden until you open a result.

Found-result cards load platform icons from Google's favicon service using the platform domain only; the email address is not included in that icon request. When expanded, result details may load an HTTPS profile-photo URL returned by a scanner. The image host receives the browser request without a referrer; ClearTrace does not search for additional images.

## Programmatic API (one target per request)

`/api/v1/*` mirrors the UI API for scripts. Each request investigates **one** email address or phone number you own or are authorized to assess.

```bash
curl -X POST "http://127.0.0.1:5173/api/v1/investigations?wait=true" \
  -H "Authorization: Bearer $CLEARTRACE_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","tools":["mailaccess","holehe","ghunt"],"authorizedConfirmed":true}'
```

Without `?wait=true` the call returns `202` immediately; poll `GET /api/v1/investigations/:id`. Reports: `GET /api/v1/investigations/:id/report.txt` and `/report.json`.

### Have I Been Pwned breach lookup

ClearTrace can check an authorized email address on the HIBP website using a local Microsoft Edge browser script. No HIBP API key or subscription API is used. Edge is detected automatically; if it is installed in a non-standard location, set its full path in `.env` and restart ClearTrace:

```env
HIBP_BROWSER_BIN=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

Select **Have I Been Pwned** from the investigation engines to include the check. HIBP receives the email address only when this engine is selected. The script reuses a local Edge window; if HIBP presents a verification prompt, complete it in that window. Results link to their HIBP breach pages.

Each result means that the exact email address was found in that breach's HIBP record. The listed data types describe the breach overall; they do not confirm which fields were exposed for this specific email.

## API used by the UI

- `GET /api/tools/health` — local scanner availability.
- `GET /api/investigations` — scans held in this server process.
- `POST /api/investigations` — starts a scan. Requires a valid email or phone target, compatible tool IDs, and `authorizedConfirmed: true`.
- `GET /api/investigations/:scanId` — scan status and normalized results.
- `POST /api/investigations/:scanId/cancel` — stop active local scanner processes.
- `POST /api/investigations/:scanId/overview` — optionally asks Gemini for an overview of redacted platform/status data after explicit consent.

Only check addresses you own or have explicit permission to assess. Do not use the app for bulk enumeration, targeting, impersonation, harassment, or profiling.
