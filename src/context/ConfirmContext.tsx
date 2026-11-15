import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmDialog, { type ConfirmDialogTone } from '../components/ui/ConfirmDialog';
import type { SupportedLanguage } from '../i18n';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  language?: SupportedLanguage;
}

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((options: ConfirmOptions) => {
    if (pendingRef.current) {
      pendingRef.current.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const handleClose = useCallback((confirmed: boolean) => {
    const active = pendingRef.current;
    setPending(null);
    active?.resolve(confirmed);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={pending?.options.title}
        message={pending?.options.message || ''}
        confirmLabel={pending?.options.confirmLabel}
        cancelLabel={pending?.options.cancelLabel}
        tone={pending?.options.tone}
        language={pending?.options.language}
        onConfirm={() => handleClose(true)}
        onCancel={() => handleClose(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Provides a non-blocking React confirmation dialog.
 * When used inside ConfirmProvider, delegates to the root dialog (`confirmDialog === null`);
 * when rendered standalone in isolated tests/components, falls back to local dialog state.
 */
export function useConfirmDialog() {
  const sharedContext = useContext(ConfirmContext);
  const [localPending, setLocalPending] = useState<PendingConfirm | null>(null);
  const localPendingRef = useRef<PendingConfirm | null>(null);
  localPendingRef.current = localPending;

  const localConfirm = useCallback((options: ConfirmOptions) => {
    if (localPendingRef.current) {
      localPendingRef.current.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      setLocalPending({ options, resolve });
    });
  }, []);

  const closeLocal = useCallback((confirmed: boolean) => {
    const active = localPendingRef.current;
    setLocalPending(null);
    active?.resolve(confirmed);
  }, []);

  const confirm = sharedContext ? sharedContext.confirm : localConfirm;
  const confirmDialog = sharedContext ? null : (
    <ConfirmDialog
      isOpen={Boolean(localPending)}
      title={localPending?.options.title}
      message={localPending?.options.message || ''}
      confirmLabel={localPending?.options.confirmLabel}
      cancelLabel={localPending?.options.cancelLabel}
      tone={localPending?.options.tone}
      language={localPending?.options.language}
      onConfirm={() => closeLocal(true)}
      onCancel={() => closeLocal(false)}
    />
  );

  return { confirm, confirmDialog };
}
