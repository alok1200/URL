"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DownloadCloud,
  History,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { LinkInput } from "@/components/LinkInput";
import {
  ResultCard,
  ResultCardSkeleton,
  type MediaInfoResponse,
} from "@/components/ResultCard";
import { type ClientProgressState } from "@/components/ProgressBar";
import { type AudioBitrateOption } from "@/components/QualitySelect";
import { Toast, type ToastMessage } from "@/components/Toast";

interface HistoryEntry {
  url: string;
  title: string;
  site: string;
  type: "video" | "audio";
  timestamp: number;
}

const HISTORY_KEY = "linkdrop_download_history_v1";
const THEME_KEY = "linkdrop_theme_v1";
const MAX_HISTORY = 8;

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [checkedUrl, setCheckedUrl] = useState("");
  const [info, setInfo] = useState<MediaInfoResponse | null>(null);
  const [selectedQuality, setSelectedQuality] = useState("best");
  const [selectedAudioBitrate, setSelectedAudioBitrate] =
    useState<AudioBitrateOption>("320");
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeDownloadType, setActiveDownloadType] = useState<"video" | "audio" | null>(
    null,
  );
  const [progress, setProgress] = useState<ClientProgressState | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isDark, setIsDark] = useState(true);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "light") {
        setIsDark(false);
        document.documentElement.classList.remove("dark");
      } else {
        setIsDark(true);
        document.documentElement.classList.add("dark");
      }

      const rawHistory = localStorage.getItem(HISTORY_KEY);
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory) as HistoryEntry[];
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, MAX_HISTORY));
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const showToast = useCallback((type: "error" | "success", text: string) => {
    setToast({ id: String(Date.now()), type, text });
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem(THEME_KEY, nextDark ? "dark" : "light");
    } catch {
      // Ignore
    }
  };

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => {
      const filtered = prev.filter(
        (item) => !(item.url === entry.url && item.type === entry.type),
      );
      const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  }, []);

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Ignore
    }
  };

  const checkLink = useCallback(
    async (targetUrl?: string) => {
      const linkToCheck = (targetUrl ?? url).trim();
      if (!linkToCheck) return;

      setIsChecking(true);
      setInfo(null);
      setToast(null);
      setSelectedQuality("best");

      try {
        const res = await fetch(
          `/api/info?url=${encodeURIComponent(linkToCheck)}`,
        );
        const data = (await res.json()) as MediaInfoResponse & { error?: string };

        if (!res.ok) {
          showToast(
            "error",
            data.error || "Could not load details for that link.",
          );
          return;
        }

        setInfo(data);
        setCheckedUrl(linkToCheck);
      } catch {
        showToast(
          "error",
          "Network error while checking this link. Please make sure the server is running.",
        );
      } finally {
        setIsChecking(false);
      }
    },
    [url, showToast],
  );

  const handleDownload = async (type: "video" | "audio") => {
    if (!info || !checkedUrl || isDownloading) return;

    const jobId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setIsDownloading(true);
    setActiveDownloadType(type);
    setProgress({
      stage: "fetching",
      percent: 0,
      speed: null,
      eta: null,
    });

    eventSourceRef.current?.close();
    const es = new EventSource(`/api/progress?id=${encodeURIComponent(jobId)}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ClientProgressState;
        setProgress({
          stage: payload.stage,
          percent: payload.percent ?? 0,
          speed: payload.speed ?? null,
          eta: payload.eta ?? null,
        });
      } catch {
        // Ignore malformed SSE chunks
      }
    };

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: checkedUrl,
          type,
          id: jobId,
          title: info.title,
          height: type === "video" && selectedQuality !== "best" ? selectedQuality : undefined,
          audioBitrate: type === "audio" ? selectedAudioBitrate : undefined,
        }),
      });

      const data = (await response.json()) as {
        downloadUrl?: string;
        filename?: string;
        size?: number;
        error?: string;
      };

      if (!response.ok || !data.downloadUrl) {
        showToast("error", data.error || "Download failed. Please try again.");
        return;
      }

      setProgress({
        stage: "ready",
        percent: 100,
        speed: null,
        eta: null,
      });

      // Trigger native browser download (no JS Blob RAM buffering, works for large files)
      const anchor = document.createElement("a");
      anchor.href = data.downloadUrl;
      if (data.filename) {
        anchor.download = data.filename;
      }
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      pushHistory({
        url: checkedUrl,
        title: info.title,
        site: info.site,
        type,
        timestamp: Date.now(),
      });

      showToast("success", `Downloading: ${data.filename || info.title}`);
    } catch {
      showToast(
        "error",
        "Connection interrupted while downloading. Please try again.",
      );
    } finally {
      es.close();
      eventSourceRef.current = null;
      setIsDownloading(false);
      setActiveDownloadType(null);
      setProgress(null);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Ambient gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[520px] w-[780px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-500/20 via-violet-500/15 to-cyan-400/15 blur-3xl dark:from-indigo-600/20 dark:via-violet-600/15 dark:to-cyan-500/10" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[420px] rounded-full bg-fuchsia-500/10 blur-3xl dark:bg-fuchsia-600/10" />
      </div>

      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
              <DownloadCloud className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="block text-base font-bold leading-none tracking-tight sm:text-lg">
                LinkDrop
              </span>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Media Saver
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            {isDark ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center sm:mb-10">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Fast · Private · Auto-cleaned
          </div>
          <h1 className="bg-gradient-to-b from-zinc-900 to-zinc-600 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-5xl dark:from-white dark:to-zinc-400">
            Universal Video &amp; Audio Downloader
          </h1>
          <p className="mx-auto mt-3.5 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
            Paste any public link to preview resolutions and save universally playable{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">MP4 video</span> or
            studio-grade{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">MP3 audio</span>.
          </p>
        </div>

        <LinkInput
          url={url}
          onChange={setUrl}
          onSubmit={() => void checkLink()}
          onPasteError={(msg) => showToast("error", msg)}
          isChecking={isChecking}
          disabled={isDownloading}
        />

        <div className="mt-8 w-full">
          {isChecking && <ResultCardSkeleton />}

          {!isChecking && info && (
            <ResultCard
              info={info}
              selectedQuality={selectedQuality}
              onQualityChange={setSelectedQuality}
              selectedAudioBitrate={selectedAudioBitrate}
              onAudioBitrateChange={setSelectedAudioBitrate}
              onDownload={(type) => void handleDownload(type)}
              isDownloading={isDownloading}
              activeDownloadType={activeDownloadType}
              progress={progress}
            />
          )}
        </div>

        {/* Recent Downloads (localStorage) */}
        {history.length > 0 && (
          <section
            aria-label="Recent downloads"
            className="mt-12 w-full rounded-2xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl sm:p-5 dark:border-white/10 dark:bg-zinc-900/60"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <History className="h-4 w-4" aria-hidden="true" />
                Recent Downloads
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            </div>
            <ul className="divide-y divide-zinc-200/80 dark:divide-white/10">
              {history.map((item) => (
                <li
                  key={`${item.url}-${item.type}-${item.timestamp}`}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {item.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{item.site}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          item.type === "audio"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                        }`}
                      >
                        {item.type === "audio" ? "MP3" : "MP4"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isChecking || isDownloading}
                    onClick={() => {
                      setUrl(item.url);
                      void checkLink(item.url);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Re-download
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Footer with legal disclaimer */}
      <footer className="border-t border-zinc-200/70 py-6 text-center text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        <div className="mx-auto max-w-3xl px-4">
          <p>
            Disclaimer: You are responsible for downloading only content you own,
            have permission to save, or may legally download for personal use.
            DRM-protected content is not supported.
          </p>
        </div>
      </footer>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
