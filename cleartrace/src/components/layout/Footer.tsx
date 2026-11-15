import React from 'react';
import { AppRoute } from '@/src/types/investigation';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
  onOpenShortcuts: () => void;
  onOpenCommandPalette: () => void;
}

export function Footer({
  onNavigate,
  onOpenShortcuts,
  onOpenCommandPalette,
}: FooterProps) {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-md">
            <span className="font-display text-base font-bold text-slate-900">
              ClearTrace
            </span>
            <p className="text-xs text-slate-500 leading-relaxed">
              Legitimate digital footprint and email posture auditing for
              addresses you own or are explicitly authorized to inspect.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate('tools')}
              className="hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              Tools
            </button>
            <button
              type="button"
              onClick={() => onNavigate('how-it-works')}
              className="hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => onNavigate('privacy-faq')}
              className="hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              Privacy & FAQ
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-500">
          <span>ClearTrace · Authorized Email Intelligence Workspace</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="hover:text-slate-900 cursor-pointer"
            >
              Command Menu (<span className="font-mono">Ctrl + K</span>)
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="hover:text-slate-900 cursor-pointer"
            >
              Shortcuts (<span className="font-mono">Ctrl + /</span>)
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
