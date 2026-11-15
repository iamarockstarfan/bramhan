import React from 'react';
import { motion } from 'motion/react';
import { Play, RefreshCw } from 'lucide-react';
import {
  InvestigationRecord,
  ToolAvailabilityStatus,
  ToolId,
} from '@/src/types/investigation';
import { ToolDetailsPanel } from '@/src/components/investigation/ToolDetailsPanel';
import { Button } from '@/src/components/ui/Button';

interface ToolsPageProps {
  activeInvestigation: InvestigationRecord | null;
  toolAvailability: Record<ToolId, ToolAvailabilityStatus>;
  onRefreshHealth: () => void;
  onStartNewScan: () => void;
}

export function ToolsPage({
  activeInvestigation,
  toolAvailability,
  onRefreshHealth,
  onStartNewScan,
}: ToolsPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Investigation Engines
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Inspect live availability, investigation scope, and supported
            capabilities for each engine.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={onRefreshHealth}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Engine Status</span>
          </Button>
          <Button onClick={onStartNewScan}>
            <Play className="w-4 h-4" />
            <span>Configure New Scan</span>
          </Button>
        </div>
      </div>

      <ToolDetailsPanel
        investigation={activeInvestigation}
        toolAvailability={toolAvailability}
      />
    </motion.div>
  );
}
