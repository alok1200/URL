"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export interface ClientProgressState {
  stage: "fetching" | "downloading" | "merging" | "converting" | "ready" | "error";
  percent: number;
  speed: string | null;
  eta: string | null;
}

interface ProgressBarProps {
  progress: ClientProgressState;
  downloadType: "video" | "audio";
}

const STAGE_LABELS: Record<ClientProgressState["stage"], string> = {
  fetching: "Preparing media stream...",
  downloading: "Downloading media...",
  merging: "Merging video & audio into MP4...",
  converting: "Converting audio to MP3...",
  ready: "Sending file to your device...",
  error: "Download failed",
};

export function ProgressBar({ progress, downloadType }: ProgressBarProps) {
  const isDeterminate =
    progress.stage === "downloading" && progress.percent > 0 && progress.percent < 100;

  const label =
    progress.stage === "converting" && downloadType === "video"
      ? "Finalizing MP4..."
      : STAGE_LABELS[progress.stage];

  return (
    <div
      className="rounded-xl border border-indigo-500/25 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-cyan-500/10 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
        <div className="flex items-center gap-2 font-medium text-indigo-700 dark:text-indigo-200">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-300">
          {isDeterminate && (
            <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-semibold text-indigo-700 dark:text-indigo-300">
              {progress.percent}%
            </span>
          )}
          {progress.speed && <span>{progress.speed}</span>}
          {progress.eta && <span className="text-zinc-500 dark:text-zinc-400">ETA {progress.eta}</span>}
        </div>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
        {isDeterminate ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(3, progress.percent))}%` }}
          />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 animate-indeterminate" />
        )}
      </div>
    </div>
  );
}
