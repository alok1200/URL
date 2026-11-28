import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, logMessage } from "./config";
import { getJobManager } from "./job-manager";

export interface QualityOption {
  height: number;
  displayHeight: number;
  approxSizeBytes: number | null;
}

export type AudioBitrate = "320" | "192" | "128" | "96";

export interface MediaInfo {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  site: string;
  isPlaylist: boolean;
  playlistCount?: number;
  heights: number[];
  qualityOptions: QualityOption[];
  maxFilesizeMb: number;
}

export interface DownloadResult {
  filePath: string;
  size: number;
  contentType: string;
  extension: string;
  title: string;
}

interface SpawnOutput {
  stdout: string;
  stderr: string;
  code: number | null;
}

const NON_RETRYABLE_PATTERNS = [
  "drm",
  "widevine",
  "playready",
  "fairplay",
  "private video",
  "video unavailable",
  "has been removed",
  "unsupported url",
  "not available in your country",
  "sign in to confirm your age",
  "file is larger than max-filesize",
  "exceeds the maximum",
];

function isRetryableError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return !NON_RETRYABLE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function buildOptionalArgs(): string[] {
  const cfg = getConfig();
  const args: string[] = [];

  if (cfg.cookiesFile) {
    args.push("--cookies", cfg.cookiesFile);
  }
  if (cfg.proxyUrl) {
    args.push("--proxy", cfg.proxyUrl);
  }
  if (cfg.ffmpegPath && cfg.ffmpegPath !== "ffmpeg") {
    args.push("--ffmpeg-location", cfg.ffmpegPath);
  }

  return args;
}

function buildSpawnEnv(): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH ?? "";
  if (process.platform === "win32") {
    return process.env;
  }
  const extraDirs = ["/opt/homebrew/bin", "/usr/local/bin"];
  const parts = currentPath.split(":").filter(Boolean);
  for (const dir of extraDirs) {
    if (!parts.includes(dir)) {
      parts.push(dir);
    }
  }
  return {
    ...process.env,
    PATH: parts.join(":"),
  };
}

/**
 * Runs a binary using spawn with an argument array (never a shell string).
 */
function runBinary(
  binary: string,
  args: string[],
  options: {
    timeoutMs: number;
    signal?: AbortSignal;
    onLine?: (line: string) => void;
  },
): Promise<SpawnOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSpawnEnv(),
    });

    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let timedOut = false;
    let aborted = false;

    const killChild = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 3000).unref();
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killChild();
    }, options.timeoutMs);

    const onAbort = () => {
      aborted = true;
      killChild();
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;

      if (options.onLine) {
        lineBuffer += text;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          options.onLine(line);
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;

      if (options.onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) options.onLine(line);
        }
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);

      if (options.onLine && lineBuffer.trim()) {
        options.onLine(lineBuffer);
      }

      if (timedOut) {
        reject(new Error("Process timed out"));
        return;
      }
      if (aborted) {
        reject(new Error("Download cancelled"));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

function extractQualityOptions(formats: unknown): {
  heights: number[];
  qualityOptions: QualityOption[];
} {
  if (!Array.isArray(formats)) return { heights: [], qualityOptions: [] };
  const byHeight = new Map<
    number,
    { displayHeight: number; approxSizeBytes: number | null }
  >();

  for (const fmt of formats) {
    if (!fmt || typeof fmt !== "object") continue;
    const record = fmt as Record<string, unknown>;
    const vcodec = typeof record.vcodec === "string" ? record.vcodec : "";
    const height = typeof record.height === "number" ? record.height : 0;
    const width = typeof record.width === "number" ? record.width : 0;

    // Only include actual video formats (exclude audio-only and storyboard thumbnails)
    if (vcodec && vcodec !== "none" && height >= 144 && height <= 4320) {
      const displayHeight = width > 0 ? Math.min(width, height) : height;
      const rawSize =
        typeof record.filesize === "number"
          ? record.filesize
          : typeof record.filesize_approx === "number"
            ? record.filesize_approx
            : null;
      const prev = byHeight.get(height);
      if (
        !prev ||
        (rawSize !== null &&
          (prev.approxSizeBytes === null || rawSize < prev.approxSizeBytes))
      ) {
        byHeight.set(height, {
          displayHeight,
          approxSizeBytes: rawSize,
        });
      }
    }
  }

  const heights = Array.from(byHeight.keys()).sort((a, b) => b - a);
  const qualityOptions = heights.map((height) => {
    const entry = byHeight.get(height)!;
    return {
      height,
      displayHeight: entry.displayHeight,
      approxSizeBytes: entry.approxSizeBytes,
    };
  });

  return { heights, qualityOptions };
}

/**
 * Returns true if the URL explicitly points to a standalone playlist page
 * (rather than a single video that happens to carry a &list= parameter).
 */
function isStandalonePlaylistUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const hasVideoId = parsed.searchParams.has("v");
    if (hasVideoId) return false;
    return (
      parsed.pathname.includes("/playlist") ||
      parsed.pathname.includes("/sets/")
    );
  } catch {
    return false;
  }
}

/**
 * Fetches metadata and available video qualities for a validated URL.
 * Retries once with alternate safe yt-dlp options on transient extraction errors.
 */
export async function getMediaInfo(url: string): Promise<MediaInfo> {
  const cfg = getConfig();
  const standalonePlaylist = isStandalonePlaylistUrl(url);

  const baseArgs = [
    "--dump-single-json",
    ...(standalonePlaylist ? ["--flat-playlist"] : ["--no-playlist"]),
    "--no-warnings",
    "--no-exec",
    "--skip-download",
    ...buildOptionalArgs(),
  ];

  const attempt = async (extraArgs: string[]): Promise<SpawnOutput> => {
    return runBinary(cfg.ytdlpPath, [...baseArgs, ...extraArgs, "--", url], {
      timeoutMs: 45_000,
    });
  };

  let result = await attempt([]);

  if (result.code !== 0 && isRetryableError(result.stderr)) {
    logMessage("info", "Retrying yt-dlp info extraction with alternate options");
    result = await attempt(["--force-ipv4", "--no-cache-dir"]);
  }

  if (result.code !== 0) {
    throw new Error(result.stderr || "yt-dlp failed to fetch media info");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new Error("Could not parse metadata returned by yt-dlp");
  }

  const isPlaylist =
    parsed._type === "playlist" &&
    Array.isArray(parsed.entries) &&
    parsed.entries.length > 1;

  const firstEntry =
    isPlaylist && Array.isArray(parsed.entries) && parsed.entries[0] && typeof parsed.entries[0] === "object"
      ? (parsed.entries[0] as Record<string, unknown>)
      : null;

  const durationRaw =
    typeof parsed.duration === "number"
      ? parsed.duration
      : firstEntry && typeof firstEntry.duration === "number"
        ? firstEntry.duration
        : null;

  if (durationRaw !== null && durationRaw > cfg.maxDurationMin * 60) {
    throw new Error("This video exceeds the maximum allowed duration");
  }

  let thumbnail: string | null =
    typeof parsed.thumbnail === "string" ? parsed.thumbnail : null;
  if (!thumbnail && Array.isArray(parsed.thumbnails) && parsed.thumbnails.length > 0) {
    const lastThumb = parsed.thumbnails[parsed.thumbnails.length - 1] as Record<string, unknown>;
    if (typeof lastThumb?.url === "string") {
      thumbnail = lastThumb.url;
    }
  }
  if (!thumbnail && firstEntry && typeof firstEntry.thumbnail === "string") {
    thumbnail = firstEntry.thumbnail;
  }

  const uploader =
    (typeof parsed.uploader === "string" && parsed.uploader) ||
    (typeof parsed.channel === "string" && parsed.channel) ||
    (typeof parsed.creator === "string" && parsed.creator) ||
    null;

  const site =
    (typeof parsed.extractor_key === "string" && parsed.extractor_key) ||
    (typeof parsed.extractor === "string" && parsed.extractor) ||
    new URL(url).hostname;

  const title =
    (typeof parsed.title === "string" && parsed.title.trim()) ||
    "Untitled Media";

  const { heights, qualityOptions } = extractQualityOptions(parsed.formats);

  return {
    title,
    thumbnail,
    duration: durationRaw,
    uploader,
    site,
    isPlaylist,
    playlistCount: isPlaylist && Array.isArray(parsed.entries) ? parsed.entries.length : undefined,
    heights,
    qualityOptions,
    maxFilesizeMb: cfg.maxFilesizeMb,
  };
}

/**
 * Downloads and merges/converts media into tempDir, emitting SSE progress updates.
 */
export async function downloadMedia(params: {
  url: string;
  type: "video" | "audio";
  height?: number;
  audioBitrate?: AudioBitrate;
  jobId: string;
  tempDir: string;
  signal?: AbortSignal;
}): Promise<DownloadResult> {
  const { url, type, height, audioBitrate, jobId, tempDir, signal } = params;
  const cfg = getConfig();
  const jobs = getJobManager();

  jobs.update(jobId, {
    stage: "fetching",
    percent: 0,
    speed: null,
    eta: null,
  });

  const outputTemplate = path.join(tempDir, "media.%(ext)s");
  const expectedExt = type === "audio" ? "mp3" : "mp4";

  const formatArgs: string[] = [];
  if (type === "audio") {
    formatArgs.push(
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      audioBitrate ? `${audioBitrate}K` : "0",
    );
  } else {
    // Prefer H.264 (avc1) + AAC (mp4a) for universal playback across macOS QuickTime,
    // iOS, Windows, and browsers, with graceful fallbacks to other MP4/merged streams.
    const videoFormat =
      height && Number.isFinite(height) && height > 0
        ? `bestvideo[height<=${height}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`
        : "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best";
    formatArgs.push(
      "-f",
      videoFormat,
      "--merge-output-format",
      "mp4",
      "--remux-video",
      "mp4",
      "--postprocessor-args",
      "Merger+ffmpeg:-movflags +faststart",
    );
  }

  const baseArgs = [
    "--no-playlist",
    "--no-warnings",
    "--no-exec",
    "--no-mtime",
    "--newline",
    "--max-filesize",
    `${cfg.maxFilesizeMb}M`,
    "--progress-template",
    "download:PROGRESS|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
    "--print",
    "before_dl:TITLE|%(title)s",
    "-o",
    outputTemplate,
    ...formatArgs,
    ...buildOptionalArgs(),
  ];

  let detectedTitle = "download";
  let sawDownloadProgress = false;

  const handleLine = (line: string) => {
    if (line.startsWith("TITLE|")) {
      const t = line.slice("TITLE|".length).trim();
      if (t && t !== "NA") {
        detectedTitle = t;
      }
      return;
    }

    if (line.startsWith("PROGRESS|")) {
      sawDownloadProgress = true;
      const [, rawPct, rawSpeed, rawEta] = line.split("|");
      const pctNum = Number.parseFloat((rawPct || "0").replace("%", "").trim());
      const percent = Number.isFinite(pctNum)
        ? Math.min(99, Math.max(0, Math.round(pctNum)))
        : 0;
      const speed =
        rawSpeed && rawSpeed.trim() !== "NA" && rawSpeed.trim() !== "Unknown"
          ? rawSpeed.trim()
          : null;
      const eta =
        rawEta && rawEta.trim() !== "NA" && rawEta.trim() !== "Unknown"
          ? rawEta.trim()
          : null;

      jobs.update(jobId, {
        stage: "downloading",
        percent,
        speed,
        eta,
      });
      return;
    }

    if (line.includes("[Merger]") || line.includes("Merging formats")) {
      jobs.update(jobId, {
        stage: "merging",
        percent: 99,
        speed: null,
        eta: null,
      });
      return;
    }

    if (line.includes("[ExtractAudio]") || line.includes("Destination:") && type === "audio") {
      jobs.update(jobId, {
        stage: "converting",
        percent: 99,
        speed: null,
        eta: null,
      });
    }
  };

  const attempt = async (extraArgs: string[]): Promise<SpawnOutput> => {
    return runBinary(cfg.ytdlpPath, [...baseArgs, ...extraArgs, "--", url], {
      timeoutMs: cfg.downloadTimeoutSec * 1000,
      signal,
      onLine: handleLine,
    });
  };

  let result = await attempt([]);

  if (result.code !== 0 && !sawDownloadProgress && isRetryableError(result.stderr)) {
    logMessage("info", "Retrying yt-dlp download with alternate options");
    result = await attempt(["--force-ipv4", "--no-cache-dir"]);
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (combinedOutput.includes("file is larger than max-filesize")) {
    throw new Error("File is larger than max-filesize");
  }

  if (result.code !== 0) {
    throw new Error(result.stderr || "yt-dlp failed to download media");
  }

  // Locate the produced output file in tempDir
  const files = await fs.readdir(tempDir);
  const candidates = files.filter(
    (f) => !f.endsWith(".part") && !f.endsWith(".ytdl") && !f.endsWith(".temp"),
  );

  // Prefer the exact expected extension (mp4 / mp3)
  const chosenName =
    candidates.find((f) => f.toLowerCase().endsWith(`.${expectedExt}`)) ||
    candidates[0];

  if (!chosenName) {
    throw new Error("File is larger than max-filesize or no output file was created");
  }

  const filePath = path.join(tempDir, chosenName);
  const stat = await fs.stat(filePath);
  const maxBytes = cfg.maxFilesizeMb * 1024 * 1024;

  if (stat.size > maxBytes) {
    throw new Error("File exceeds the maximum file size");
  }

  const actualExt = path.extname(chosenName).replace(/^\./, "").toLowerCase() || expectedExt;
  const contentType =
    actualExt === "mp3"
      ? "audio/mpeg"
      : actualExt === "mp4"
        ? "video/mp4"
        : "application/octet-stream";

  jobs.update(jobId, {
    stage: "ready",
    percent: 100,
    speed: null,
    eta: null,
  });

  return {
    filePath,
    size: stat.size,
    contentType,
    extension: actualExt,
    title: detectedTitle,
  };
}

/**
 * Checks yt-dlp version and ffmpeg availability for /api/health.
 */
export async function checkHealth(): Promise<{
  ok: boolean;
  ytdlp: { available: boolean; version: string | null };
  ffmpeg: { available: boolean; version: string | null };
}> {
  const cfg = getConfig();

  const [ytdlpCheck, ffmpegCheck] = await Promise.all([
    runBinary(cfg.ytdlpPath, ["--version"], { timeoutMs: 5000 })
      .then((res) => ({
        available: res.code === 0,
        version: res.code === 0 ? res.stdout.trim() : null,
      }))
      .catch(() => ({ available: false, version: null })),
    runBinary(cfg.ffmpegPath, ["-version"], { timeoutMs: 5000 })
      .then((res) => ({
        available: res.code === 0,
        version: res.code === 0 ? res.stdout.split("\n")[0]?.trim() || "available" : null,
      }))
      .catch(() => ({ available: false, version: null })),
  ]);

  return {
    ok: ytdlpCheck.available && ffmpegCheck.available,
    ytdlp: ytdlpCheck,
    ffmpeg: ffmpegCheck,
  };
}
