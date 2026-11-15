import React from 'react';
import { motion } from 'motion/react';
import { Loader2, Square } from 'lucide-react';
import { TOOL_BY_ID } from '@/src/data/tools';
import { formatDuration } from '@/src/lib/api';
import { ToolExecutionState, ToolRunStatus } from '@/src/types/investigation';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ToolRunBadge } from '@/src/components/ui/StatusIndicator';

interface LiveScanProgressProps {
  email: string;
  batchProgress?: string;
  batchScans?: BatchScanProgressItem[];
  scanId?: string;
  elapsedMs: number;
  executions: ToolExecutionState[];
  onCancel: () => void;
}

export interface BatchScanProgressItem {
  email: string;
  status: ToolRunStatus;
  progress: number;
  durationMs: number;
  message: string;
}

export function LiveScanProgress({
  email,
  batchProgress,
  batchScans,
  scanId,
  elapsedMs,
  executions,
  onCancel,
}: LiveScanProgressProps) {
  const finishedTools = executions.filter((item) =>
    ['completed', 'warning', 'error', 'skipped'].includes(item.status)
  ).length;
  const totalProgress = executions.length > 0
    ? Math.round((finishedTools / executions.length) * 100)
    : 0;

  const avgProgress = executions.length
    ? Math.round(executions.reduce((sum, item) => sum + (item.progress || 0), 0) / executions.length)
    : 0;
  const slowToolRunning = executions.some((item) => item.tool === 'mailaccess' && item.status === 'running');

  return (
    <div className="space-y-6">
      <Card className="p-6 border-rose-200 bg-gradient-to-br from-rose-50/55 via-white to-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#DC2626]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {batchProgress ? 'Running GHunt Batch' : 'Running Investigation Pipeline'}
                {scanId ? ` · ${scanId}` : ''}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              {batchProgress ? (
                'Processing uploaded email list'
              ) : (
                <>Investigating <span className="font-mono text-[#DC2626]">{email}</span></>
              )}
            </h2>
            {batchProgress && (
              <p className="text-xs font-medium text-rose-700">{batchProgress}</p>
            )}
            <p className="text-sm text-slate-500">
              Monitoring live engine execution and normalizing platform
              findings.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-500">Elapsed</p>
              <p className="text-base font-semibold font-mono text-slate-900 tabular-nums">
                {formatDuration(elapsedMs)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onCancel}>
              <Square className="w-3.5 h-3.5" />
              <span>{batchProgress ? 'Cancel Batch' : 'Cancel Scan'}</span>
            </Button>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{batchProgress ? 'Email scans completed' : `Engines finished · ${finishedTools} / ${executions.length}`}</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {totalProgress}%
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#DC2626] to-orange-500 rounded-full relative overflow-hidden"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(totalProgress, avgProgress)}%` }}
              transition={{ type: 'spring', stiffness: 60, damping: 20 }}
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.6s_infinite]" />
            </motion.div>
          </div>
        </div>
        {slowToolRunning && (
          <p className="mt-3 text-xs text-slate-500">
            MailAccess checks thousands of platforms and can take 1–3 minutes. Results appear when it finishes — you don't need to stay on this tab.
          </p>
        )}
      </Card>

      {/* Individual Tool Execution Cards */}
      {batchProgress ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(batchScans || []).map((scan, index) => (
            <motion.div
              key={`${index}-${scan.email}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      GHunt scan {index + 1}
                    </p>
                    <h3 className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
                      {scan.email}
                    </h3>
                  </div>
                  <ToolRunBadge status={scan.status} />
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      scan.status === 'running'
                        ? 'animate-pulse bg-gradient-to-r from-[#DC2626] to-orange-400'
                        : scan.status === 'error'
                          ? 'bg-rose-500'
                          : scan.status === 'warning'
                            ? 'bg-amber-500'
                            : scan.status === 'completed'
                              ? 'bg-emerald-500'
                              : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.max(scan.status === 'running' ? 8 : 0, scan.progress)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="min-w-0 truncate">{scan.message}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {scan.durationMs > 0 ? formatDuration(scan.durationMs) : '—'}
                  </span>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {executions.map((exec, index) => {
            const def = TOOL_BY_ID[exec.tool];
            return (
              <motion.div
                key={`${exec.tool}-${index}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.07, duration: 0.35 }}
              >
                <Card className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {def?.name || exec.tool}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">{def?.scope}</p>
                    </div>
                    <ToolRunBadge status={exec.status} />
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    {exec.status === 'running' ? (
                      <div
                        className="h-full animate-pulse rounded-full bg-gradient-to-r from-[#DC2626] to-orange-400 transition-all duration-500"
                        style={{ width: `${Math.max(8, exec.progress)}%` }}
                      />
                    ) : (
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          exec.status === 'error'
                            ? 'bg-rose-500'
                            : exec.status === 'warning'
                              ? 'bg-amber-500'
                              : exec.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-[#DC2626]'
                        }`}
                        style={{ width: `${exec.progress}%` }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                    <span className="truncate pr-2">
                      {exec.message || 'Waiting in execution queue...'}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {exec.durationMs > 0 ? formatDuration(exec.durationMs) : '—'}
                    </span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
