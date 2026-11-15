import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe,
  Mail,
  Phone,
  Radar,
  Search,
  Shield,
  ShieldCheck,
  Terminal,
  Fingerprint,
} from 'lucide-react';
import { INVESTIGATION_TOOLS } from '@/src/data/tools';
import { formatDuration } from '@/src/lib/api';
import {
  InvestigationRecord,
  ToolAvailabilityStatus,
  ToolId,
} from '@/src/types/investigation';
import { Card } from '@/src/components/ui/Card';
import {
  PlatformStatusBadge,
  ToolAvailabilityIndicator,
  ToolRunBadge,
} from '@/src/components/ui/StatusIndicator';
import { PlatformLogo } from '@/src/components/investigation/PlatformLogo';

const TOOL_ICON: Record<
  ToolId,
  React.ComponentType<{ className?: string }>
> = {
  mailaccess: Mail,
  holehe: Globe,
  maigret: Radar,
  ghunt: Shield,
  blackbird: Compass,
  sherlock: Terminal,
  hibp: ShieldCheck,
  phoneinfoga: Phone,
  ignorant: Fingerprint,
  detectdee: Search,
};

interface ToolDetailsPanelProps {
  investigation?: InvestigationRecord | null;
  toolAvailability?: Partial<Record<ToolId, ToolAvailabilityStatus>>;
  defaultExpandedTool?: ToolId;
}

export function ToolDetailsPanel({
  investigation,
  toolAvailability = {},
  defaultExpandedTool = 'holehe',
}: ToolDetailsPanelProps) {
  const [expandedTool, setExpandedTool] = useState<ToolId | null>(
    defaultExpandedTool
  );

  return (
    <div className="space-y-3">
      {INVESTIGATION_TOOLS.map((tool) => {
        const exec = investigation?.toolExecutions.find(
          (t) => t.tool === tool.id
        );
        const toolResults =
          investigation?.results.filter(
            (r) => r.tool === tool.id && r.status === 'found'
          ) || [];
        const availability =
          toolAvailability[tool.id] || tool.defaultAvailability;
        const isOpen = expandedTool === tool.id;
        const Icon = TOOL_ICON[tool.id];

        return (
          <Card key={tool.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedTool(isOpen ? null : tool.id)}
              aria-expanded={isOpen}
              className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-4 text-left hover:bg-rose-50/25 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${tool.accentBg} ${tool.accentText} ${tool.accentBorder}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-semibold text-slate-900">
                      {tool.name}
                    </span>
                    <ToolAvailabilityIndicator availability={availability} />
                  </div>
                  <p className="text-xs text-slate-500 truncate">{tool.scope}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {exec ? (
                  <>
                    <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 tabular-nums">
                      <span>{exec.platformsChecked} results</span>
                      <span>{exec.foundCount} found</span>
                      <span className="font-mono">
                        {formatDuration(exec.durationMs)}
                      </span>
                    </div>
                    <ToolRunBadge status={exec.status} />
                  </>
                ) : (
                  <span className="text-xs text-slate-400">
                    {investigation ? 'Not included' : 'Ready'}
                  </span>
                )}

                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#DC2626]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="px-5 pb-5 pt-4 border-t border-slate-100 space-y-5 bg-slate-50/40"
                >
                  <div className="space-y-3">
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {tool.description}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {tool.capabilities.map((cap) => (
                        <div
                          key={cap}
                          className="flex items-start gap-2 p-3 rounded-lg bg-white border border-slate-200/80 text-xs text-slate-700"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{cap}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {exec && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Execution Progress · {exec.message}</span>
                        <span className="font-mono tabular-nums">
                          {exec.progress}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            exec.status === 'error'
                              ? 'bg-rose-500'
                              : exec.status === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${exec.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {toolResults.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-900">
                        Found Platforms ({toolResults.length})
                      </p>
                      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                        {toolResults.map((res, idx) => (
                          <div
                            key={res.id || `${res.platform}-${idx}`}
                            className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <PlatformLogo item={res} className="w-8 h-8" />
                              <span className="font-medium text-slate-900">
                                {res.platform}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono text-slate-500 tabular-nums">
                                {formatDuration(res.duration)}
                              </span>
                              <PlatformStatusBadge status="found" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : exec ? (
                    <p className="text-xs text-slate-500">
                      No platforms were confirmed. Use Categorized Results and change the status filter to review non-matches or checks that need attention.
                    </p>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}
    </div>
  );
}
