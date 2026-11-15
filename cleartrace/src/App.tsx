import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Menu, Terminal } from 'lucide-react';
import {
  fetchInvestigationById,
  fetchInvestigations,
  fetchToolsHealth,
  toApiContractJson,
} from '@/src/lib/api';
import {
  AppRoute,
  InvestigationRecord,
  ToolAvailabilityStatus,
  ToolId,
} from '@/src/types/investigation';
import { Footer } from '@/src/components/layout/Footer';
import { TopNav } from '@/src/components/layout/TopNav';
import { WorkspaceSidebar } from '@/src/components/layout/WorkspaceSidebar';
import { CommandPalette } from '@/src/components/overlays/CommandPalette';
import { KeyboardShortcutsModal } from '@/src/components/overlays/KeyboardShortcutsModal';
import { Button } from '@/src/components/ui/Button';
import { ToastContainer, ToastItem } from '@/src/components/ui/Toast';
import { DashboardPage } from '@/src/pages/DashboardPage';
import { HowItWorksPage } from '@/src/pages/HowItWorksPage';
import { InvestigatePage } from '@/src/pages/InvestigatePage';
import { LandingPage } from '@/src/pages/LandingPage';
import { PrivacyFaqPage } from '@/src/pages/PrivacyFaqPage';
import { ResultsPage } from '@/src/pages/ResultsPage';
import { ToolsPage } from '@/src/pages/ToolsPage';
import { INVESTIGATION_TOOLS } from '@/src/data/tools';

const WORKSPACE_ROUTES: AppRoute[] = [
  'dashboard',
  'investigate',
  'results',
  'tools',
];

const ROUTE_TITLES: Record<AppRoute, string> = {
  landing: 'Overview',
  dashboard: 'Dashboard',
  investigate: 'New Investigation',
  results: 'Investigation Results',
  tools: 'Tool Details',
  'how-it-works': 'How It Works',
  'privacy-faq': 'Privacy & FAQ',
};

const DEFAULT_TOOL_AVAILABILITY = Object.fromEntries(
  INVESTIGATION_TOOLS.map((tool) => [tool.id, tool.defaultAvailability])
) as Record<ToolId, ToolAvailabilityStatus>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>('landing');
  const [investigations, setInvestigations] = useState<InvestigationRecord[]>(
    []
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  const [toolAvailability, setToolAvailability] = useState<
    Record<ToolId, ToolAvailabilityStatus>
  >(DEFAULT_TOOL_AVAILABILITY);

  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [activeScanDetail, setActiveScanDetail] =
    useState<InvestigationRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [prefillEmail, setPrefillEmail] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileWorkspaceDrawer, setMobileWorkspaceDrawer] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const loadToolsHealth = useCallback(async () => {
    try {
      const map = await fetchToolsHealth();
      setToolAvailability((prev) => ({ ...prev, ...map }));
    } catch {
      // Keep default availability map until backend /api/tools/health is online
    }
  }, []);

  const loadInvestigations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const list = await fetchInvestigations();
      setInvestigations(list);
    } catch {
      // Keep current list cleanly when backend has not yet returned history
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToolsHealth();
    loadInvestigations();
  }, [loadToolsHealth, loadInvestigations]);

  const loadScanDetail = useCallback(
    async (scanId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const record = await fetchInvestigationById(scanId);
        setActiveScanDetail(record);
        setInvestigations((prev) => {
          const exists = prev.some((i) => i.scanId === record.scanId);
          return exists
            ? prev.map((i) => (i.scanId === record.scanId ? record : i))
            : [record, ...prev];
        });
      } catch (err) {
        const fallback = investigations.find((i) => i.scanId === scanId) || null;
        if (fallback) {
          setActiveScanDetail(fallback);
        } else {
          setDetailError(
            err instanceof Error
              ? err.message
              : `Unable to load /api/investigations/${scanId}`
          );
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [investigations]
  );

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    setMobileWorkspaceDrawer(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const activeInvestigation = useMemo(() => {
    if (activeScanDetail && activeScanDetail.scanId === activeScanId) {
      return activeScanDetail;
    }
    return (
      investigations.find((inv) => inv.scanId === activeScanId) ||
      activeScanDetail ||
      null
    );
  }, [investigations, activeScanId, activeScanDetail]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShortcutsOpen(false);
        setCommandOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setCommandOpen(false);
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartWithEmail = (email: string) => {
    setPrefillEmail(email);
    navigate('investigate');
  };

  const handleScanComplete = (
    record: InvestigationRecord,
    navigateToResults = true
  ) => {
    setInvestigations((prev) => {
      const filtered = prev.filter((i) => i.scanId !== record.scanId);
      return [record, ...filtered];
    });
    setActiveScanId(record.scanId);
    setActiveScanDetail(record);
    setDetailError(null);
    if (navigateToResults) navigate('results');
  };

  const handleOpenInvestigation = (scanId: string) => {
    setActiveScanId(scanId);
    navigate('results');
    loadScanDetail(scanId);
  };

  const handleExportActiveJson = activeInvestigation
    ? () => {
        const payload = JSON.stringify(
          toApiContractJson(activeInvestigation),
          null,
          2
        );
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeInvestigation.scanId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        notify({
          type: 'success',
          title: 'Exported JSON Results',
          message: `Downloaded ${activeInvestigation.scanId}.json`,
        });
      }
    : undefined;

  const isWorkspaceRoute = WORKSPACE_ROUTES.includes(route);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5F5] text-[#111827]">
      {isWorkspaceRoute ? (
        <div className="flex flex-1 min-h-screen">
          <WorkspaceSidebar
            currentRoute={route}
            onNavigate={navigate}
            onOpenCommandPalette={() => setCommandOpen(true)}
            hasActiveResult={Boolean(activeInvestigation)}
          />

          <div className="flex-1 flex flex-col min-w-0">
            {/* Workspace Top Bar */}
            <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileWorkspaceDrawer((prev) => !prev)}
                  aria-label="Toggle workspace navigation"
                  className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-rose-50 cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <nav
                  aria-label="Breadcrumb"
                  className="flex items-center gap-2 text-sm min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => navigate('landing')}
                    className="text-slate-500 hover:text-[#DC2626] truncate cursor-pointer"
                  >
                    ClearTrace
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    /
                  </span>
                  <span className="font-semibold text-slate-900 truncate">
                    {ROUTE_TITLES[route]}
                  </span>
                </nav>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCommandOpen(true)}
                  className="hidden sm:inline-flex"
                >
                  <Terminal className="w-3.5 h-3.5 text-[#DC2626]" />
                  <span>Command</span>
                  <kbd className="font-mono text-[11px] text-slate-400">
                    Ctrl K
                  </kbd>
                </Button>
                {route !== 'investigate' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setPrefillEmail('');
                      navigate('investigate');
                    }}
                  >
                    New Investigation
                  </Button>
                )}
              </div>
            </header>

            {mobileWorkspaceDrawer && (
              <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1">
                {(
                  [
                    { route: 'dashboard', label: 'Dashboard' },
                    { route: 'investigate', label: 'New Investigation' },
                    { route: 'results', label: 'Results Explorer' },
                    { route: 'tools', label: 'Tool Details' },
                    { route: 'how-it-works', label: 'How It Works' },
                    { route: 'privacy-faq', label: 'Privacy & FAQ' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                      route === item.route
                        ? 'bg-rose-50 text-[#DC2626]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <motion.div
                key={route}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                  {route === 'dashboard' && (
                    <DashboardPage
                      investigations={investigations}
                      isLoading={historyLoading}
                      toolAvailability={toolAvailability}
                      onRefresh={() => {
                        loadToolsHealth();
                        loadInvestigations();
                      }}
                      onStartQuickScan={handleStartWithEmail}
                      onOpenInvestigation={handleOpenInvestigation}
                      onNavigate={navigate}
                    />
                  )}

                  {route === 'investigate' && (
                    <InvestigatePage
                      initialEmail={prefillEmail}
                      toolAvailability={toolAvailability}
                      onScanComplete={handleScanComplete}
                      onNotify={notify}
                    />
                  )}

                  {route === 'results' && (
                    <ResultsPage
                      investigation={activeInvestigation}
                      isLoading={detailLoading}
                      error={detailError}
                      toolAvailability={toolAvailability}
                      onRetry={() => {
                        if (activeScanId) loadScanDetail(activeScanId);
                      }}
                      onBackToDashboard={() => navigate('dashboard')}
                      onStartNewScan={() => {
                        setPrefillEmail('');
                        navigate('investigate');
                      }}
                      onNotify={notify}
                    />
                  )}

                  {route === 'tools' && (
                    <ToolsPage
                      activeInvestigation={activeInvestigation}
                      toolAvailability={toolAvailability}
                      onRefreshHealth={async () => {
                        await loadToolsHealth();
                        notify({
                          type: 'info',
                          title: 'Engine status refreshed',
                        });
                      }}
                      onStartNewScan={() => {
                        setPrefillEmail('');
                        navigate('investigate');
                      }}
                    />
                  )}
              </motion.div>
            </main>
          </div>
        </div>
      ) : (
        <>
          <TopNav
            currentRoute={route}
            onNavigate={navigate}
            onStartNewScan={() => {
              setPrefillEmail('');
              navigate('investigate');
            }}
          />

          <main className="flex-1">
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
                {route === 'landing' && (
                  <LandingPage
                    onStartWithEmail={handleStartWithEmail}
                    onNavigate={navigate}
                    toolAvailability={toolAvailability}
                  />
                )}

                {route === 'how-it-works' && (
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <HowItWorksPage
                      onStartNewScan={() => {
                        setPrefillEmail('');
                        navigate('investigate');
                      }}
                    />
                  </div>
                )}

                {route === 'privacy-faq' && (
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <PrivacyFaqPage />
                  </div>
                )}
            </motion.div>
          </main>

          <Footer
            onNavigate={navigate}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenCommandPalette={() => setCommandOpen(true)}
          />
        </>
      )}

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigate}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onExportCurrentJson={handleExportActiveJson}
        recentScans={investigations}
        onSelectScan={handleOpenInvestigation}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
      />
    </div>
  );
}
