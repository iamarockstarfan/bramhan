import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  FileJson,
  Keyboard,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { AppRoute, InvestigationRecord } from '@/src/types/investigation';

export interface CommandAction {
  id: string;
  group: 'Navigation' | 'Actions' | 'Recent Investigations';
  label: string;
  hint?: string;
  shortcut?: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: AppRoute) => void;
  onOpenShortcuts: () => void;
  onExportCurrentJson?: () => void;
  recentScans: InvestigationRecord[];
  onSelectScan: (scanId: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onOpenShortcuts,
  onExportCurrentJson,
  recentScans,
  onSelectScan,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const actions = useMemo<CommandAction[]>(() => {
    const base: CommandAction[] = [
      {
        id: 'act-new',
        group: 'Actions',
        label: 'Start New Investigation',
        hint: 'Enter an authorized email address and configure tools',
        shortcut: 'Ctrl + Enter',
        Icon: Search,
        onSelect: () => onNavigate('investigate'),
      },
      {
        id: 'act-shortcuts',
        group: 'Actions',
        label: 'View Keyboard Shortcuts',
        hint: 'Display shortcut reference dialog',
        shortcut: 'Ctrl + /',
        Icon: Keyboard,
        onSelect: onOpenShortcuts,
      },
      ...(onExportCurrentJson
        ? [
            {
              id: 'act-export',
              group: 'Actions' as const,
              label: 'Export Active Investigation JSON',
              hint: 'Download structured results payload',
              Icon: FileJson,
              onSelect: onExportCurrentJson,
            },
          ]
        : []),
      {
        id: 'nav-dashboard',
        group: 'Navigation',
        label: 'Go to Investigation Dashboard',
        hint: 'Overview metrics, activity chart, and recent scans',
        Icon: LayoutDashboard,
        onSelect: () => onNavigate('dashboard'),
      },
      {
        id: 'nav-tools',
        group: 'Navigation',
        label: 'Go to Individual Tool Details',
        hint: 'MailAccess, Holehe, Maigret, GHunt, Blackbird, Sherlock',
        Icon: Wrench,
        onSelect: () => onNavigate('tools'),
      },
      {
        id: 'nav-how',
        group: 'Navigation',
        label: 'Go to How It Works',
        hint: '6-step local execution & normalization pipeline',
        Icon: BookOpen,
        onSelect: () => onNavigate('how-it-works'),
      },
      {
        id: 'nav-privacy',
        group: 'Navigation',
        label: 'Go to Privacy & FAQ',
        hint: 'Responsible-use policy, local execution, and limitations',
        Icon: ShieldCheck,
        onSelect: () => onNavigate('privacy-faq'),
      },
    ];

    const scanActions: CommandAction[] = recentScans.slice(0, 5).map((scan) => ({
      id: `scan-${scan.scanId}`,
      group: 'Recent Investigations',
      label: scan.email,
      hint: `${scan.summary.found} found · ${scan.summary.total} checked`,
      Icon: ArrowRight,
      onSelect: () => onSelectScan(scan.scanId),
    }));

    return [...base, ...scanActions];
  }, [
    onNavigate,
    onOpenShortcuts,
    onExportCurrentJson,
    recentScans,
    onSelectScan,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.hint && a.hint.toLowerCase().includes(q)) ||
        a.group.toLowerCase().includes(q)
    );
  }, [actions, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(0);
    }
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length > 0 ? (prev + 1) % filtered.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length > 0
            ? (prev - 1 + filtered.length) % filtered.length
            : 0
        );
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].onSelect();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, filtered, activeIndex, onClose]);

  if (!open) return null;

  const groups: Array<CommandAction['group']> = [
    'Actions',
    'Recent Investigations',
    'Navigation',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-slate-900/30 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Menu"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-[0_20px_50px_rgba(15,23,42,0.16)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-[#DC2626] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search pages, actions, or recent investigations..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="font-mono text-[11px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No matching commands found for "{query}".
            </div>
          ) : (
            groups.map((group) => {
              const items = filtered.filter((i) => i.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-2 last:mb-0">
                  <p className="px-4 py-1.5 text-[11px] font-semibold text-slate-400">
                    {group}
                  </p>
                  {items.map((item) => {
                    const globalIdx = filtered.findIndex(
                      (f) => f.id === item.id
                    );
                    const isActive = globalIdx === activeIndex;
                    const Icon = item.Icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                        onClick={() => {
                          item.onSelect();
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-rose-50 text-[#DC2626]'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#DC2626]' : 'text-slate-400'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.label}
                            </p>
                            {item.hint && (
                              <p className="text-xs text-slate-500 truncate">
                                {item.hint}
                              </p>
                            )}
                          </div>
                        </div>
                        {item.shortcut && (
                          <kbd className="font-mono text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Use Up/Down arrows to navigate · Enter to run</span>
          <span className="font-mono">Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
