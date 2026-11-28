"use client";

import React from "react";
import {
  Clock,
  Download,
  Film,
  ListVideo,
  Music,
  User,
} from "lucide-react";
import {
  QualitySelect,
  type AudioBitrateOption,
  type QualityOptionItem,
} from "./QualitySelect";
import { ProgressBar, type ClientProgressState } from "./ProgressBar";

export interface MediaInfoResponse {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  site: string;
  isPlaylist: boolean;
  playlistCount?: number;
  heights: number[];
  qualityOptions?: QualityOptionItem[];
}

interface ResultCardProps {
  info: MediaInfoResponse;
  selectedQuality: string;
  onQualityChange: (value: string) => void;
  selectedAudioBitrate: AudioBitrateOption;
  onAudioBitrateChange: (value: AudioBitrateOption) => void;
  onDownload: (type: "video" | "audio") => void;
  isDownloading: boolean;
  activeDownloadType: "video" | "audio" | null;
  progress: ClientProgressState | null;
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ResultCardSkeleton() {
  return (
    <div
      className="w-full animate-pulse rounded-3xl border border-zinc-200/80 bg-white/80 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-zinc-900/70"
      aria-label="Loading media details"
    >
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="aspect-video w-full rounded-2xl bg-zinc-200/80 dark:bg-white/10" />
        <div className="flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="h-5 w-24 rounded-full bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-6 w-11/12 rounded-lg bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-4 w-1/2 rounded-lg bg-zinc-200/80 dark:bg-white/10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-14 rounded-xl bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-14 rounded-xl bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-14 rounded-xl bg-zinc-200/80 dark:bg-white/10" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-12 rounded-xl bg-zinc-200/80 dark:bg-white/10" />
            <div className="h-12 rounded-xl bg-zinc-200/80 dark:bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResultCard({
  info,
  selectedQuality,
  onQualityChange,
  selectedAudioBitrate,
  onAudioBitrateChange,
  onDownload,
  isDownloading,
  activeDownloadType,
  progress,
}: ResultCardProps) {
  const durationStr = formatDuration(info.duration);

  return (
    <section
      aria-label="Media details and download options"
      className="animate-fade-slide-up w-full overflow-hidden rounded-3xl border border-zinc-200/90 bg-white/85 p-5 shadow-2xl shadow-indigo-500/5 backdrop-blur-xl sm:p-7 dark:border-white/10 dark:bg-zinc-900/75 dark:shadow-black/50"
    >
      {/* Top media preview row */}
      <div className="grid gap-5 border-b border-zinc-200/80 pb-6 md:grid-cols-[260px_1fr] dark:border-white/10">
        <div className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-black/5 dark:bg-zinc-800 dark:ring-white/10">
          {info.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.thumbnail}
              alt={info.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
              <Film className="h-12 w-12" aria-hidden="true" />
            </div>
          )}

          {durationStr && (
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg bg-black/75 px-2 py-0.5 font-mono text-xs font-semibold text-white backdrop-blur-md">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {durationStr}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              {info.site}
            </span>
            {info.isPlaylist && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <ListVideo className="h-3 w-3" aria-hidden="true" />
                Playlist{info.playlistCount ? ` (${info.playlistCount} items)` : ""} — first item
              </span>
            )}
          </div>

          <h2 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-zinc-900 sm:text-xl dark:text-white">
            {info.title}
          </h2>

          {info.uploader && (
            <p className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <User className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="truncate">{info.uploader}</span>
            </p>
          )}
        </div>
      </div>

      {/* Quality stages & download actions */}
      <div className="mt-6 space-y-6">
        <QualitySelect
          heights={info.heights}
          qualityOptions={info.qualityOptions}
          value={selectedQuality}
          onChange={onQualityChange}
          audioBitrate={selectedAudioBitrate}
          onAudioBitrateChange={onAudioBitrateChange}
          disabled={isDownloading}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => onDownload("video")}
            className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:bg-right hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Download Video ({selectedQuality === "best" ? "Best MP4" : `${selectedQuality}p MP4`})
            </span>
          </button>

          <button
            type="button"
            disabled={isDownloading}
            onClick={() => onDownload("audio")}
            className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3.5 text-sm font-semibold text-emerald-700 transition-all duration-200 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 dark:focus:ring-offset-zinc-900"
          >
            <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Download Audio ({selectedAudioBitrate}k MP3)</span>
          </button>
        </div>
      </div>

      {isDownloading && progress && activeDownloadType && (
        <div className="mt-5">
          <ProgressBar progress={progress} downloadType={activeDownloadType} />
        </div>
      )}
    </section>
  );
}
