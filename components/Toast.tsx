"use client";

import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "error" | "success";
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.type === "error" ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg sm:left-auto sm:right-6">
      <div
        role="alert"
        aria-live="assertive"
        className={`flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md ${
          isError
            ? "border-red-500/30 bg-red-950/90 text-red-100"
            : "border-emerald-500/30 bg-emerald-950/90 text-emerald-100"
        }`}
      >
        {isError ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
        )}
        <p className="flex-1 text-sm leading-relaxed">{toast.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="rounded-lg p-1 text-current/70 transition hover:bg-white/10 hover:text-current"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
