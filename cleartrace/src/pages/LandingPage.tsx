import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ChevronDown,
  Compass,
  Globe,
  Lock,
  Mail,
  Phone,
  Play,
  Radar,
  Search,
  Shield,
  ShieldCheck,
  Terminal,
  Fingerprint,
} from 'lucide-react';
import { INVESTIGATION_TOOLS } from '@/src/data/tools';
import { validateEmailAddress } from '@/src/lib/api';
import {
  AppRoute,
  ToolAvailabilityStatus,
  ToolId,
} from '@/src/types/investigation';
import { OsintRadar3D } from '@/src/components/three/OsintRadar3D';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ToolAvailabilityIndicator } from '@/src/components/ui/StatusIndicator';

interface LandingPageProps {
  onStartWithEmail: (email: string) => void;
  onNavigate: (route: AppRoute) => void;
  toolAvailability: Record<ToolId, ToolAvailabilityStatus>;
}

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

const HOW_IT_WORKS_STEPS = [
  {
    num: '01',
    badgeClass: 'bg-[#DC2626] text-white',
    title: 'Choose a Target',
    desc: 'Provide an email address or phone number you own or hold explicit permission to assess.',
  },
  {
    num: '02',
    badgeClass: 'bg-rose-700 text-white',
    title: 'Validate Input',
    desc: 'Validate the email or phone format and confirm authorization before any check runs.',
  },
  {
    num: '03',
    badgeClass: 'bg-orange-600 text-white',
    title: 'Select Engines',
    desc: 'Choose tools marked Available. Optional scanners stay disabled until configured.',
  },
  {
    num: '04',
    badgeClass: 'bg-amber-600 text-white',
    title: 'Run Live Scan',
    desc: 'Your investigation workspace dispatches checks and streams live engine progress.',
  },
  {
    num: '05',
    badgeClass: 'bg-emerald-600 text-white',
    title: 'Normalize Findings',
    desc: 'Raw platform responses map into unified Found, Not Found, Not Checked, or Error states.',
  },
  {
    num: '06',
    badgeClass: 'bg-slate-800 text-white',
    title: 'Review Organized Report',
    desc: 'Inspect categorized platform cards, expandable evidence, and exportable JSON.',
  },
];

const LANDING_FAQS = [
  {
    q: 'What targets am I permitted to investigate?',
    a: 'You may only scan an email address or phone number that belongs to you, your organization with written security authorization, or a target whose owner gave explicit consent.',
  },
  {
    q: 'How do engines like Holehe, Maigret, and GHunt process lookups?',
    a: 'Selected tools run locally but contact third-party services to perform checks. Your email or phone number may be sent to those services; ClearTrace does not sell scanned targets.',
  },
  {
    q: 'Why does ClearTrace separate "Not Checked" from "Not Found"?',
    a: 'When a platform enforces a CAPTCHA, times out, or applies rate limits, the result is inconclusive. Marking it as Not Checked or Error prevents false negative assumptions.',
  },
  {
    q: 'Can I customize which investigation engines run per scan?',
    a: 'Choose tools that support the selected target and are marked Available. Optional scanners, including PhoneInfoga, Ignorant, and DetectDee, appear once installed and configured.',
  },
];

export function LandingPage({
  onStartWithEmail,
  onNavigate,
  toolAvailability,
}: LandingPageProps) {
  const [heroEmail, setHeroEmail] = useState('');
  const [heroError, setHeroError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateEmailAddress(heroEmail);
    if (!res.valid) {
      setHeroError(res.reason || 'Invalid email address.');
      return;
    }
    setHeroError(null);
    onStartWithEmail(heroEmail.trim());
  };

  return (
    <div className="bg-[#F6F5F5]">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-rose-50/85 via-red-50/30 to-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="lg:col-span-7 flex flex-col justify-center space-y-6"
            >
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#DC2626]">
                  Authorized Email & Phone Intelligence
                </p>
                <h1
                  className="font-display font-bold tracking-tight text-slate-900 leading-[1.12]"
                  style={{
                    fontSize: 'clamp(2.25rem, 4vw, 3.35rem)',
                    textWrap: 'balance',
                  }}
                >
                  Audit your email and phone exposure with clear, qualified
                  signals.
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                  ClearTrace organizes results from locally available tools
                  such as MailAccess, Holehe, Maigret, GHunt, PhoneInfoga, and
                  Ignorant into a structured workspace.
                </p>
              </div>

              {/* Main Email Search Form */}
              <form
                onSubmit={handleHeroSubmit}
                className="space-y-2.5 max-w-xl"
              >
                <div className="p-1.5 rounded-xl bg-white border border-rose-200/80 shadow-[0_8px_28px_rgba(220,38,38,0.12)] flex flex-col sm:flex-row gap-2">
                  <label htmlFor="hero-email-input" className="sr-only">
                    Authorized email address
                  </label>
                  <input
                    id="hero-email-input"
                    type="email"
                    value={heroEmail}
                    onChange={(e) => {
                      setHeroEmail(e.target.value);
                      if (heroError) setHeroError(null);
                    }}
                    placeholder="Enter an authorized email address..."
                    className="flex-1 h-11 px-4 rounded-lg bg-transparent font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <Button type="submit" size="lg" className="h-11 px-6">
                    <Play className="w-4 h-4" />
                    <span>Start Investigation</span>
                  </Button>
                </div>

                {heroError ? (
                  <p className="text-xs text-rose-600 pl-1">{heroError}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pl-1">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#DC2626]" />
                      <span>Authorization attestation required</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => onNavigate('dashboard')}
                      className="text-[#DC2626] hover:underline font-medium cursor-pointer"
                    >
                      Open Investigation Dashboard
                    </button>
                  </div>
                )}
              </form>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
              className="lg:col-span-5 flex"
            >
              <div className="w-full min-h-[360px] lg:min-h-[400px] rounded-xl border border-rose-200/80 bg-[#FAF7F7] overflow-hidden shadow-[0_12px_32px_rgba(220,38,38,0.08)]">
                <OsintRadar3D />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold text-[#DC2626]">How It Works</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Six transparent steps from input to normalized evidence.
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('how-it-works')}
          >
            <span>Detailed Workflow</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
              whileHover={{ y: -2 }}
            >
              <Card className="p-5 space-y-3 h-full">
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-mono text-xs font-semibold ${step.badgeClass}`}
                >
                  {step.num}
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {step.desc}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Asymmetric Bento */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="space-y-2 max-w-2xl mb-10">
            <p className="text-xs font-semibold text-[#DC2626]">
              Platform Design
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Built for honest signal clarity, not noisy speculation.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28 }}
              className="lg:col-span-2"
            >
              <Card className="p-6 space-y-4 h-full bg-gradient-to-br from-white to-rose-50/25">
                <h3 className="text-base font-semibold text-slate-900">
                  Strict Four-State Result Normalization
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                  Every platform check resolves into one of four distinct states:
                  Found (soft green), Not Found (muted gray), Not Checked (soft
                  orange for rate limits or verification walls), and Error (soft
                  red for failed checks). Unverified checks never masquerade as
                  negative confirmations.
                </p>
                <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                    Found · Confirmed
                  </div>
                  <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                    Not Found · Absent
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                    Not Checked · Blocked
                  </div>
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                    Error · Check Fault
                  </div>
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28, delay: 0.06 }}
            >
              <Card className="p-6 space-y-3 h-full bg-gradient-to-br from-rose-50/60 via-white to-orange-50/40 border-rose-200/80">
                <h3 className="text-base font-semibold text-slate-900">
                  Keyboard-First Navigation
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Jump between dashboards, recent scans, and JSON exports using{' '}
                  <kbd className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-rose-200 text-slate-800">
                    Ctrl + K
                  </kbd>{' '}
                  or launch validated scans with{' '}
                  <kbd className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-rose-200 text-slate-800">
                    Ctrl + Enter
                  </kbd>
                  .
                </p>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Supported Investigation Engines */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold text-[#DC2626]">
              Supported Investigation Engines
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Ten specialized engines inside one unified workspace.
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('tools')}
          >
            <span>View All Engine Details</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INVESTIGATION_TOOLS.map((tool, index) => {
            const Icon = TOOL_ICON[tool.id];
            const availability =
              toolAvailability[tool.id] || tool.defaultAvailability;
            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.25, delay: index * 0.04 }}
                whileHover={{ y: -2 }}
              >
                <Card className="p-5 flex flex-col justify-between gap-4 h-full">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tool.accentBg} ${tool.accentText} ${tool.accentBorder}`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            {tool.name}
                          </h3>
                          <p className="text-xs text-slate-500">{tool.scope}</p>
                        </div>
                      </div>
                      <ToolAvailabilityIndicator availability={availability} />
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Privacy & Responsible Use */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-semibold text-[#DC2626]">
                Privacy & Governance
              </p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Responsible use and private custody by design.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                ClearTrace is built for self-audits, corporate account hygiene,
                and authorized security reviews. Scanned targets are not sold;
                the selected tools may contact third-party services to perform
                checks.
              </p>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('privacy-faq')}
                >
                  Read Privacy & Responsible Use Policy
                </Button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="p-5 space-y-1.5 bg-rose-50/35 border-rose-200/70">
                <h3 className="text-sm font-semibold text-slate-900">
                  Explicit Authorization Gate
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every scan requires user attestation confirming target
                  ownership or formal testing authorization prior to dispatch.
                </p>
              </Card>
              <Card className="p-5 space-y-1.5 bg-emerald-50/35 border-emerald-200/70">
                <h3 className="text-sm font-semibold text-slate-900">
                  Passive Lookups
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Supported tools query public sign-up and profile endpoints and
                  do not log in to or message the mailbox. Each tool still contacts
                  third-party sites, and results can be incomplete or wrong.
                </p>
              </Card>
              <Card className="p-5 space-y-1.5 bg-amber-50/35 border-amber-200/70">
                <h3 className="text-sm font-semibold text-slate-900">
                  Transparent Limitations
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Rate limits, verification walls, and unavailable checks are
                  surfaced explicitly as warnings or errors.
                </p>
              </Card>
              <Card className="p-5 space-y-1.5 bg-orange-50/35 border-orange-200/70">
                <h3 className="text-sm font-semibold text-slate-900">
                  Zero Fabrication Policy
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Platform cards only display structured metadata returned from
                  real investigation runs—never guessed profile summaries.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center space-y-2 mb-10">
          <p className="text-xs font-semibold text-[#DC2626]">FAQ</p>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Common questions about authorized footprint checks
          </h2>
        </div>

        <div className="space-y-3">
          {LANDING_FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <Card key={faq.q} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-rose-50/30 transition-colors cursor-pointer"
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#DC2626]' : 'text-slate-400'
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
