import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AppRoute } from '@/src/types/investigation';
import { Button } from '@/src/components/ui/Button';

interface TopNavProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onStartNewScan: () => void;
}

const NAV_LINKS: Array<{ route: AppRoute; label: string }> = [
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'tools', label: 'Tools' },
  { route: 'how-it-works', label: 'How It Works' },
  { route: 'privacy-faq', label: 'Privacy & FAQ' },
];

export function TopNav({
  currentRoute,
  onNavigate,
  onStartNewScan,
}: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onNavigate('landing');
            setMobileOpen(false);
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-[#DC2626] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded cursor-pointer"
        >
          ClearTrace
        </button>

        {/* Zone 2: 4 single-line text navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          {NAV_LINKS.map((item) => {
            const active = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded-sm ${
                  active
                    ? 'text-[#DC2626] border-[#DC2626]'
                    : 'border-transparent hover:text-slate-900 hover:border-rose-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            onClick={() => {
              onStartNewScan();
              setMobileOpen(false);
            }}
            className="hidden sm:inline-flex"
          >
            New Investigation
          </Button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={
              mobileOpen ? 'Close navigation menu' : 'Open navigation menu'
            }
            aria-expanded={mobileOpen}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-slate-900 cursor-pointer"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          <button
            type="button"
            onClick={() => {
              onNavigate('landing');
              setMobileOpen(false);
            }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
              currentRoute === 'landing'
                ? 'bg-rose-50 text-[#DC2626]'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Overview
          </button>
          {NAV_LINKS.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => {
                onNavigate(item.route);
                setMobileOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                currentRoute === item.route
                  ? 'bg-rose-50 text-[#DC2626]'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="pt-2">
            <Button
              className="w-full"
              onClick={() => {
                onStartNewScan();
                setMobileOpen(false);
              }}
            >
              New Investigation
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
