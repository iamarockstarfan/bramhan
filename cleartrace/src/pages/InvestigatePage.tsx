import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, RotateCcw, XCircle } from 'lucide-react';
import {
  cancelInvestigation,
  fetchInvestigationById,
  MAX_EMAIL_BATCH_SIZE,
  startInvestigation,
} from '@/src/lib/api';
import {
  InvestigationRecord,
  ToolAvailabilityStatus,
  ToolExecutionState,
  ToolId,
  MatchScope,
  InvestigationTargetType,
} from '@/src/types/investigation';
import { InvestigationForm } from '@/src/components/investigation/InvestigationForm';
import { LiveScanProgress, type BatchScanProgressItem } from '@/src/components/investigation/LiveScanProgress';
import { AuthorizationDialog } from '@/src/components/overlays/AuthorizationDialog';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { INVESTIGATION_TOOLS } from '@/src/data/tools';
import { ResultsSkeletonView } from '@/src/components/ui/Skeleton';

interface InvestigatePageProps {
  initialEmail?: string;
  toolAvailability: Record<ToolId, ToolAvailabilityStatus>;
  onScanComplete: (record: InvestigationRecord, navigateToResults?: boolean) => void;
  onNotify: (toast: {
    type: 'success' | 'error' | 'info';
    title: string;
    message?: string;
  }) => void;
}

const DEFAULT_CORE_TOOLS: ToolId[] = ['mailaccess', 'holehe', 'ghunt', 'hibp'];
const DEFAULT_PHONE_TOOLS: ToolId[] = ['phoneinfoga', 'ignorant', 'detectdee'];
const USERNAME_TOOLS: ToolId[] = ['maigret', 'sherlock'];
const BATCH_CONCURRENCY = 50;
const INITIAL_BATCH_CONCURRENCY = 5;
const ACTIVE_SCAN_KEY = 'cleartrace.activeScan';
interface SavedScan {
  scanId: string;
  email: string;
  targetType?: InvestigationTargetType;
  phoneCountryCode?: string;
  startedAt: number;
  batchEmails?: string[];
  batchPosition?: number;
  batchMode?: boolean;
}

function saveActiveScan(value: SavedScan | null) {
  try {
    if (value) sessionStorage.setItem(ACTIVE_SCAN_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(ACTIVE_SCAN_KEY);
  } catch { /* storage unavailable: resume simply won't work */ }
}

function loadActiveScan(): SavedScan | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_SCAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function downloadBatchReport(records: InvestigationRecord[]) {
  const lines = [
    'ClearTrace GHunt Batch Report',
    `Generated: ${new Date().toLocaleString()}`,
    `Email scans: ${records.length}`,
  ];

  records.forEach((record, index) => {
    lines.push(
      '',
      `=== ${index + 1}. ${record.email} ===`,
      `Status: ${record.status}`,
      `Summary: ${record.summary.found} found, ${record.summary.notFound} not found, ${record.summary.errors} errors, ${record.summary.total} checks`,
      `Scan ID: ${record.scanId}`,
    );
    if (record.errorMessage) lines.push(`Scan error: ${record.errorMessage}`);
    if (record.results.length === 0) {
      lines.push('No platform results returned.');
      return;
    }

    record.results.forEach((item) => {
      lines.push(
        '',
        `[${item.status.toUpperCase()}] ${item.platform}`,
      );
      if (item.url) lines.push(`URL: ${item.url}`);
      if (item.errorMessage) lines.push(`Error: ${item.errorMessage}`);
      if (Object.keys(item.details).length > 0) {
        lines.push(`Details: ${JSON.stringify(item.details)}`);
      }
    });
  });

  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cleartrace-ghunt-results-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function InvestigatePage({
  initialEmail = '',
  toolAvailability,
  onScanComplete,
  onNotify,
}: InvestigatePageProps) {
  const [email, setEmail] = useState(initialEmail);
  const [batchEmails, setBatchEmails] = useState<string[]>([]);
  const [batchPosition, setBatchPosition] = useState(0);
  const [batchActiveCount, setBatchActiveCount] = useState(0);
  const [batchConcurrencyLimit, setBatchConcurrencyLimit] = useState(0);
  const [batchResults, setBatchResults] = useState<InvestigationRecord[]>([]);
  const [batchScanProgress, setBatchScanProgress] = useState<BatchScanProgressItem[]>([]);
  const [selectedTools, setSelectedTools] = useState<ToolId[]>(DEFAULT_CORE_TOOLS);
  const [matchScope, setMatchScope] = useState<MatchScope>('email');
  const [targetType, setTargetType] = useState<InvestigationTargetType>('email');
  const [phoneCountryCode, setPhoneCountryCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBatchMode, setConfirmBatchMode] = useState(false);
  const [phase, setPhase] = useState<
    'setup' | 'submitting' | 'running' | 'finalizing' | 'error' | 'batch-complete'
  >('setup');
  const [activeScanId, setActiveScanId] = useState<string | undefined>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [executions, setExecutions] = useState<ToolExecutionState[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pollTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const batchEmailsRef = useRef<string[]>([]);
  const batchPositionRef = useRef(0);
  const batchModeRef = useRef(false);
  const batchResultsRef = useRef<InvestigationRecord[]>([]);
  const batchReportDownloadedRef = useRef(false);
  const batchScanIdsRef = useRef(new Set<string>());
  const batchAbortControllersRef = useRef(new Set<AbortController>());
  const batchConcurrencyWaitersRef = useRef(new Set<() => void>());
  const batchRunIdRef = useRef(0);

  const wakeBatchConcurrencyWaiters = () => {
    const waiters = [...batchConcurrencyWaitersRef.current];
    batchConcurrencyWaitersRef.current.clear();
    waiters.forEach((wake) => wake());
  };

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (
      phase === 'batch-complete' &&
      batchResults.length > 0 &&
      !batchReportDownloadedRef.current
    ) {
      batchReportDownloadedRef.current = true;
      downloadBatchReport(batchResults);
    }
  }, [batchResults, phase]);

  const isUsable = (tool: ToolId) => {
    const def = INVESTIGATION_TOOLS.find((t) => t.id === tool);
    return def?.inputTypes.includes(targetType) !== false &&
      (toolAvailability[tool] || def?.defaultAvailability) !== 'unavailable';
  };
  const usableTools = selectedTools.filter(isUsable);
  const toolsToRun = targetType === 'phone'
    ? usableTools
    : matchScope === 'email'
      ? usableTools.filter((tool) => !USERNAME_TOOLS.includes(tool))
      : usableTools;

  // Drop engines that turn out to be unavailable so the user is never stuck with a hidden, un-deselectable choice.
  useEffect(() => {
    setSelectedTools((prev) => {
      const next = prev.filter(isUsable);
      return next.length === prev.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolAvailability]);

  const finishScan = (record: InvestigationRecord) => {
    stopPolling();
    saveActiveScan(null);
    if (batchModeRef.current) {
      const completedRecords = [...batchResultsRef.current, record];
      batchResultsRef.current = completedRecords;
      setBatchResults(completedRecords);
      onScanComplete(record, false);

      const nextPosition = batchPositionRef.current + 1;
      if (nextPosition < batchEmailsRef.current.length) {
        const nextEmail = batchEmailsRef.current[nextPosition];
        batchPositionRef.current = nextPosition;
        setBatchPosition(nextPosition);
        setEmail(nextEmail);
        setExecutions([]);
        setElapsedMs(0);
        void dispatchScanForEmail(nextEmail);
        return;
      }

      batchModeRef.current = false;
      batchEmailsRef.current = [];
      batchPositionRef.current = 0;
      setBatchEmails([]);
      setBatchPosition(0);
      setPhase('batch-complete');
      onNotify({
        type: completedRecords.some((item) => item.status === 'failed') ? 'error' : 'success',
        title: 'GHunt Batch Complete',
        message: `${completedRecords.length} email scan${completedRecords.length === 1 ? '' : 's'} finished. Review or download the combined results.`,
      });
      return;
    }

    const queuedEmails = batchEmailsRef.current;
    const nextPosition = batchPositionRef.current + 1;
    const hasNextEmail = queuedEmails.length > 1 && nextPosition < queuedEmails.length;
    onNotify({
      type: record.status === 'failed' ? 'error' : 'success',
      title: record.status === 'failed' ? 'Investigation Finished with Errors' : 'Investigation Complete',
      message: `${record.summary.found} found across ${record.summary.total} checks.`,
    });
    onScanComplete(record, !hasNextEmail);
    if (hasNextEmail) {
      const nextEmail = queuedEmails[nextPosition];
      batchPositionRef.current = nextPosition;
      setBatchPosition(nextPosition);
      setEmail(nextEmail);
      setExecutions([]);
      setElapsedMs(0);
      void dispatchScanForEmail(nextEmail);
      return;
    }

    batchEmailsRef.current = [];
    batchPositionRef.current = 0;
    batchModeRef.current = false;
    setBatchEmails([]);
    setBatchPosition(0);
    setPhase('finalizing');
  };

  const createBatchFailure = (targetEmail: string, message: string): InvestigationRecord => {
    const now = new Date().toISOString();
    return {
      scanId: `batch-${crypto.randomUUID()}`,
      email: targetEmail,
      status: 'failed',
      createdAt: now,
      completedAt: now,
      durationMs: 0,
      selectedTools: ['ghunt'],
      matchScope: 'email',
      summary: { total: 1, found: 0, notFound: 0, notChecked: 0, errors: 1 },
      results: [{
        tool: 'ghunt',
        platform: 'GHunt',
        category: 'Productivity & Cloud',
        status: 'error',
        details: {},
        duration: 0,
        errorMessage: message,
      }],
      toolExecutions: [{
        tool: 'ghunt',
        status: 'error',
        progress: 100,
        durationMs: 0,
        platformsChecked: 1,
        foundCount: 0,
        errorCount: 1,
        message,
      }],
      errorMessage: message,
    };
  };

  const dispatchBatch = async (emails: string[]) => {
    const batchRunId = ++batchRunIdRef.current;
    batchScanIdsRef.current.clear();
    batchResultsRef.current = new Array(emails.length);
    batchReportDownloadedRef.current = false;
    setBatchResults([]);
    setBatchPosition(0);
    setBatchActiveCount(0);
    const workerCount = Math.min(BATCH_CONCURRENCY, emails.length);
    let concurrencyLimit = Math.min(INITIAL_BATCH_CONCURRENCY, workerCount);
    let stableCompletions = 0;
    let baselineDurationMs: number | undefined;
    setBatchConcurrencyLimit(concurrencyLimit);
    setBatchScanProgress(Array.from({ length: workerCount }, (_, index) => ({
      email: emails[index],
      status: 'queued',
      progress: 0,
      durationMs: 0,
      message: 'Waiting to start.',
    })));
    setPhase('running');
    setElapsedMs(0);
    const startedAt = Date.now();
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(
      () => setElapsedMs(Date.now() - startedAt),
      250
    );
    setExecutions([{
      tool: 'ghunt',
      status: 'running',
      progress: 0,
      durationMs: 0,
      platformsChecked: 0,
      foundCount: 0,
      errorCount: 0,
      message: `Starting with ${concurrencyLimit}; adapting up to ${BATCH_CONCURRENCY} parallel scans.`,
    }]);

    let nextIndex = 0;
    const setConcurrencyLimit = (nextLimit: number) => {
      const boundedLimit = Math.max(1, Math.min(BATCH_CONCURRENCY, nextLimit));
      if (boundedLimit === concurrencyLimit) return;
      concurrencyLimit = boundedLimit;
      setBatchConcurrencyLimit(boundedLimit);
      wakeBatchConcurrencyWaiters();
    };
    const waitForConcurrencySlot = async (slot: number) => {
      while (
        batchRunId === batchRunIdRef.current &&
        slot >= concurrencyLimit &&
        nextIndex < emails.length
      ) {
        await new Promise<void>((resolve) => {
          batchConcurrencyWaitersRef.current.add(resolve);
        });
      }
      return batchRunId === batchRunIdRef.current;
    };
    const adaptConcurrency = (record: InvestigationRecord) => {
      const errorText = record.results
        .map((item) => item.errorMessage || '')
        .join(' ')
        .toLowerCase();
      const degraded =
        record.status === 'failed' ||
        record.summary.errors > 0 ||
        record.summary.notChecked > 0 ||
        /rate.?limit|too many requests|\b429\b|quota|captcha|verification wall/.test(errorText);
      if (degraded) {
        stableCompletions = 0;
        setConcurrencyLimit(Math.floor(concurrencyLimit / 2));
        return;
      }

      const duration = record.durationMs;
      if (
        baselineDurationMs !== undefined &&
        duration > baselineDurationMs * 1.5
      ) {
        stableCompletions = 0;
        setConcurrencyLimit(Math.floor(concurrencyLimit / 2));
        return;
      }

      if (duration > 0) {
        baselineDurationMs = baselineDurationMs === undefined
          ? duration
          : baselineDurationMs * 0.8 + duration * 0.2;
      }
      stableCompletions += 1;
      if (stableCompletions >= 2) {
        stableCompletions = 0;
        setConcurrencyLimit(concurrencyLimit + 5);
      }
    };
    const updateWorkerProgress = (slot: number, item: BatchScanProgressItem) => {
      setBatchScanProgress((current) =>
        current.map((existing, index) => index === slot ? item : existing)
      );
    };
    const runWorker = async (slot: number) => {
      while (batchRunId === batchRunIdRef.current) {
        if (!(await waitForConcurrencySlot(slot))) return;
        const index = nextIndex++;
        if (index >= emails.length) return;
        if (nextIndex >= emails.length) wakeBatchConcurrencyWaiters();
        const targetEmail = emails[index];
        updateWorkerProgress(slot, {
          email: targetEmail,
          status: 'queued',
          progress: 0,
          durationMs: 0,
          message: 'Submitting scan request.',
        });
        let record: InvestigationRecord;
        let scanId: string | undefined;
        let countedActive = false;
        try {
          let initial: InvestigationRecord;
          let retryDelayMs = 1000;
          while (true) {
            if (batchRunId !== batchRunIdRef.current) return;
            try {
              initial = await startInvestigation({
                email: targetEmail,
                tools: ['ghunt'],
                matchScope: 'email',
                authorizedConfirmed: true,
              });
              break;
            } catch (error) {
              if ((error as { status?: number })?.status !== 429) throw error;
              stableCompletions = 0;
              setConcurrencyLimit(Math.floor(concurrencyLimit / 2));
              setExecutions([{
                tool: 'ghunt',
                status: 'running',
                progress: 5,
                durationMs: Date.now() - startedAt,
                platformsChecked: 0,
                foundCount: 0,
                errorCount: 0,
                message: 'Waiting for an available scan slot.',
              }]);
              updateWorkerProgress(slot, {
                email: targetEmail,
                status: 'queued',
                progress: 0,
                durationMs: Date.now() - startedAt,
                message: 'Waiting for a server scan slot.',
              });
              const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs;
              await new Promise((resolve) =>
                window.setTimeout(resolve, retryAfterMs ?? retryDelayMs)
              );
              if (!(await waitForConcurrencySlot(slot))) return;
              retryDelayMs = Math.min(retryDelayMs * 2, 10000);
            }
          }

          batchScanIdsRef.current.add(initial.scanId);
          scanId = initial.scanId;
          if (initial.status === 'queued' || initial.status === 'running') {
            countedActive = true;
            setBatchActiveCount((count) => count + 1);
          }
          const initialExecution = initial.toolExecutions.find((item) => item.tool === 'ghunt');
          updateWorkerProgress(slot, {
            email: targetEmail,
            status: initialExecution?.status || (initial.status === 'completed' ? 'completed' : 'running'),
            progress: initialExecution?.progress ?? (initial.status === 'completed' ? 100 : 5),
            durationMs: initialExecution?.durationMs ?? 0,
            message: initialExecution?.message || 'Accepted by the server; GHunt is starting.',
          });
          if (batchRunId !== batchRunIdRef.current) {
            try {
              await cancelInvestigation(initial.scanId);
            } finally {
              batchScanIdsRef.current.delete(initial.scanId);
            }
            return;
          }
          let latest = initial;
          if (!['completed', 'partial', 'failed', 'cancelled'].includes(latest.status)) {
            const controller = new AbortController();
            batchAbortControllersRef.current.add(controller);
            try {
              let failedPolls = 0;
              while (batchRunId === batchRunIdRef.current) {
                await new Promise((resolve) => window.setTimeout(resolve, 1200));
                if (batchRunId !== batchRunIdRef.current) return;
                try {
                  latest = await fetchInvestigationById(initial.scanId, controller.signal);
                  failedPolls = 0;
                  const execution = latest.toolExecutions.find((item) => item.tool === 'ghunt');
                  if (execution) {
                    updateWorkerProgress(slot, {
                      email: targetEmail,
                      status: execution.status,
                      progress: execution.progress,
                      durationMs: execution.durationMs,
                      message: execution.message || 'GHunt is running.',
                    });
                  }
                } catch (error) {
                  if (controller.signal.aborted) return;
                  if (++failedPolls >= 8) throw error;
                  await new Promise((resolve) => window.setTimeout(resolve, 1000));
                  continue;
                }
                if (['completed', 'partial', 'failed', 'cancelled'].includes(latest.status)) break;
              }
            } finally {
              batchAbortControllersRef.current.delete(controller);
            }
          }
          if (batchRunId !== batchRunIdRef.current) return;
          record = latest.status === 'cancelled'
            ? createBatchFailure(targetEmail, 'The GHunt scan was cancelled before it returned results.')
            : latest;
        } catch (error) {
          if (batchRunId !== batchRunIdRef.current) return;
          record = createBatchFailure(
            targetEmail,
            error instanceof Error ? error.message : 'The GHunt scan could not be completed.'
          );
        } finally {
          if (countedActive) {
            setBatchActiveCount((count) => Math.max(0, count - 1));
          }
        }

        if (batchRunId !== batchRunIdRef.current) return;
        if (scanId) batchScanIdsRef.current.delete(scanId);
        adaptConcurrency(record);
        const finalExecution = record.toolExecutions.find((item) => item.tool === 'ghunt');
        updateWorkerProgress(slot, {
          email: targetEmail,
          status: finalExecution?.status || (record.status === 'failed' ? 'error' : 'completed'),
          progress: finalExecution?.progress ?? 100,
          durationMs: finalExecution?.durationMs ?? record.durationMs,
          message: finalExecution?.message || record.errorMessage || 'GHunt scan finished.',
        });
        batchResultsRef.current[index] = record;
        const completed = batchResultsRef.current.filter(Boolean).length;
        setBatchPosition(completed);
        setBatchResults([...batchResultsRef.current].filter(Boolean));
        setExecutions([{
          tool: 'ghunt',
          status: completed === emails.length ? 'completed' : 'running',
          progress: Math.round((completed / emails.length) * 100),
          durationMs: Date.now() - startedAt,
          platformsChecked: completed,
          foundCount: batchResultsRef.current.filter((item) => item?.summary.found > 0).length,
          errorCount: batchResultsRef.current.filter((item) => item?.status === 'failed' || item?.status === 'partial').length,
          message: `${completed} of ${emails.length} email scans finished.`,
        }]);
        onScanComplete(record, false);
      }
    };

    await Promise.all(
      Array.from({ length: workerCount }, (_, slot) => runWorker(slot))
    );
    if (batchRunId !== batchRunIdRef.current) return;

    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    const completedRecords = batchResultsRef.current;
    batchModeRef.current = false;
    batchEmailsRef.current = [];
    setBatchEmails([]);
    setBatchResults(completedRecords);
    setBatchPosition(completedRecords.length);
    setBatchActiveCount(0);
    setPhase('batch-complete');
    onNotify({
      type: completedRecords.some((item) => item.status === 'failed' || item.status === 'partial') ? 'error' : 'success',
      title: 'GHunt Batch Complete',
      message: `${completedRecords.length} of ${emails.length} email scans finished. Failed scans are included in the report.`,
    });
  };

  const beginPolling = (scanId: string, startTs: number) => {
    setActiveScanId(scanId);
    setPhase('running');
    setElapsedMs(Date.now() - startTs);
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startTs), 250);

    let failedPolls = 0;
    const poll = async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const latest = await fetchInvestigationById(scanId, controller.signal);
        failedPolls = 0;
        if (latest.toolExecutions.length > 0) setExecutions(latest.toolExecutions);
        if (latest.status === 'cancelled') {
          stopPolling();
          saveActiveScan(null);
          batchEmailsRef.current = [];
          batchPositionRef.current = 0;
          batchModeRef.current = false;
          batchResultsRef.current = [];
          setBatchResults([]);
          setBatchEmails([]);
          setBatchPosition(0);
          setPhase('setup');
          return;
        }
        if (latest.status === 'completed' || latest.status === 'partial' || latest.status === 'failed') {
          finishScan(latest);
          return;
        }
        pollTimerRef.current = window.setTimeout(poll, 1200);
      } catch (err) {
        if (controller.signal.aborted) return;
        // Long scans: tolerate brief network/server hiccups instead of abandoning the scan.
        const status = (err as { status?: number })?.status;
        if (status !== 404 && ++failedPolls < 8) {
          pollTimerRef.current = window.setTimeout(poll, 2000);
          return;
        }
        stopPolling();
        saveActiveScan(null);
        const msg = err instanceof Error ? err.message : 'Failed while polling investigation status.';
        setSubmitError(msg);
        setPhase('error');
        onNotify({ type: 'error', title: 'Polling Error', message: msg });
      }
    };
    pollTimerRef.current = window.setTimeout(poll, 800);
  };

  // Resume a scan that is still running if the user navigated away and came back.
  useEffect(() => {
    const saved = loadActiveScan();
    if (!saved) return;
    let cancelled = false;
    fetchInvestigationById(saved.scanId)
      .then((record) => {
        if (cancelled) return;
        const savedBatchEmails = Array.isArray(saved.batchEmails)
          ? saved.batchEmails.filter((item) => typeof item === 'string')
          : [];
        const savedBatchPosition = typeof saved.batchPosition === 'number' && Number.isInteger(saved.batchPosition)
          ? Math.min(saved.batchPosition, Math.max(savedBatchEmails.length - 1, 0))
          : 0;
        batchEmailsRef.current = savedBatchEmails;
        batchPositionRef.current = savedBatchPosition;
        batchModeRef.current = saved.batchMode === true;
        setBatchEmails(savedBatchEmails);
        setBatchPosition(savedBatchPosition);
        if (record.status === 'queued' || record.status === 'running') {
          setEmail(saved.email);
          setTargetType(saved.targetType ?? record.targetType ?? 'email');
          setPhoneCountryCode(saved.phoneCountryCode ?? record.phoneCountryCode ?? '');
          setExecutions(record.toolExecutions);
          beginPolling(saved.scanId, saved.startedAt);
        } else if (record.status === 'cancelled') {
          saveActiveScan(null);
          batchEmailsRef.current = [];
          batchPositionRef.current = 0;
          setBatchEmails([]);
          setBatchPosition(0);
        } else {
          finishScan(record);
        }
      })
      .catch(() => saveActiveScan(null));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleTool = (tool: ToolId) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  async function dispatchScanForEmail(
    targetEmail: string,
    scanTargetType: InvestigationTargetType = targetType,
  ) {
    setSubmitError(null);
    setPhase('submitting');

    const trimmedEmail = targetEmail.trim();
    const trimmedCountryCode = phoneCountryCode.replace(/\D/g, '');
    const normalizedTarget = scanTargetType === 'phone'
      ? `+${trimmedCountryCode}${trimmedEmail.replace(/\D/g, '')}`
      : trimmedEmail;
    const startTs = Date.now();
    const scanTools: ToolId[] = batchModeRef.current ? ['ghunt'] : toolsToRun;
    const scanMatchScope: MatchScope = batchModeRef.current || scanTargetType === 'phone' ? 'email' : matchScope;
    const scanType: InvestigationTargetType = batchModeRef.current ? 'email' : scanTargetType;

    const initialExecs: ToolExecutionState[] = scanTools.map((tool) => ({
      tool,
      status: 'queued',
      progress: 0,
      durationMs: 0,
      platformsChecked: 0,
      foundCount: 0,
      errorCount: 0,
      message: 'Queued for investigation...',
    }));
    setExecutions(initialExecs);

    try {
      const initialRecord = await startInvestigation({
        email: normalizedTarget,
        target: normalizedTarget,
        targetType: scanType,
        phoneCountryCode: scanType === 'phone' ? `+${trimmedCountryCode}` : undefined,
        tools: scanTools,
        matchScope: scanMatchScope,
        authorizedConfirmed: true,
      });

      setActiveScanId(initialRecord.scanId);
      if (initialRecord.toolExecutions.length > 0) {
        setExecutions(initialRecord.toolExecutions);
      }

      if (
        initialRecord.status === 'completed' ||
        initialRecord.status === 'partial' ||
        initialRecord.status === 'failed'
      ) {
        finishScan(initialRecord);
        return;
      }

      saveActiveScan({
        scanId: initialRecord.scanId,
        email: trimmedEmail,
        targetType: scanType,
        phoneCountryCode: scanType === 'phone' ? `+${trimmedCountryCode}` : undefined,
        startedAt: startTs,
        batchEmails: batchEmailsRef.current,
        batchPosition: batchPositionRef.current,
        batchMode: batchModeRef.current,
      });
      beginPolling(initialRecord.scanId, startTs);
    } catch (err) {
      stopPolling();
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to connect to the investigation service.';
      setSubmitError(msg);
      setPhase('error');
      onNotify({
        type: 'error',
        title: 'Investigation Dispatch Failed',
        message: msg,
      });
    }
  }

  const handleFormSubmit = (mode: 'single' | 'batch') => {
    const isBatch = mode === 'batch';
    if (isBatch && (batchEmailsRef.current.length === 0 || batchEmailsRef.current.length > MAX_EMAIL_BATCH_SIZE)) {
      onNotify({
        type: 'error',
        title: 'Invalid email list',
        message: `Upload between 1 and ${MAX_EMAIL_BATCH_SIZE} valid, unique email addresses.`,
      });
      return;
    }
    if (isBatch && (toolAvailability.ghunt || INVESTIGATION_TOOLS.find((tool) => tool.id === 'ghunt')?.defaultAvailability) === 'unavailable') {
      onNotify({
        type: 'error',
        title: 'GHunt is unavailable',
        message: 'Check the GHunt setup on the Tools page before starting a batch.',
      });
      return;
    }
    setConfirmBatchMode(isBatch);
    setConfirmOpen(true);
  };

  const handleConfirmAndDispatch = () => {
    setConfirmOpen(false);
    const isBatch = confirmBatchMode;
    const emailsToScan = isBatch ? batchEmailsRef.current : [email.trim()];
    if (isBatch && emailsToScan.length === 0) {
      setPhase('setup');
      return;
    }
    batchModeRef.current = isBatch;
    batchResultsRef.current = [];
    batchReportDownloadedRef.current = false;
    setBatchResults([]);
    batchPositionRef.current = 0;
    setBatchPosition(0);
    if (isBatch) {
      void dispatchBatch(emailsToScan);
      return;
    }
    batchEmailsRef.current = [];
    batchModeRef.current = false;
    void dispatchScanForEmail(emailsToScan[0], targetType);
  };

  const handleCancelScan = async () => {
    if (batchModeRef.current) {
      batchRunIdRef.current += 1;
      wakeBatchConcurrencyWaiters();
      const activeScanIds = [...batchScanIdsRef.current];
      batchAbortControllersRef.current.forEach((controller) => controller.abort());
      const cancellations = await Promise.allSettled(
        activeScanIds.map((scanId) => cancelInvestigation(scanId))
      );
      const failedCancellation = cancellations.find((item) => item.status === 'rejected');
      if (failedCancellation?.status === 'rejected') {
        onNotify({
          type: 'error',
          title: 'Unable to cancel all batch scans',
          message: failedCancellation.reason instanceof Error
            ? failedCancellation.reason.message
            : 'Some GHunt scans may still be running.',
        });
      }
      batchScanIdsRef.current.clear();
      batchModeRef.current = false;
      batchEmailsRef.current = [];
      batchResultsRef.current = [];
      setBatchResults([]);
      setBatchScanProgress([]);
      setBatchEmails([]);
      setBatchPosition(0);
      setBatchActiveCount(0);
      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      setPhase('setup');
      onNotify({
        type: 'info',
        title: 'GHunt Batch Cancelled',
        message: 'Active scans were stopped. Completed batch results were discarded.',
      });
      return;
    }
    batchEmailsRef.current = [];
    batchPositionRef.current = 0;
    batchModeRef.current = false;
    batchResultsRef.current = [];
    batchReportDownloadedRef.current = false;
    setBatchResults([]);
    setBatchEmails([]);
    setBatchPosition(0);
    if (!activeScanId) {
      stopPolling();
      saveActiveScan(null);
      setPhase('setup');
      return;
    }

    try {
      const cancellation = await cancelInvestigation(activeScanId);
      if (!cancellation.cancelled) {
        const latest = await fetchInvestigationById(activeScanId);
        finishScan(latest);
        return;
      }
      stopPolling();
      saveActiveScan(null);
    } catch (err) {
      onNotify({
        type: 'error',
        title: 'Unable to cancel investigation',
        message: err instanceof Error ? err.message : 'The investigation may still be running.',
      });
      return;
    }

    setPhase('setup');
    onNotify({
      type: 'info',
      title: 'Investigation Cancelled',
      message: 'Scan execution stopped.',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          {targetType === 'email' ? 'Start Email Investigation' : 'Start Phone Investigation'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure an authorized email or phone-number scan across your selected investigation engines.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {(phase === 'setup' || phase === 'submitting') && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <InvestigationForm
              targetType={targetType}
              onTargetTypeChange={(value) => {
                setTargetType(value);
                setEmail('');
                setSelectedTools(value === 'phone' ? DEFAULT_PHONE_TOOLS : DEFAULT_CORE_TOOLS);
                batchEmailsRef.current = [];
                batchModeRef.current = false;
                setBatchEmails([]);
              }}
              phoneCountryCode={phoneCountryCode}
              onPhoneCountryCodeChange={setPhoneCountryCode}
              email={email}
              onEmailChange={(value) => {
                setEmail(value);
                batchEmailsRef.current = [];
                batchPositionRef.current = 0;
                batchModeRef.current = false;
                setBatchEmails([]);
                setBatchPosition(0);
              }}
              batchEmails={batchEmails}
              onBatchEmailsImport={(emails) => {
                batchEmailsRef.current = emails;
                batchPositionRef.current = 0;
                setBatchEmails(emails);
                setBatchPosition(0);
                setEmail(emails[0]);
              }}
              selectedTools={selectedTools}
              onToggleTool={handleToggleTool}
              onSelectCoreTools={() => setSelectedTools(
                (targetType === 'phone' ? DEFAULT_PHONE_TOOLS : DEFAULT_CORE_TOOLS).filter(isUsable)
              )}
              matchScope={matchScope}
              onMatchScopeChange={setMatchScope}
              onSubmit={handleFormSubmit}
              toolAvailability={toolAvailability}
              isSubmitting={phase === 'submitting'}
            />
          </motion.div>
        )}

        {phase === 'running' && (
          <motion.div
            key="running"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <LiveScanProgress
              email={targetType === 'phone' ? `${phoneCountryCode} ${email.trim()}` : email.trim()}
              batchProgress={batchModeRef.current
                ? `${batchPosition} of ${batchEmails.length} complete · ${batchActiveCount} active · adaptive limit ${batchConcurrencyLimit}/${BATCH_CONCURRENCY}`
                : undefined}
              batchScans={batchModeRef.current ? batchScanProgress : undefined}
              scanId={activeScanId}
              elapsedMs={elapsedMs}
              executions={executions}
              onCancel={handleCancelScan}
            />
          </motion.div>
        )}

        {phase === 'finalizing' && (
          <motion.div
            key="finalizing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ResultsSkeletonView />
          </motion.div>
        )}

        {phase === 'batch-complete' && (
          <motion.div
            key="batch-complete"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <Card className="p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">GHunt batch results</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {batchResults.length} email scan{batchResults.length === 1 ? '' : 's'} completed. Results are grouped by email.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => downloadBatchReport(batchResults)}>
                    <Download className="h-4 w-4" />
                    Download combined TXT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      batchResultsRef.current = [];
                      setBatchResults([]);
                      setEmail('');
                      setPhase('setup');
                    }}
                  >
                    New investigation
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {batchResults.map((record) => (
                  <section key={record.scanId} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-mono text-sm font-semibold text-slate-900">{record.email}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.status} · {record.summary.found} found · {record.summary.total} checks
                        </p>
                      </div>
                      {record.errorMessage && (
                        <p className="max-w-xl text-xs text-rose-600">{record.errorMessage}</p>
                      )}
                    </div>
                    {record.results.length > 0 ? (
                      <ul className="mt-3 divide-y divide-slate-100">
                        {record.results.map((item, index) => (
                          <li key={item.id || `${record.scanId}-${item.platform}-${index}`} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800">{item.platform}</span>
                              <span className="text-xs capitalize text-slate-500">{item.status.replace('_', ' ')}</span>
                            </div>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block break-all text-xs text-rose-700 hover:underline"
                              >
                                {item.url}
                              </a>
                            )}
                            {Object.keys(item.details).length > 0 && (
                              <details className="mt-2 text-xs text-slate-600">
                                <summary className="cursor-pointer">Details</summary>
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2">
                                  {JSON.stringify(item.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">GHunt returned no platform results for this address.</p>
                    )}
                  </section>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="p-6 border-rose-200 bg-rose-50/50 space-y-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-slate-900">
                    Could not complete investigation request
                  </h2>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {submitError}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pl-8">
                <Button size="sm" onClick={() => dispatchScanForEmail(email)}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Request</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPhase('setup')}
                >
                  Back to Configuration
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthorizationDialog
        open={confirmOpen}
        emails={confirmBatchMode
          ? batchEmails
          : [targetType === 'phone'
            ? `+${phoneCountryCode.replace(/\D/g, '')}${email.replace(/\D/g, '')}`
            : email.trim()]}
        targetType={targetType}
        selectedTools={confirmBatchMode ? ['ghunt'] : toolsToRun}
        matchScope={confirmBatchMode ? 'email' : matchScope}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmAndDispatch}
      />
    </div>
  );
}
