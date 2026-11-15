import React from 'react';
import {
  BookOpen,
  FileSearch,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Terminal,
  Wrench,
} from 'lucide-react';
import { AppRoute } from '@/src/types/investigation';

interface WorkspaceSidebarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenCommandPalette: () => void;
  hasActiveResult: boolean;
}

export function WorkspaceSidebar({
  currentRoute,
  onNavigate,
  onOpenCommandPalette,
  hasActiveResult,
}: WorkspaceSidebarProps) {
  const workspaceItems: Array<{
    route: AppRoute;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
  }> = [
    { route: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { route: 'investigate', label: 'New Investigation', Icon: Search },
    {
      route: 'results',
      label: 'Results Explorer',
      Icon: FileSearch,
      disabled: !hasActiveResult,
    },
    { route: 'tools', label: 'Tool Details', Icon: Wrench },
  ];

  const docItems: Array<{
    route: AppRoute;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { route: 'how-it-works', label: 'How It Works', Icon: BookOpen },
    { route: 'privacy-faq', label: 'Privacy & FAQ', Icon: ShieldCheck },
  ];

  return (
    <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-white border-r border-slate-200 min-h-screen">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 hover:text-[#DC2626] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          ClearTrace
        </button>
      </div>

      <div className="p-4">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-600 bg-slate-50 hover:bg-rose-50/70 hover:border-rose-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-[#DC2626]" />
            <span>Quick search...</span>
          </span>
          <kbd className="font-mono text-[11px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
            Ctrl K
          </kbd>
        </button>
      </div>

      <nav
        className="flex-1 px-3 space-y-6 overflow-y-auto"
        aria-label="Workspace navigation"
      >
        <div>
          <p className="px-3 mb-2 text-[11px] font-semibold text-slate-400">
            Investigation Workspace
          </p>
          <div className="space-y-1">
            {workspaceItems.map(({ route, label, Icon, disabled }) => {
              const active = currentRoute === route;
              return (
                <button
                  key={route}
                  type="button"
                  disabled={disabled}
                  onClick={() => onNavigate(route)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    disabled
                      ? 'text-slate-300 cursor-not-allowed'
                      : active
                      ? 'bg-[#DC2626] text-white shadow-[0_2px_6px_rgba(220,38,38,0.28)] cursor-pointer'
                      : 'text-slate-600 hover:bg-rose-50/60 hover:text-slate-900 cursor-pointer'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-3 mb-2 text-[11px] font-semibold text-slate-400">
            Resources
          </p>
          <div className="space-y-1">
            {docItems.map(({ route, label, Icon }) => {
              const active = currentRoute === route;
              return (
                <button
                  key={route}
                  type="button"
                  onClick={() => onNavigate(route)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-rose-50 text-[#DC2626]'
                      : 'text-slate-600 hover:bg-rose-50/60 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200 bg-rose-50/30 text-xs text-slate-500 leading-relaxed">
        Authorized checks only. Tools execute directly on your connected host.
      </div>
    </aside>
  );
}
