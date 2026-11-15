# Bundled scanner sources

These are source-only copies of scanner tools used by ClearTrace, included so
the project can be reviewed as one folder. They are not installed environments
and are not executed directly by ClearTrace. Python environments, Node
dependencies, browser binaries, and build output are intentionally excluded.

| Tool | Source/version | License |
| --- | --- | --- |
| Blackbird | Local source checkout | License notices retained in `.github/LICENSE` and `docs/LICENSE` |
| GHunt | `mxrch/GHunt` upstream source | GNU AGPL-3.0 |
| Holehe | `megadose/holehe` upstream source | GNU GPL-3.0 |
| Maigret | `soxoj/maigret` upstream source | MIT |
| MailAccess | Installed package source, version 0.19.3 | MIT |
| Sherlock | `sherlock-project/sherlock` upstream source | MIT |

Each source directory retains its upstream license and notices. The Blackbird
checkout contains both CC BY-NC-SA 4.0 and GPL-3.0 license documents in their
original locations; preserve both when sharing this source bundle.

HIBP is integrated through ClearTrace's local browser script in
`src/server/hibpBrowser.ts`; no HIBP API client is bundled.
