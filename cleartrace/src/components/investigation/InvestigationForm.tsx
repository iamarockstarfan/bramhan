import React from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  Compass,
  Globe,
  Lock,
  Mail,
  Play,
  Phone,
  Radar,
  Search,
  Fingerprint,
  Shield,
  ShieldCheck,
  Terminal,
  Upload,
} from 'lucide-react';
import { INVESTIGATION_TOOLS } from '@/src/data/tools';
import { MAX_EMAIL_BATCH_SIZE, validateEmailAddress } from '@/src/lib/api';
import { InvestigationTargetType, MatchScope, ToolAvailabilityStatus, ToolId } from '@/src/types/investigation';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ToolAvailabilityIndicator } from '@/src/components/ui/StatusIndicator';

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

interface InvestigationFormProps {
  targetType: InvestigationTargetType;
  onTargetTypeChange: (type: InvestigationTargetType) => void;
  phoneCountryCode: string;
  onPhoneCountryCodeChange: (value: string) => void;
  email: string;
  onEmailChange: (email: string) => void;
  batchEmails: string[];
  onBatchEmailsImport: (emails: string[]) => void;
  selectedTools: ToolId[];
  onToggleTool: (tool: ToolId) => void;
  onSelectCoreTools: () => void;
  matchScope: MatchScope;
  onMatchScopeChange: (scope: MatchScope) => void;
  onSubmit: (mode: 'single' | 'batch') => void;
  toolAvailability: Record<ToolId, ToolAvailabilityStatus>;
  isSubmitting?: boolean;
  compact?: boolean;
}

export function InvestigationForm({
  targetType,
  onTargetTypeChange,
  phoneCountryCode,
  onPhoneCountryCodeChange,
  email,
  onEmailChange,
  batchEmails,
  onBatchEmailsImport,
  selectedTools,
  onToggleTool,
  onSelectCoreTools,
  matchScope,
  onMatchScopeChange,
  onSubmit,
  toolAvailability,
  isSubmitting = false,
  compact = false,
}: InvestigationFormProps) {
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'single' | 'batch'>('single');
  const phoneDigits = email.replace(/\D/g, '');
  const countryCodeDigits = phoneCountryCode.replace(/\D/g, '');
  const validation = targetType === 'email'
    ? validateEmailAddress(email)
    : /^\+[1-9]\d{0,2}$/.test(phoneCountryCode) &&
      /^\d{4,14}$/.test(phoneDigits) &&
      phoneDigits.length + countryCodeDigits.length <= 15
      ? { valid: true }
      : { valid: false, reason: 'Enter a country calling code and a phone number that fits the 15-digit international limit.' };
  const showValidationError = email.trim().length > 0 && !validation.valid;
  const ghuntAvailability =
    toolAvailability.ghunt ||
    INVESTIGATION_TOOLS.find((tool) => tool.id === 'ghunt')?.defaultAvailability;
  const ghuntAvailable = ghuntAvailability !== 'unavailable';
  const usableCount = selectedTools.filter((tool) =>
    INVESTIGATION_TOOLS.find((t) => t.id === tool)?.inputTypes.includes(targetType) &&
    (toolAvailability[tool] || INVESTIGATION_TOOLS.find((t) => t.id === tool)?.defaultAvailability) !== 'unavailable' &&
    (targetType === 'phone' || matchScope === 'email_and_username' || (tool !== 'maigret' && tool !== 'sherlock'))
  ).length;
  const canSubmit = activeTab === 'single'
    ? validation.valid && usableCount > 0 && !isSubmitting
    : targetType === 'email' && batchEmails.length > 0 && ghuntAvailable && !isSubmitting;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setFileError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setFileError('Choose a .txt file containing one or more email addresses.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setFileError('The text file must be smaller than 1 MB.');
      return;
    }

    try {
      const entries = (await file.text()).split(/[\s,;]+/).filter(Boolean);
      if (entries.length === 0) {
        setFileError('The text file does not contain any email addresses.');
        return;
      }

      const invalid = entries.filter((entry) => !validateEmailAddress(entry).valid);
      if (invalid.length > 0) {
        setFileError(`Invalid email address${invalid.length > 1 ? 'es' : ''}: ${invalid.slice(0, 3).join(', ')}`);
        return;
      }

      const uniqueEmails = [...new Map(
        entries.map((entry) => [entry.toLowerCase(), entry.trim()])
      ).values()];
      if (uniqueEmails.length > MAX_EMAIL_BATCH_SIZE) {
        setFileError(`Upload a text file with no more than ${MAX_EMAIL_BATCH_SIZE} unique email addresses.`);
        return;
      }
      onBatchEmailsImport(uniqueEmails);
    } catch (error) {
      setFileError(
        error instanceof Error ? `Could not read the file: ${error.message}` : 'Could not read the selected file.'
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      onSubmit(activeTab);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(activeTab);
      }}
      onKeyDown={handleKeyDown}
      className="space-y-6"
    >
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Investigation target type">
        {(['email', 'phone'] as const).map((type) => (
          <button
            key={type}
            type="button"
            disabled={isSubmitting}
            aria-pressed={targetType === type}
            onClick={() => {
              onTargetTypeChange(type);
              if (type === 'phone') setActiveTab('single');
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              targetType === type ? 'bg-rose-50 text-[#DC2626]' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {type === 'email' ? 'Email scan' : 'Phone scan'}
          </button>
        ))}
      </div>

      {targetType === 'email' && (
      <div role="tablist" aria-label="Investigation input method" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'single'}
          disabled={isSubmitting}
          onClick={() => setActiveTab('single')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'single' ? 'bg-rose-50 text-[#DC2626]' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Single email
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'batch'}
          disabled={isSubmitting}
          onClick={() => setActiveTab('batch')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'batch' ? 'bg-rose-50 text-[#DC2626]' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          File upload
        </button>
      </div>
      )}

      {activeTab === 'single' || targetType === 'phone' ? (
      <Card className="p-6 border-slate-200 shadow-[0_6px_24px_rgba(220,38,38,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-[#DC2626] text-white font-mono text-xs font-semibold flex items-center justify-center">
              01
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              {targetType === 'email' ? 'Enter an authorized email address' : 'Enter an authorized phone number'}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="w-3.5 h-3.5 text-[#DC2626]" />
            <span>Ownership or explicit consent required</span>
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {targetType === 'phone' && (
            <div className="sm:w-36">
              <label htmlFor="phone-country-code" className="sr-only">Country calling code</label>
              <input
                id="phone-country-code"
                type="tel"
                autoComplete="tel-country-code"
                value={phoneCountryCode}
                onChange={(e) => onPhoneCountryCodeChange(e.target.value)}
                placeholder="+1"
                aria-label="Country calling code"
                className="w-full h-11 px-4 rounded-lg border border-slate-200 bg-white font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-[#DC2626]"
              />
            </div>
          )}
          <div className="flex-1">
            <label htmlFor="target-email" className="sr-only">
              {targetType === 'email' ? 'Authorized email address' : 'Phone number without country code'}
            </label>
            <input
              id="target-email"
              type={targetType === 'email' ? 'email' : 'tel'}
              autoComplete={targetType === 'email' ? 'email' : 'tel-national'}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder={targetType === 'email' ? 'name@company.com' : '2025550123'}
              aria-invalid={showValidationError}
              aria-label={targetType === 'email' ? 'Authorized email address' : 'Phone number without country code'}
              className={`w-full h-11 px-4 rounded-lg border bg-white font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                showValidationError
                  ? 'border-rose-300 focus:ring-rose-200 focus:border-rose-500'
                  : 'border-slate-200 focus:ring-rose-100 focus:border-[#DC2626]'
              }`}
            />
          </div>
          <Button type="submit" size="lg" disabled={!canSubmit}>
            <Play className="w-4 h-4" />
            <span>{isSubmitting ? 'Starting...' : 'Start Investigation'}</span>
          </Button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 min-h-[20px]">
          {showValidationError ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-rose-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{validation.reason}</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              {targetType === 'email'
                ? 'Enter one email address you own to scan across the selected engines.'
                : 'Enter the country calling code and number for a phone you own or are authorized to assess.'}
            </p>
          )}
          <span className="text-xs text-slate-400">
            Press <kbd className="font-mono text-slate-500">Ctrl + Enter</kbd>{' '}
            to start
          </span>
        </div>

      </Card>
      ) : (
      <Card className="p-6 border-slate-200 shadow-[0_6px_24px_rgba(220,38,38,0.06)]">
        <div className="flex items-start gap-3 mb-4">
          <Upload className="mt-0.5 h-5 w-5 text-[#DC2626]" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Upload an authorized email list</h2>
            <p className="mt-1 text-xs text-slate-500">
              This tab runs GHunt only, starts with 5 scans and adapts up to 50 based on speed and rate limits. Results appear together after every scan finishes.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-rose-200 hover:bg-rose-50/40 cursor-pointer">
            <Upload className="w-4 h-4 text-[#DC2626]" />
            <span>Select .txt file</span>
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="sr-only"
              aria-label="Upload a text file containing authorized email addresses"
            />
          </label>
          <p className="mt-1.5 text-xs text-slate-500">
            Up to {MAX_EMAIL_BATCH_SIZE} unique addresses, one per line or separated with commas or spaces.
          </p>
          {!ghuntAvailable && (
            <p role="alert" className="text-xs text-rose-600">
              GHunt is unavailable. Check its setup on the Tools page before starting this batch.
            </p>
          )}
          {fileError && (
            <p role="alert" className="mt-2 text-xs text-rose-600">{fileError}</p>
          )}
          {batchEmails.length > 0 && (
            <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50/50 p-3">
              <p className="text-xs font-medium text-slate-700">
                {batchEmails.length} email{batchEmails.length === 1 ? '' : 's'} loaded for separate scans
              </p>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto font-mono text-xs text-slate-600">
                {batchEmails.map((address) => <li key={address}>{address}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="text-xs text-slate-500">
              {batchEmails.length > 0
                ? `Ready to run ${batchEmails.length} GHunt scan${batchEmails.length === 1 ? '' : 's'} with up to 50 in parallel.`
                : 'Choose a text file to continue.'}
            </span>
            <Button type="submit" disabled={!canSubmit}>
              <Play className="w-4 h-4" />
              <span>{isSubmitting ? 'Starting...' : `Review ${batchEmails.length || ''} GHunt Scan${batchEmails.length === 1 ? '' : 's'}`}</span>
            </Button>
          </div>
        </div>
      </Card>
      )}

      {/* Step 2: Tool Selection */}
      {!compact && (activeTab === 'single' || targetType === 'phone') && (
        <Card className="p-6">
          {targetType === 'email' && (
          <fieldset className="mb-5">
            <legend className="text-sm font-semibold text-slate-900">
              Match scope
            </legend>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              Choose whether to run only checks tied to the email address or also search the username before @.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                matchScope === 'email'
                  ? 'border-[#DC2626] bg-rose-50/50'
                  : 'border-slate-200 bg-white'
              }`}>
                <input
                  type="radio"
                  name="match-scope"
                  value="email"
                  checked={matchScope === 'email'}
                  onChange={() => onMatchScopeChange('email')}
                  className="mt-0.5 accent-[#DC2626]"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Email-linked only</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Recommended. Limits MailAccess to email-focused modules and skips username-only engines.</span>
                </span>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                matchScope === 'email_and_username'
                  ? 'border-[#DC2626] bg-rose-50/50'
                  : 'border-slate-200 bg-white'
              }`}>
                <input
                  type="radio"
                  name="match-scope"
                  value="email_and_username"
                  checked={matchScope === 'email_and_username'}
                  onChange={() => onMatchScopeChange('email_and_username')}
                  className="mt-0.5 accent-[#DC2626]"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Email + username</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Uses full MailAccess scope and can include Maigret/Sherlock guesses.</span>
                </span>
              </label>
            </div>
          </fieldset>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-rose-700 text-white font-mono text-xs font-semibold flex items-center justify-center">
                02
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Select investigation engines
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 tabular-nums">
                {selectedTools.length} selected
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSelectCoreTools}
              >
                {targetType === 'phone' ? 'Select Phone Engines' : 'Select Core Engines'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {INVESTIGATION_TOOLS.filter((tool) => tool.inputTypes.includes(targetType)).map((tool) => {
              const availability =
                toolAvailability[tool.id] || tool.defaultAvailability;
              const isUnavailable = availability === 'unavailable';
              const selected = selectedTools.includes(tool.id);
              const Icon = TOOL_ICON[tool.id];

              return (
                <motion.button
                  key={tool.id}
                  type="button"
                  disabled={isUnavailable && !selected}
                  whileHover={isUnavailable ? undefined : { y: -2 }}
                  whileTap={isUnavailable ? undefined : { scale: 0.99 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onToggleTool(tool.id)}
                  className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                    isUnavailable
                      ? 'bg-slate-50/70 border-slate-200 opacity-65 cursor-not-allowed'
                      : selected
                      ? 'bg-rose-50/50 border-[#DC2626] shadow-[0_4px_14px_rgba(220,38,38,0.1)] cursor-pointer'
                      : 'bg-white border-slate-200 hover:border-rose-200 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 w-full">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${tool.accentBg} ${tool.accentText} ${tool.accentBorder}`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="text-sm font-semibold text-slate-900">
                          {tool.name}
                        </span>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {tool.scope}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <ToolAvailabilityIndicator availability={availability} />
                      <span
                        className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                          isUnavailable
                            ? 'bg-slate-100 border-slate-200 text-transparent'
                            : selected
                            ? 'bg-[#DC2626] border-[#DC2626] text-white'
                            : 'bg-white border-slate-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed pl-12">
                    {tool.description}
                  </p>
                </motion.button>
              );
            })}
          </div>

          {targetType === 'email' && matchScope === 'email' && (
            <p className="mt-3 text-xs text-slate-500">
              Maigret and Sherlock are skipped in this mode. MailAccess also excludes username, local-part, and pivot modules.
            </p>
          )}

          {usableCount === 0 && (
            <p className="mt-3 text-xs text-rose-600">
              {targetType === 'phone'
                ? 'Select at least one available phone engine. Install PhoneInfoga or Ignorant, or configure DetectDee on the Tools page.'
                : matchScope === 'email'
                ? 'Select at least one available email-linked engine. Maigret and Sherlock require Email + username mode.'
                : 'Select at least one available engine to begin an investigation. Engines marked unavailable are not installed — see the Tools page.'}
            </p>
          )}
        </Card>
      )}
    </form>
  );
}
