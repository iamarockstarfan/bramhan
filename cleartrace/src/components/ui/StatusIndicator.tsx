import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import {
  PlatformResultStatus,
  ScanOverallStatus,
  ToolAvailabilityStatus,
  ToolRunStatus,
} from '@/src/types/investigation';

export function PlatformStatusBadge({ status }: { status: PlatformResultStatus }) {
  const styles: Record<
    PlatformResultStatus,
    { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    found: {
      label: 'Found',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
    },
    not_found: {
      label: 'Not Found',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      Icon: MinusCircle,
    },
    not_checked: {
      label: 'Not Checked',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
      Icon: AlertTriangle,
    },
    error: {
      label: 'Error',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      Icon: XCircle,
    },
  };

  const { label, classes, Icon } = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function ScanStatusBadge({ status }: { status: ScanOverallStatus }) {
  const map: Record<
    ScanOverallStatus,
    { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    completed: {
      label: 'Completed',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
    },
    partial: {
      label: 'Completed with Warnings',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
      Icon: AlertTriangle,
    },
    running: {
      label: 'Running',
      classes: 'bg-rose-50 text-[#DC2626] border-rose-200',
      Icon: Loader2,
    },
    queued: {
      label: 'Queued',
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      Icon: Clock,
    },
    failed: {
      label: 'Failed',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      Icon: XCircle,
    },
    cancelled: {
      label: 'Cancelled',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      Icon: MinusCircle,
    },
  };

  const { label, classes, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${status === 'running' ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </span>
  );
}

export function ToolRunBadge({ status }: { status: ToolRunStatus }) {
  const map: Record<
    ToolRunStatus,
    { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    idle: {
      label: 'Idle',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      Icon: Clock,
    },
    queued: {
      label: 'Queued',
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      Icon: Clock,
    },
    running: {
      label: 'Running',
      classes: 'bg-rose-50 text-[#DC2626] border-rose-200',
      Icon: Loader2,
    },
    completed: {
      label: 'Completed',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
    },
    warning: {
      label: 'Partial / Rate-Limited',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
      Icon: AlertTriangle,
    },
    error: {
      label: 'Error',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      Icon: XCircle,
    },
    skipped: {
      label: 'Skipped',
      classes: 'bg-slate-100 text-slate-500 border-slate-200',
      Icon: MinusCircle,
    },
  };

  const { label, classes, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${status === 'running' ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </span>
  );
}

export function ToolAvailabilityIndicator({
  availability,
}: {
  availability: ToolAvailabilityStatus;
}) {
  const map: Record<
    ToolAvailabilityStatus,
    { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    ready: {
      label: 'Available',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
    },
    optional: {
      label: 'Optional',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      Icon: Clock,
    },
    unavailable: {
      label: 'Not Configured',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
      Icon: AlertTriangle,
    },
  };

  const { label, classes, Icon } = map[availability];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
