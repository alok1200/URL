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
      className="w-full animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/80"
      aria-label="Loading media details"
    >
      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        <div className="aspect-video w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="h-5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-6 w-11/12 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="space-y-3">
            <div className="h-10 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="h-12 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-12 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            </div>
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
      className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg shadow-black/5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-black/30"
    >
      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        {/* Thumbnail */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
          {info.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.thumbnail}
              alt={info.title}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
              <Film className="h-12 w-12" aria-hidden="true" />
            </div>
          )}

          {durationStr && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 font-mono text-xs font-medium text-white">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {durationStr}
            </span>
          )}
        </div>

        {/* Metadata & Controls */}
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                {info.site}
              </span>
              {info.isPlaylist && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <ListVideo className="h-3 w-3" aria-hidden="true" />
                  Playlist{info.playlistCount ? ` (${info.playlistCount} items)` : ""} — downloads first item
                </span>
              )}
            </div>

            <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-zinc-900 sm:text-xl dark:text-zinc-50">
              {info.title}
            </h2>

            {info.uploader && (
              <p className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{info.uploader}</span>
              </p>
            )}
          </div>

          <div className="space-y-4">
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:ring-offset-zinc-900"
              >
                <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Download Audio ({selectedAudioBitrate}k MP3)</span>
              </button>
            </div>
          </div>
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
