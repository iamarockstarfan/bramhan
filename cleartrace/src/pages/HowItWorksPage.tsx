import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Play } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';

interface HowItWorksPageProps {
  onStartNewScan: () => void;
}

const PIPELINE_STEPS = [
  {
    step: '01',
    badgeClass: 'bg-[#DC2626] text-white',
    title: 'Enter an authorized email or phone number',
    summary:
      'Provide a target you own or have explicit written authorization to assess.',
    detail:
      'Single-target focus reinforces intentional digital footprint hygiene checks and prevents bulk abuse.',
  },
  {
    step: '02',
    badgeClass: 'bg-rose-700 text-white',
    title: 'Validate the input',
    summary:
      'Format checks verify the email or international phone format and require explicit authorization confirmation.',
    detail:
      'Before any investigation begins, the authorization dialog confirms ownership or permission.',
  },
  {
    step: '03',
    badgeClass: 'bg-orange-600 text-white',
    title: 'Select investigation engines',
    summary:
      'Choose installed tools marked Available. Optional scanners become available once installed.',
    detail:
      'Live engine availability indicators make it clear which modules are ready before you launch.',
  },
  {
    step: '04',
    badgeClass: 'bg-sky-600 text-white',
    title: 'Run the live scan',
    summary:
      'Selected engines execute concurrently with isolated timeouts and stream real-time progress.',
    detail:
      'Lookups use public registration signals and profile data and do not log in or message the mailbox. Long engines such as MailAccess can take 1–3 minutes.',
  },
  {
    step: '05',
    badgeClass: 'bg-emerald-600 text-white',
    title: 'Collect and normalize results',
    summary:
      'Disparate platform outputs are mapped into four unambiguous result states.',
    detail:
      'Rate-limited checks and verification challenges map to Not Checked (orange), while failures map to Error (red)—never Not Found.',
  },
  {
    step: '06',
    badgeClass: 'bg-slate-800 text-white',
    title: 'Display organized findings',
    summary:
      'Findings render as categorized platform cards with readable fields and per-tool summaries.',
    detail:
      'Every card links directly to the originating tool, scan duration, public URL when available, and structured details.',
  },
];

export function HowItWorksPage({ onStartNewScan }: HowItWorksPageProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-10 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold text-[#DC2626]">Workflow</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            How ClearTrace executes and normalizes email and phone investigations
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            A deterministic six-stage pipeline connecting authorized targets
            with structured multi-engine intelligence.
          </p>
        </div>

        <Button onClick={onStartNewScan}>
          <Play className="w-4 h-4" />
          <span>Start Investigation</span>
        </Button>
      </div>

      {/* 6-Step Visual Timeline */}
      <div className="space-y-4">
        {PIPELINE_STEPS.map((item, idx) => (
          <motion.div
            key={item.step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: idx * 0.04 }}
          >
            <Card className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-4 flex items-start gap-3">
                  <span
                    className={`font-mono text-xs font-semibold px-2.5 py-1.5 rounded-md shrink-0 ${item.badgeClass}`}
                  >
                    {item.step}
                  </span>
                  <h2 className="text-base font-semibold text-slate-900 leading-snug">
                    {item.title}
                  </h2>
                </div>

                <div className="md:col-span-8 space-y-1.5">
                  <p className="text-sm font-medium text-slate-800">
                    {item.summary}
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Normalization Diagram */}
      <Card className="p-6 space-y-5 bg-gradient-to-br from-rose-50/45 via-white to-orange-50/30">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            Signal Normalization Pipeline
          </h2>
          <p className="text-xs text-slate-500">
            How multi-engine investigation signals map to clear UI states.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-2 text-xs">
            <p className="font-semibold text-slate-900">
              1. Investigation Engines
            </p>
            <p className="font-mono text-[#DC2626]">MailAccess · Holehe</p>
            <p className="font-mono text-orange-700">Maigret · GHunt</p>
            <p className="font-mono text-slate-500">Blackbird · Sherlock (optional)</p>
          </div>

          <div className="flex flex-col items-center justify-center text-center gap-2 py-2">
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-[#DC2626]">
              <span>Normalization Engine</span>
              <ArrowRight className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 max-w-[220px]">
              Categorizes platform metadata, isolates rate limits and CAPTCHAs,
              and records exact scan timing.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-2 text-xs">
            <p className="font-semibold text-slate-900">2. Unified States</p>
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Found · Reported by a tool (unverified)</span>
            </div>
            <p className="text-slate-600 pl-5">Not Found · No match reported</p>
            <p className="text-amber-800 pl-5 font-medium">
              Not Checked · Rate-limited
            </p>
            <p className="text-rose-700 pl-5 font-medium">
              Error · Check failure
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
