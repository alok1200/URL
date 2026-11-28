"use client";

import React from "react";
import { ClipboardPaste, Link2, Loader2, Sparkles, X } from "lucide-react";

interface LinkInputProps {
  url: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPasteError?: (message: string) => void;
  isChecking: boolean;
  disabled?: boolean;
}

const PLATFORMS = [
  "YouTube",
  "Instagram",
  "X / Twitter",
  "Facebook",
  "Reddit",
  "SoundCloud",
  "1000+ more",
];

export function LinkInput({
  url,
  onChange,
  onSubmit,
  onPasteError,
  isChecking,
  disabled = false,
}: LinkInputProps) {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !isChecking && url.trim()) {
      onSubmit();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onChange(text.trim());
      } else {
        onPasteError?.("Your clipboard is empty.");
      }
    } catch {
      onPasteError?.(
        "Clipboard access was denied. Please paste manually with Ctrl+V / Cmd+V.",
      );
    }
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-zinc-200/90 bg-white/85 p-2 shadow-xl shadow-indigo-500/5 backdrop-blur-xl transition focus-within:border-indigo-500/60 focus-within:ring-4 focus-within:ring-indigo-500/15 dark:border-white/10 dark:bg-zinc-900/75 dark:shadow-black/40 dark:focus-within:border-indigo-400/60 dark:focus-within:ring-indigo-500/20">
        <form
          onSubmit={handleFormSubmit}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          aria-label="Check video or audio link"
        >
          <div className="relative flex flex-1 items-center">
            <Link2
              className="pointer-events-none absolute left-3.5 h-5 w-5 text-indigo-500/80 dark:text-indigo-400"
              aria-hidden="true"
            />
            <label htmlFor="media-url-input" className="sr-only">
              Video or audio URL
            </label>
            <input
              id="media-url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste any video or audio URL (https://...)"
              value={url}
              onChange={(e) => onChange(e.target.value)}
              disabled={isChecking || disabled}
              className="w-full rounded-xl bg-transparent py-3.5 pl-11 pr-24 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              {url && !isChecking && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  aria-label="Clear link"
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                disabled={isChecking || disabled}
                aria-label="Paste link from clipboard"
                title="Paste from clipboard"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-zinc-100/80 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Paste</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isChecking || disabled || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all duration-200 hover:bg-right hover:shadow-lg hover:shadow-indigo-500/35 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[136px] sm:text-base dark:focus:ring-offset-zinc-950"
          >
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Checking</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Check</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Supported platforms pill strip */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
        {PLATFORMS.map((name) => (
          <span
            key={name}
            className="rounded-full border border-zinc-200/80 bg-white/60 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-400"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
