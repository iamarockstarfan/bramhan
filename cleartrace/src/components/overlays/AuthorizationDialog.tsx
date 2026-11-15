import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { TOOL_BY_ID } from '@/src/data/tools';
import { InvestigationTargetType, MatchScope, ToolId } from '@/src/types/investigation';
import { Button } from '@/src/components/ui/Button';
import { Dialog } from '@/src/components/ui/Dialog';

interface AuthorizationDialogProps {
  open: boolean;
  emails: string[];
  selectedTools: ToolId[];
  matchScope: MatchScope;
  targetType: InvestigationTargetType;
  onClose: () => void;
  onConfirm: () => void;
}

export function AuthorizationDialog({
  open,
  emails,
  selectedTools,
  matchScope,
  targetType,
  onClose,
  onConfirm,
}: AuthorizationDialogProps) {
  const [attested, setAttested] = useState(false);
  const isBatch = emails.length > 1;
  const targetLabel = targetType === 'email' ? 'email address' : 'phone number';

  useEffect(() => {
    if (open) {
      setAttested(false);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isBatch ? 'Confirm Batch Investigation Authorization' : 'Confirm Investigation Authorization'}
      description={`ClearTrace may only be used for ${targetType === 'email' ? 'email addresses' : 'phone numbers'} you own or are explicitly authorized to assess.`}
    >
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-sm">
          <div className="space-y-2">
            <span className="text-slate-500">
              {isBatch ? `Target ${targetType === 'email' ? 'Emails' : 'Phone Numbers'} (${emails.length})` : `Target ${targetType === 'email' ? 'Email' : 'Phone Number'}`}
            </span>
            <ul className="max-h-28 space-y-1 overflow-y-auto font-mono font-medium text-slate-900 break-all">
              {emails.map((email) => <li key={email}>{email}</li>)}
            </ul>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="text-slate-500 shrink-0">Selected Engines</span>
            <span className="text-right text-slate-800 font-medium">
              {selectedTools.map((id) => TOOL_BY_ID[id]?.name || id).join(', ')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            {targetType === 'email' && (
              <>
                <span className="text-slate-500 shrink-0">Match Scope</span>
                <span className="text-right text-slate-800 font-medium">
                  {matchScope === 'email' ? 'Email-linked only' : 'Email + username'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>
            Only continue if you own {isBatch ? `every listed ${targetLabel}` : `this ${targetLabel}`} or have explicit permission to assess it.
          </span>
        </div>

        {selectedTools.includes('hibp') && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-900">
            The target email address will be sent from the ClearTrace server to Have I Been Pwned for this check. Your HIBP API key remains on the server.
          </p>
        )}

        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-rose-50/40 cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#DC2626] focus:ring-[#DC2626]"
          />
          <span className="text-sm text-slate-700 leading-snug">
            {isBatch
              ? `I confirm that I own every listed ${targetLabel} or have permission to assess it.`
              : <>I confirm that I own this {targetLabel} or have permission to assess it: <span className="font-mono">{emails[0]}</span>.</>}
          </span>
        </label>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!attested} onClick={onConfirm}>
            {isBatch ? `Confirm & Scan ${emails.length} ${targetType === 'email' ? 'Emails' : 'Phone Numbers'}` : 'Confirm & Start Scan'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
