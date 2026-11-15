import React from 'react';
import { Dialog } from '@/src/components/ui/Dialog';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    keys: ['Ctrl', 'K'],
    macKeys: ['Cmd', 'K'],
    action: 'Open global command & search menu',
    context: 'Available anywhere',
  },
  {
    keys: ['Ctrl', 'Enter'],
    macKeys: ['Cmd', 'Enter'],
    action: 'Start investigation when email form is valid',
    context: 'Investigation form',
  },
  {
    keys: ['Ctrl', '/'],
    macKeys: ['Cmd', '/'],
    action: 'Open keyboard shortcuts reference',
    context: 'Disabled while typing in text inputs',
  },
  {
    keys: ['Esc'],
    macKeys: ['Esc'],
    action: 'Close open dialogs, command palette, or confirmation modals',
    context: 'Any active overlay',
  },
];

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Navigate ClearTrace and launch authorized investigations without leaving the keyboard."
    >
      <div className="divide-y divide-slate-100">
        {SHORTCUTS.map((item) => (
          <div
            key={item.action}
            className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{item.action}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.context}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.keys.map((k, idx) => (
                <React.Fragment key={k}>
                  <kbd className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {k}
                  </kbd>
                  {idx < item.keys.length - 1 && (
                    <span className="text-xs text-slate-400">+</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
