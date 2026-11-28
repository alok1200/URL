"use client";

import React from "react";
import { Check, Sparkles, Volume2 } from "lucide-react";

export interface QualityOptionItem {
  height: number;
  approxSizeBytes?: number | null;
}

export type AudioBitrateOption = "320" | "192" | "128" | "96";

interface QualitySelectProps {
  heights: number[];
  qualityOptions?: QualityOptionItem[];
  value: string;
  onChange: (value: string) => void;
  audioBitrate: AudioBitrateOption;
  onAudioBitrateChange: (value: AudioBitrateOption) => void;
  disabled?: boolean;
}

interface VideoStageMeta {
  tier: string;
  badge: string;
  accent: string;
}

function getVideoStageMeta(height: number): VideoStageMeta {
  if (height >= 2160) {
    return {
      tier: "Ultra HD",
      badge: "4K",
      accent: "text-fuchsia-600 dark:text-fuchsia-400",
    };
  }
  if (height >= 1440) {
    return {
      tier: "Quad HD",
      badge: "2K",
      accent: "text-violet-600 dark:text-violet-400",
    };
  }
  if (height >= 1080) {
    return {
      tier: "Full HD",
      badge: "FHD",
      accent: "text-indigo-600 dark:text-indigo-400",
    };
  }
  if (height >= 720) {
    return {
      tier: "HD",
      badge: "HD",
      accent: "text-sky-600 dark:text-sky-400",
    };
  }
  if (height >= 480) {
    return {
      tier: "Standard",
      badge: "SD",
      accent: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (height >= 360) {
    return {
      tier: "Data Saver",
      badge: "360p",
      accent: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    tier: "Low",
    badge: `${height}p`,
    accent: "text-zinc-500 dark:text-zinc-400",
  };
}

function formatApproxSize(bytes: number | null | undefined): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `~${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `~${mb.toFixed(1)} MB`;
  return `~${Math.round(bytes / 1024)} KB`;
}

const AUDIO_STAGES: Array<{
  value: AudioBitrateOption;
  label: string;
  tier: string;
}> = [
  { value: "320", label: "320 kbps", tier: "Studio" },
  { value: "192", label: "192 kbps", tier: "High" },
  { value: "128", label: "128 kbps", tier: "Standard" },
  { value: "96", label: "96 kbps", tier: "Compact" },
];

export function QualitySelect({
  heights,
  qualityOptions,
  value,
  onChange,
  audioBitrate,
  onAudioBitrateChange,
  disabled = false,
}: QualitySelectProps) {
  const sizeByHeight = new Map<number, number | null>();
  if (qualityOptions) {
    for (const opt of qualityOptions) {
      sizeByHeight.set(opt.height, opt.approxSizeBytes ?? null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Video Quality Stages */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span
            id="video-quality-label"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Video Quality Stage (MP4)
          </span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {heights.length > 0
              ? `${heights.length} resolutions detected`
              : "Auto quality"}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="video-quality-label"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {/* Best Auto Stage */}
          <button
            type="button"
            role="radio"
            aria-checked={value === "best"}
            disabled={disabled}
            onClick={() => onChange("best")}
            className={`relative flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
              value === "best"
                ? "border-indigo-500 bg-indigo-500/10 text-zinc-900 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-white"
                : "border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            <div className="flex w-full items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Best Auto
              </span>
              {value === "best" && (
                <Check className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
              )}
            </div>
            <span className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Highest available
            </span>
          </button>

          {/* Detected Resolution Stages */}
          {heights.map((h) => {
            const key = String(h);
            const selected = value === key;
            const meta = getVideoStageMeta(h);
            const sizeLabel = formatApproxSize(sizeByHeight.get(h));

            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(key)}
                className={`relative flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-indigo-500 bg-indigo-500/10 text-zinc-900 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-white"
                    : "border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-xs font-bold">{h}p</span>
                  <span className={`text-[10px] font-semibold uppercase ${meta.accent}`}>
                    {meta.badge}
                  </span>
                </div>
                <span className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {meta.tier}
                  {sizeLabel ? ` · ${sizeLabel}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio Quality Stages */}
      <div className="space-y-2">
        <span
          id="audio-quality-label"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          Audio Quality Stage (MP3)
        </span>

        <div
          role="radiogroup"
          aria-labelledby="audio-quality-label"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {AUDIO_STAGES.map((stage) => {
            const selected = audioBitrate === stage.value;
            return (
              <button
                key={stage.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onAudioBitrateChange(stage.value)}
                className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-indigo-500 bg-indigo-500/10 text-zinc-900 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-white"
                    : "border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="text-xs font-bold">{stage.label}</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {stage.tier}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
