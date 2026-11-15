import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Lock, Search, ShieldCheck } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';

const FAQ_ITEMS = [
  {
    category: 'Authorization & Legal Use',
    q: 'Who is permitted to use ClearTrace?',
    a: 'ClearTrace is designed for individuals auditing their own email or phone footprint, security analysts checking organization-owned targets, and authorized assessors operating with explicit permission from the owner.',
  },
  {
    category: 'Privacy & Custody',
    q: 'Are investigated targets shared with third parties?',
    a: 'ClearTrace does not sell scanned targets, and scan history stays in memory on this computer (or on disk only if you enable PERSIST_HISTORY). Locally run tools contact third-party websites to perform checks, so your email address or phone number and derived username may be sent to those services.',
  },
  {
    category: 'Privacy & Custody',
    q: 'Does running Holehe notify the mailbox owner with password reset emails?',
    a: 'Holehe is designed to use sign-up and recovery checks that do not send emails, but behavior varies by site and can change, so a notification cannot be fully ruled out.',
  },
  {
    category: 'Accuracy & Limitations',
    q: 'Why can Maigret or Sherlock produce handle collisions?',
    a: 'Handle-based engines extract the username prefix before the @ symbol and look up that handle on public communities. Identical usernames on different platforms may belong to unrelated people.',
  },
  {
    category: 'Accuracy & Limitations',
    q: 'What does "Not Checked" mean compared to "Not Found"?',
    a: 'Not Found means the tool saw no match; it is not proof that no account exists. Not Checked means a rate limit, CAPTCHA, or timeout prevented an answer.',
  },
  {
    category: 'Engine Reliability',
    q: 'Why can an individual check return an Error status?',
    a: 'If an upstream endpoint is temporarily unreachable or an engine credential requires refresh, ClearTrace surfaces an explicit Error status rather than failing silently.',
  },
];

export function PrivacyFaqPage() {
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-4">
      <div className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold text-[#DC2626]">
          Governance & Transparency
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
          Privacy, Responsible Use & Frequently Asked Questions
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
          ClearTrace is engineered for legitimate email/phone hygiene and authorized
          digital footprint verification—with strict guardrails against
          unverified conclusions.
        </p>
      </div>

      {/* Responsible Use & Privacy Principles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <Card className="p-6 space-y-2.5 h-full bg-rose-50/45 border-rose-200/80">
            <span className="w-9 h-9 rounded-lg bg-[#DC2626] text-white flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">
              Explicit Authorization Only
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every investigation requires user confirmation that the target
              email address or phone number is self-owned or formally authorized
              for security assessment.
            </p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.05 }}
        >
          <Card className="p-6 space-y-2.5 h-full bg-emerald-50/40 border-emerald-200/80">
            <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">
              Private Execution Custody
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Investigation engines run inside your connected workspace.
              ClearTrace maintains no external database of scanned addresses.
            </p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.1 }}
        >
          <Card className="p-6 space-y-2.5 h-full bg-orange-50/40 border-orange-200/80">
            <span className="w-9 h-9 rounded-lg bg-orange-600 text-white flex items-center justify-center">
              <Search className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">
              Honest Signal Limitations
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Rate-limited endpoints, CAPTCHAs, and incomplete checks are
              surfaced transparently as Not Checked or Error—never hidden.
            </p>
          </Card>
        </motion.div>
      </div>

      {/* Searchable FAQ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Frequently Asked Questions
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search privacy or engine questions..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No FAQ entries match "{search}".
            </Card>
          ) : (
            filteredFaqs.map((item, idx) => {
              const isOpen = openIndex === idx;
              return (
                <Card key={item.q} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-rose-50/30 transition-colors cursor-pointer"
                  >
                    <div>
                      <p className="text-[11px] font-semibold text-[#DC2626]">
                        {item.category}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        {item.q}
                      </p>
                    </div>
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
                        <div className="px-5 pb-4 pt-3 border-t border-slate-100 text-sm text-slate-600 leading-relaxed">
                          {item.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
