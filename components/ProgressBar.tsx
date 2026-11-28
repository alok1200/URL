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
  downloading: "Downloading media on server...",
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
      className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
        <div className="flex items-center gap-2 font-medium text-indigo-700 dark:text-indigo-300">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
          {isDeterminate && <span>{progress.percent}%</span>}
          {progress.speed && <span>{progress.speed}</span>}
          {progress.eta && <span>ETA {progress.eta}</span>}
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {isDeterminate ? (
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
          />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-indigo-500 animate-indeterminate" />
        )}
      </div>
    </div>
  );
}
