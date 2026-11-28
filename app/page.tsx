"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DownloadCloud, History, Moon, RotateCcw, Sun, Trash2 } from "lucide-react";
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

function extractFilenameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through
    }
  }
  const asciiMatch = header.match(/filename="([^"]+)"/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }
  return fallback;
}

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

  // Initialize theme and local download history
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

    // Connect SSE stream for live progress updates
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
      const params = new URLSearchParams({
        url: checkedUrl,
        type,
        id: jobId,
        title: info.title,
      });
      if (type === "video" && selectedQuality !== "best") {
        params.set("height", selectedQuality);
      }
      if (type === "audio") {
        params.set("audioBitrate", selectedAudioBitrate);
      }

      const response = await fetch(`/api/download?${params.toString()}`);

      if (!response.ok) {
        let errorMessage = "Download failed. Please try again.";
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) errorMessage = errJson.error;
        } catch {
          // Response wasn't JSON
        }
        showToast("error", errorMessage);
        return;
      }

      setProgress({
        stage: "ready",
        percent: 100,
        speed: null,
        eta: null,
      });

      const blob = await response.blob();
      const fallbackName = `${info.title || "download"}.${type === "audio" ? "mp3" : "mp4"}`;
      const filename = extractFilenameFromHeader(
        response.headers.get("Content-Disposition"),
        fallbackName,
      );

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

      pushHistory({
        url: checkedUrl,
        title: info.title,
        site: info.site,
        type,
        timestamp: Date.now(),
      });

      showToast("success", `Download started: ${filename}`);
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
    <div className="flex min-h-screen flex-col">
      {/* Top Bar */}
      <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <DownloadCloud className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-base font-bold tracking-tight sm:text-lg">
              LinkDrop
            </span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isDark ? (
              <>
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center sm:mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
            Universal Video &amp; Audio Downloader
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
            Paste any public media link to inspect available resolutions and save as
            playable MP4 video or high-quality MP3 audio.
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
            className="mt-12 w-full rounded-2xl border border-zinc-200 bg-white/60 p-4 sm:p-5 dark:border-zinc-800/80 dark:bg-zinc-900/50"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                <History className="h-4 w-4" aria-hidden="true" />
                Recent Downloads
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-red-500 dark:text-zinc-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            </div>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {history.map((item) => (
                <li
                  key={`${item.url}-${item.type}-${item.timestamp}`}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.site} · {item.type === "audio" ? "MP3" : "MP4"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isChecking || isDownloading}
                    onClick={() => {
                      setUrl(item.url);
                      void checkLink(item.url);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
      <footer className="border-t border-zinc-200/80 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
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
