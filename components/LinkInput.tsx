"use client";

import React from "react";
import { ClipboardPaste, Link2, Loader2, Search, X } from "lucide-react";

interface LinkInputProps {
  url: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPasteError?: (message: string) => void;
  isChecking: boolean;
  disabled?: boolean;
}

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
      onPasteError?.("Clipboard access was denied. Please paste manually with Ctrl+V / Cmd+V.");
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleFormSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
        aria-label="Check video or audio link"
      >
        <div className="relative flex flex-1 items-center">
          <Link2
            className="pointer-events-none absolute left-3.5 h-5 w-5 text-zinc-400 dark:text-zinc-500"
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
            placeholder="Paste a video or audio link (https://...)"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            disabled={isChecking || disabled}
            className="w-full rounded-xl border border-zinc-300 bg-white py-3.5 pl-11 pr-24 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-indigo-400"
          />
          <div className="absolute right-2 flex items-center gap-1">
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
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Paste</span>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isChecking || disabled || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[128px] sm:text-base dark:focus:ring-offset-zinc-950"
        >
          {isChecking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Checking</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Check</span>
            </>
          )}
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
        Supports YouTube, Instagram, X, Facebook, Reddit, SoundCloud and 1000+ more sites.
      </p>
    </div>
  );
}
