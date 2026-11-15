import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { INVESTIGATION_TOOLS, TOOL_BY_ID } from '@/src/data/tools';
import {
  formatDuration,
  formatTimestamp,
  generateInvestigationOverview,
  getInvestigationTarget,
  inferCategory,
  toApiContractJson,
} from '@/src/lib/api';
import {
  InvestigationRecord,
  isEmailLinkedResult,
  PlatformResultStatus,
  ResultCategory,
  ToolAvailabilityStatus,
  ToolId,
} from '@/src/types/investigation';
import { PlatformResultCard } from '@/src/components/investigation/PlatformResultCard';
import { ToolDetailsPanel } from '@/src/components/investigation/ToolDetailsPanel';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ResultsSkeletonView } from '@/src/components/ui/Skeleton';
import { ScanStatusBadge } from '@/src/components/ui/StatusIndicator';

interface ResultsPageProps {
  investigation: InvestigationRecord | null;
  isLoading: boolean;
  error: string | null;
  toolAvailability: Record<ToolId, ToolAvailabilityStatus>;
  onRetry: () => void;
  onBackToDashboard: () => void;
  onStartNewScan: () => void;
  onNotify: (toast: {
    type: 'success' | 'error' | 'info';
    title: string;
    message?: string;
  }) => void;
}

const CATEGORIES: ResultCategory[] = [
  'Email & Domain',
  'Developer & Technical',
  'Productivity & Cloud',
  'Social & Community',
  'Commerce & Media',
  'Data Breaches',
];

export function ResultsPage({
  investigation,
  isLoading,
  error,
  toolAvailability,
  onRetry,
  onBackToDashboard,
  onStartNewScan,
  onNotify,
}: ResultsPageProps) {
  const [activeTab, setActiveTab] = useState<'categorized' | 'tools'>('categorized');
  const [statusFilter, setStatusFilter] = useState<'all' | PlatformResultStatus>(
    'found'
  );
  const [toolFilter, setToolFilter] = useState<'all' | ToolId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [overviewConsent, setOverviewConsent] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overview, setOverview] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab('categorized');
    setStatusFilter('found');
    setToolFilter('all');
    setSearchQuery('');
    setOverviewConsent(false);
    setOverviewLoading(false);
    setOverview(null);
    setOverviewError(null);
  }, [investigation?.scanId]);

  const visibleResults = useMemo(
    () => investigation?.results.filter((item) => isEmailLinkedResult(item, investigation.matchScope)) || [],
    [investigation],
  );
  const visibleSummary = useMemo(
    () => ({
      total: visibleResults.length,
      found: visibleResults.filter((item) => item.status === 'found').length,
      notFound: visibleResults.filter((item) => item.status === 'not_found').length,
      notChecked: visibleResults.filter((item) => item.status === 'not_checked').length,
      errors: visibleResults.filter((item) => item.status === 'error').length,
    }),
    [visibleResults],
  );
  const hibpResults = visibleResults.filter((item) => item.tool === 'hibp');
  const hibpMatches = hibpResults.filter((item) => item.status === 'found');
  const hibpNoMatch = hibpResults.some((item) => item.status === 'not_found');
  const hibpError = hibpResults.find((item) => item.status === 'error')?.errorMessage;
  const visibleInvestigation = useMemo(
    () => investigation ? { ...investigation, results: visibleResults, summary: visibleSummary } : null,
    [investigation, visibleResults, visibleSummary],
  );

  const filteredResults = useMemo(() => {
    if (!investigation) return [];
    const q = searchQuery.trim().toLowerCase();
    return visibleResults.filter((item) => {
      const cat = inferCategory(item);
      const matchesStatus =
        statusFilter === 'all' || item.status === statusFilter;
      const matchesTool = toolFilter === 'all' || item.tool === toolFilter;
      const matchesQuery =
        !q ||
        item.platform.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        item.tool.toLowerCase().includes(q);
      return matchesStatus && matchesTool && matchesQuery;
    });
  }, [investigation, visibleResults, statusFilter, toolFilter, searchQuery]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, typeof filteredResults> = {};
    CATEGORIES.forEach((cat) => {
      const matches = filteredResults.filter(
        (r) => inferCategory(r) === cat
      );
      if (matches.length > 0) {
        const rank = { high: 0, medium: 1, low: 2 } as const;
        groups[cat] = [...matches].sort(
          (a, b) =>
            rank[a.confidence ?? 'medium'] - rank[b.confidence ?? 'medium'] ||
            a.platform.localeCompare(b.platform)
        );
      }
    });
    return groups;
  }, [filteredResults]);

  if (isLoading) {
    return <ResultsSkeletonView />;
  }

  if (error) {
    return (
      <Card className="p-8 border-rose-200 bg-rose-50/40 space-y-4">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Failed to load investigation results
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-8">
          <Button size="sm" onClick={onRetry}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Fetch</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onBackToDashboard}>
            Return to Dashboard
          </Button>
        </div>
      </Card>
    );
  }

  if (!investigation) {
    return (
      <Card className="p-12 text-center space-y-3">
        <p className="text-base font-semibold text-slate-900">
          No investigation selected
        </p>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Select an existing investigation from the Dashboard or launch a new
          authorized scan.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button variant="outline" onClick={onBackToDashboard}>
            Go to Dashboard
          </Button>
          <Button onClick={onStartNewScan}>Start New Scan</Button>
        </div>
      </Card>
    );
  }

  const handleExportJson = () => {
    const payload = JSON.stringify(toApiContractJson(visibleInvestigation || investigation), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${investigation.scanId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify({
      type: 'success',
      title: 'Exported JSON Results',
      message: `Saved ${investigation.scanId}.json`,
    });
  };

  const handleDownloadReport = async () => {
    try {
      const response = await fetch(`/api/investigations/${encodeURIComponent(investigation.scanId)}/report.txt`);
      if (!response.ok) throw new Error(`Report request failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cleartrace-${getInvestigationTarget(investigation).replace(/[^a-z0-9@._-]/gi, '_')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify({ type: 'success', title: 'Report downloaded', message: 'Full .txt report saved.' });
    } catch (reportError) {
      onNotify({
        type: 'error',
        title: 'Report unavailable',
        message: reportError instanceof Error ? reportError.message : 'The server no longer has this scan.',
      });
    }
  };

  const handleGenerateOverview = async () => {
    if (!investigation || !overviewConsent || overviewLoading || overview) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const result = await generateInvestigationOverview(investigation.scanId, {
        authorizedConfirmed: true,
        privacyAcknowledged: true,
      });
      setOverview(result.overview);
    } catch (requestError) {
      setOverviewError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to generate the AI overview.'
      );
    } finally {
      setOverviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Summary Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 font-mono break-all">
                  {getInvestigationTarget(investigation)}
                </h1>
                <ScanStatusBadge status={investigation.status} />
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {investigation.targetType === 'phone'
                    ? 'Phone number'
                    : investigation.matchScope === 'email'
                      ? 'Email-linked only'
                      : 'Email + username'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{formatTimestamp(investigation.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{investigation.scanId}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatDuration(investigation.durationMs)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="outline" size="sm" onClick={handleDownloadReport}>
                <Download className="w-3.5 h-3.5" />
                <span>Report (.txt)</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJson}>
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </Button>
              <Button size="sm" onClick={onStartNewScan}>
                <Play className="w-3.5 h-3.5" />
                <span>New Scan</span>
              </Button>
            </div>
          </div>

          {/* 4-Column Summary Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div className="p-3.5 rounded-lg bg-rose-50/70 border border-rose-200/80">
              <p className="text-xs text-rose-900 font-medium">
                Result Records
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {visibleSummary.total}
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <p className="text-xs text-emerald-800 font-medium">
                Found Results
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
                {visibleSummary.found}
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-100 border border-slate-200">
              <p className="text-xs text-slate-600 font-medium">
                Not Found Results
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-700 tabular-nums">
                {visibleSummary.notFound}
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-800 font-medium">
                Errors / Not Checked
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-amber-800 tabular-nums">
                {visibleSummary.errors + visibleSummary.notChecked}
              </p>
            </div>
          </div>

          {visibleSummary.errors + visibleSummary.notChecked > 0 && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">
                  Inconclusive checks separated:
                </strong>{' '}
                {visibleSummary.notChecked} rate-limited/CAPTCHA checks and{' '}
                {visibleSummary.errors} check errors are flagged
                separately so they are never misread as confirmed Not Found
                results.
              </span>
            </div>
          )}
        </Card>
      </motion.div>

      {investigation.selectedTools.includes('hibp') && (
        <Card className="space-y-2 border-sky-200 bg-sky-50/50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Have I Been Pwned breach check
          </h2>
          <p className="text-sm text-slate-700">
            {hibpMatches.length > 0
              ? `This exact email address was found in ${hibpMatches.length} HIBP breach record${hibpMatches.length === 1 ? '' : 's'}.`
              : hibpNoMatch
                ? 'HIBP did not find this exact email address in its breach records.'
                : hibpError || 'HIBP did not return a result.'}
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            Each result names a breach where HIBP found this address. The listed data types and total affected-account count describe that breach overall; they do not confirm which fields were exposed for this specific email.
          </p>
          <a
            href="https://haveibeenpwned.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-sky-800 hover:underline"
          >
            Source: Have I Been Pwned
          </a>
        </Card>
      )}

      <Card className="p-5 space-y-4 border-sky-200 bg-sky-50/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-white border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900">AI overview</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Optional summary of the scan’s platform names, tool names, result statuses, and counts.
                Email addresses, profile links, IDs, images, and detailed metadata are not sent to Gemini.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleGenerateOverview}
            disabled={
              !overviewConsent ||
              overviewLoading ||
              Boolean(overview) ||
              (investigation.status !== 'completed' && investigation.status !== 'partial')
            }
          >
            {overviewLoading ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{overviewLoading ? 'Generating...' : overview ? 'Overview generated' : 'Generate overview'}</span>
          </Button>
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
          <input
            type="checkbox"
            checked={overviewConsent}
            onChange={(event) => setOverviewConsent(event.target.checked)}
            className="mt-0.5 accent-sky-600"
          />
          <span>
            I confirm I’m authorized to analyze this scan and consent to sending the redacted summary data described above to Google Gemini.
          </span>
        </label>

        {overviewError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {overviewError}
          </p>
        )}
        {overview && (
          <div aria-live="polite" className="rounded-lg border border-sky-200 bg-white p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-800">Summary</h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{overview}</p>
            <p className="text-[11px] text-slate-500">
              AI-generated and may be inaccurate. A platform signal does not prove account ownership.
            </p>
          </div>
        )}
      </Card>

      {visibleResults.some((r) => r.status === 'found' && r.confidence === 'low') && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Some hits are <strong>Possible matches</strong>: they were found by guessing a username from the
            email, so they may belong to a different person. They are listed last in each group. Email-based
            results (High / Medium confidence) are more reliable.
          </span>
        </div>
      )}

      {/* View Mode Tabs & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-fit max-w-full overflow-x-auto">
          {(
            [
              { id: 'categorized', label: 'Categorized Results', mobileLabel: 'Results' },
              { id: 'tools', label: 'Individual Tool Details', mobileLabel: 'Tools' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-[#DC2626] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.mobileLabel}</span>
            </button>
          ))}
        </div>

        {activeTab === 'categorized' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search platforms..."
                className="h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
              />
            </div>

            <select
              aria-label="Filter by result status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | PlatformResultStatus)
              }
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
            >
              <option value="found">Found only</option>
              <option value="all">All Statuses</option>
              <option value="not_found">Not Found</option>
              <option value="not_checked">Not Checked</option>
              <option value="error">Error</option>
            </select>

            <select
              aria-label="Filter by tool"
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value as 'all' | ToolId)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
            >
              <option value="all">All Tools</option>
              {INVESTIGATION_TOOLS.filter(
                (t) =>
                  investigation.selectedTools.length === 0 ||
                  investigation.selectedTools.includes(t.id)
              ).map((t) => (
                <option key={t.id} value={t.id}>
                  {TOOL_BY_ID[t.id]?.name || t.id}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'categorized' && (
        <>
          {Object.keys(groupedByCategory).length === 0 ? (
            <Card className="p-12 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                No platform cards match your active filters
              </p>
              <p className="text-xs text-slate-500">
                No found matches are available for this search. Choose another status filter to inspect non-match and inconclusive results.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('found');
                  setToolFilter('all');
                }}
              >
                Reset Filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedByCategory).map(([category, items]) => (
                <section key={category} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {category}
                    </h2>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {items.length}{' '}
                      {items.length === 1 ? 'platform' : 'platforms'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {items.map((item, idx) => (
                      <PlatformResultCard
                        key={item.id || `${item.tool}-${item.platform}-${idx}`}
                        item={item}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'tools' && (
        <ToolDetailsPanel
          investigation={visibleInvestigation}
          toolAvailability={toolAvailability}
        />
      )}

    </div>
  );
}
