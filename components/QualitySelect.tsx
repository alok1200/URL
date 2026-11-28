"use client";

import React from "react";
import { Check, Film, Sparkles, Volume2 } from "lucide-react";

export interface QualityOptionItem {
  height: number;
  displayHeight?: number;
  approxSizeBytes?: number | null;
}

export type AudioBitrateOption = "320" | "192" | "128" | "96";

interface QualitySelectProps {
  heights: number[];
  qualityOptions?: QualityOptionItem[];
  maxFilesizeMb?: number;
  value: string;
  onChange: (value: string) => void;
  audioBitrate: AudioBitrateOption;
  onAudioBitrateChange: (value: AudioBitrateOption) => void;
  disabled?: boolean;
}

interface VideoStageMeta {
  tier: string;
  badge: string;
  pillClass: string;
}

function getVideoStageMeta(height: number): VideoStageMeta {
  if (height >= 2160) {
    return {
      tier: "Ultra HD",
      badge: "4K",
      pillClass:
        "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
    };
  }
  if (height >= 1440) {
    return {
      tier: "Quad HD",
      badge: "2K",
      pillClass:
        "bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
    };
  }
  if (height >= 1080) {
    return {
      tier: "Full HD",
      badge: "FHD",
      pillClass:
        "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300",
    };
  }
  if (height >= 720) {
    return {
      tier: "High Def",
      badge: "HD",
      pillClass:
        "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
    };
  }
  if (height >= 480) {
    return {
      tier: "Standard",
      badge: "SD",
      pillClass:
        "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    };
  }
  if (height >= 360) {
    return {
      tier: "Data Saver",
      badge: "360p",
      pillClass:
        "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    };
  }
  return {
    tier: "Compact",
    badge: `${height}p`,
    pillClass:
      "bg-zinc-500/15 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
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
  maxFilesizeMb = 500,
  value,
  onChange,
  audioBitrate,
  onAudioBitrateChange,
  disabled = false,
}: QualitySelectProps) {
  const optionByHeight = new Map<number, QualityOptionItem>();
  if (qualityOptions) {
    for (const opt of qualityOptions) {
      optionByHeight.set(opt.height, opt);
    }
  }
  const maxBytes = maxFilesizeMb * 1024 * 1024;

  return (
    <div className="space-y-5">
      {/* Video Quality Stages */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            id="video-quality-label"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            <Film className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
            Video Quality (MP4)
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            {heights.length > 0
              ? `${heights.length} options`
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
            className={`group relative flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
              value === "best"
                ? "border-indigo-500 bg-gradient-to-br from-indigo-500/15 to-violet-500/10 text-zinc-900 shadow-sm shadow-indigo-500/10 dark:border-indigo-400 dark:text-white"
                : "border-zinc-200/90 bg-zinc-50/70 text-zinc-700 hover:border-indigo-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
            }`}
          >
            <div className="flex w-full items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Best Auto
              </span>
              {value === "best" && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-white">
                  <Check className="h-2.5 w-2.5" aria-hidden="true" />
                </span>
              )}
            </div>
            <span className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Highest MP4
            </span>
          </button>

          {/* Detected Resolution Stages */}
          {heights.map((h) => {
            const key = String(h);
            const selected = value === key;
            const opt = optionByHeight.get(h);
            const shownHeight = opt?.displayHeight ?? h;
            const meta = getVideoStageMeta(shownHeight);
            const approxBytes = opt?.approxSizeBytes ?? null;
            const sizeLabel = formatApproxSize(approxBytes);
            const overLimit = approxBytes !== null && approxBytes > maxBytes;

            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || overLimit}
                title={
                  overLimit
                    ? `Exceeds ${maxFilesizeMb} MB server limit`
                    : `${shownHeight}p ${meta.tier}`
                }
                onClick={() => onChange(key)}
                className={`group relative flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-45 ${
                  selected
                    ? "border-indigo-500 bg-gradient-to-br from-indigo-500/15 to-violet-500/10 text-zinc-900 shadow-sm shadow-indigo-500/10 dark:border-indigo-400 dark:text-white"
                    : "border-zinc-200/90 bg-zinc-50/70 text-zinc-700 hover:border-indigo-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-xs font-bold">{shownHeight}p</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ${
                      overLimit
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : meta.pillClass
                    }`}
                  >
                    {overLimit ? `>${maxFilesizeMb}MB` : meta.badge}
                  </span>
                </div>
                <span className="mt-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {meta.tier}
                  {sizeLabel ? ` · ${sizeLabel}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio Quality Stages */}
      <div className="space-y-2.5">
        <span
          id="audio-quality-label"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          <Volume2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
          Audio Quality (MP3)
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
                className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-emerald-500 bg-emerald-500/10 text-zinc-900 shadow-sm shadow-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-500/15 dark:text-white"
                    : "border-zinc-200/90 bg-zinc-50/70 text-zinc-700 hover:border-emerald-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-xs font-bold">{stage.label}</span>
                  {selected && (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <span className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
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
