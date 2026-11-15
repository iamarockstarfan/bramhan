import assert from "node:assert/strict";
import test from "node:test";
import { createSafeOverviewInput } from "@/src/server/aiOverview";
import type { InvestigationRecord } from "@/src/types/investigation";

function makeRecord(resultCount = 1): InvestigationRecord {
  const results = Array.from({ length: resultCount }, (_, index) => ({
    id: `result-${index}`,
    tool: "ghunt" as const,
    platform: index === 0
      ? "Google owner@example.test https://accounts.google.com/profile"
      : `Platform ${index}`,
    category: "Productivity & Cloud" as const,
    status: "found" as const,
    url: "https://private.example.test/profile",
    details: {
      email: "owner@example.test",
      profileId: "private-profile-id",
      profileImageUrl: "https://images.example.test/photo",
    },
    duration: 123,
  }));
  return {
    scanId: "private-scan-id",
    email: "owner@example.test",
    status: "completed",
    createdAt: "2026-11-14T10:00:00.000Z",
    durationMs: 123,
    selectedTools: ["ghunt"],
    summary: { total: resultCount, found: resultCount, notFound: 0, notChecked: 0, errors: 0 },
    results,
    toolExecutions: [],
    authorizationConfirmedAt: "2026-11-14T10:00:00.000Z",
  };
}

test("AI overview input omits emails, URLs, IDs, and detailed profile fields", () => {
  const input = createSafeOverviewInput(makeRecord());
  const serialized = JSON.stringify(input);

  assert.equal(input.findings[0].platform, "Google [email omitted] [link omitted]");
  assert.equal(input.findings[0].status, "found");
  assert.equal(input.counts.found, 1);
  assert.doesNotMatch(serialized, /owner@example\.test|https?:\/\/|private-profile-id|private-scan-id/);
  assert.doesNotMatch(serialized, /profileImageUrl|authorizationConfirmedAt/);
});

test("AI overview input bounds the number of platform labels sent", () => {
  const input = createSafeOverviewInput(makeRecord(105));

  assert.equal(input.findings.length, 100);
  assert.equal(input.omittedFindings, 5);
});
