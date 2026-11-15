import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RefreshCw,
  Search,
  Wrench,
} from 'lucide-react';
import { INVESTIGATION_TOOLS } from '@/src/data/tools';
import {
  formatDuration,
  formatTimestamp,
  getInvestigationTarget,
  validateEmailAddress,
} from '@/src/lib/api';
import {
  AppRoute,
  InvestigationRecord,
  ScanOverallStatus,
  ToolAvailabilityStatus,
  ToolId,
} from '@/src/types/investigation';
import { ActivityChart } from '@/src/components/investigation/ActivityChart';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Skeleton } from '@/src/components/ui/Skeleton';
import {
  ScanStatusBadge,
  ToolAvailabilityIndicator,
} from '@/src/components/ui/StatusIndicator';

interface DashboardPageProps {
  investigations: InvestigationRecord[];
  isLoading: boolean;
  toolAvailability: Record<ToolId, ToolAvailabilityStatus>;
  onRefresh: () => void;
  onStartQuickScan: (email: string) => void;
  onOpenInvestigation: (scanId: string) => void;
  onNavigate: (route: AppRoute) => void;
}

export function DashboardPage({
  investigations,
  isLoading,
  toolAvailability,
  onRefresh,
  onStartQuickScan,
  onOpenInvestigation,
  onNavigate,
}: DashboardPageProps) {
  const [quickEmail, setQuickEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScanOverallStatus>(
    'all'
  );

  const quickValidation = validateEmailAddress(quickEmail);

  const stats = useMemo(() => {
    const total = investigations.length;
    const finished = investigations.filter(
      (i) => i.status !== 'running' && i.status !== 'queued' && i.durationMs > 0
    );
    const avgDurationMs =
      finished.length > 0
        ? Math.round(
            finished.reduce((acc, i) => acc + i.durationMs, 0) / finished.length
          )
        : 0;
    const totalFound = investigations.reduce(
      (acc, i) => acc + i.summary.found,
      0
    );
    const readyTools = INVESTIGATION_TOOLS.filter((t) => {
      const avail = toolAvailability[t.id] || t.defaultAvailability;
      return avail !== 'unavailable';
    }).length;

    return {
      total,
      avgDurationMs,
      totalFound,
      readyTools,
    };
  }, [investigations, toolAvailability]);

  const filteredInvestigations = useMemo(() => {
    return investigations.filter((inv) => {
      const matchesStatus =
        statusFilter === 'all' || inv.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        getInvestigationTarget(inv).toLowerCase().includes(q) ||
        inv.scanId.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [investigations, statusFilter, searchQuery]);

  const kpiCards = [
    {
      label: 'Total Investigations',
      value: stats.total,
      sub: 'Recorded in workspace',
      valueClass: 'text-slate-900',
      iconWrap: 'bg-red-50 border-red-200 text-[#DC2626]',
      Icon: Layers,
    },
    {
      label: 'Found Signals',
      value: stats.totalFound,
      sub: 'Platforms reported (unverified)',
      valueClass: 'text-emerald-700',
      iconWrap: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      Icon: CheckCircle2,
    },
    {
      label: 'Average Scan Time',
      value: stats.avgDurationMs > 0 ? formatDuration(stats.avgDurationMs) : '—',
      sub: 'Per completed scan',
      valueClass: 'text-slate-900 font-mono',
      iconWrap: 'bg-orange-50 border-orange-200 text-orange-600',
      Icon: Clock,
    },
    {
      label: 'Active Engines',
      value: `${stats.readyTools} / ${INVESTIGATION_TOOLS.length}`,
      sub: 'Live engine status',
      valueClass: 'text-[#DC2626]',
      iconWrap: 'bg-rose-50 border-rose-200 text-rose-600',
      Icon: Wrench,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Investigation Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor authorized scans, engine availability, and normalized
            findings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </Button>
          <Button onClick={() => onNavigate('investigate')}>
            <Play className="w-4 h-4" />
            <span>New Investigation</span>
          </Button>
        </div>
      </div>

      {/* 4-Column Overview KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, sub, valueClass, iconWrap, Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: i * 0.04 }}
          >
            <Card className="p-5 flex items-start justify-between gap-3 h-full">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p
                  className={`mt-2 font-display text-2xl font-bold tabular-nums ${valueClass}`}
                >
                  {value}
                </p>
                <p className="mt-1 text-xs text-slate-400">{sub}</p>
              </div>
              <span
                className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconWrap}`}
              >
                <Icon className="w-4 h-4" />
              </span>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Start + Activity Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-5 p-6 flex flex-col justify-between gap-4 bg-gradient-to-br from-rose-50/60 via-white to-white border-rose-200/80">
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-slate-900">
              Quick-Start Investigation
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enter an authorized email address to configure and launch a
              multi-engine digital footprint scan.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quickValidation.valid) {
                onStartQuickScan(quickEmail.trim());
              }
            }}
            className="space-y-3"
          >
            <label htmlFor="quick-email" className="sr-only">
              Authorized email address
            </label>
            <input
              id="quick-email"
              type="email"
              value={quickEmail}
              onChange={(e) => setQuickEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full h-10 px-3.5 rounded-lg border border-slate-200 bg-white font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
            />
            <div className="flex items-center justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!quickValidation.valid}
              >
                <span>Configure & Run</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-7 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#DC2626]" />
              <h2 className="text-base font-semibold text-slate-900">
                Activity Overview
              </h2>
            </div>
            <span className="text-xs text-slate-400">Last 14 days</span>
          </div>
          <ActivityChart investigations={investigations} />
        </Card>
      </div>

      {/* Recent Investigations Table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Recent Investigations
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a scan to review formatted platform results and check statuses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by email or scan ID..."
                className="h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'partial', label: 'Warnings' },
                  { id: 'failed', label: 'Failed' },
                  { id: 'cancelled', label: 'Cancelled' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-4 py-2"
              >
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
            ))}
          </div>
        ) : filteredInvestigations.length === 0 ? (
          <div className="px-6 py-14 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-900">
              {investigations.length === 0
                ? 'No investigations recorded yet'
                : 'No investigations match your filters'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {investigations.length === 0
                ? 'Launch your first authorized email investigation to inspect platform exposure and structured findings.'
                : 'Clear the search input or switch status filters to view all investigations.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button size="sm" onClick={() => onNavigate('investigate')}>
                Start Investigation
              </Button>
              {investigations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                >
                  Reset Filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-6">Authorized Email</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Tools</th>
                  <th className="py-3 px-4 text-right">Breakdown</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredInvestigations.map((inv) => (
                  <tr
                    key={inv.scanId}
                    onClick={() => onOpenInvestigation(inv.scanId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenInvestigation(inv.scanId);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open investigation for ${getInvestigationTarget(inv)}`}
                    className="hover:bg-rose-50/40 focus:bg-rose-50/60 focus:outline-none transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-6">
                      <div className="font-mono font-medium text-slate-900">
                        {getInvestigationTarget(inv)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {inv.scanId}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                      {formatTimestamp(inv.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {inv.selectedTools.length} selected
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap tabular-nums">
                      <span className="text-emerald-700 font-semibold">
                        {inv.summary.found} found
                      </span>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span className="text-slate-500">
                        {inv.summary.notFound} absent
                      </span>
                      {inv.summary.errors + inv.summary.notChecked > 0 && (
                        <>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <span className="text-amber-700 font-medium">
                            {inv.summary.errors + inv.summary.notChecked} alerts
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDuration(inv.durationMs)}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <ScanStatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Tool Availability Indicators */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Engine Availability
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time readiness status for each supported investigation
              engine.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('tools')}
          >
            View Tool Details
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {INVESTIGATION_TOOLS.map((tool) => {
            const availability =
              toolAvailability[tool.id] || tool.defaultAvailability;
            return (
              <div
                key={tool.id}
                className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:border-rose-200 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {tool.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{tool.scope}</p>
                </div>
                <ToolAvailabilityIndicator availability={availability} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
