import os from "node:os";
import path from "node:path";

export type LogLevel = "silent" | "error" | "info" | "debug";

const LOG_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  info: 2,
  debug: 3,
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (
    value === "silent" ||
    value === "error" ||
    value === "info" ||
    value === "debug"
  ) {
    return value;
  }
  return "error";
}

export function getConfig() {
  const tempBase = process.env.TEMP_DIR?.trim()
    ? path.resolve(process.env.TEMP_DIR.trim())
    : path.join(os.tmpdir(), "universal-media-downloader");

  return {
    maxFilesizeMb: parsePositiveInt(process.env.MAX_FILESIZE_MB, 500),
    maxDurationMin: parsePositiveInt(process.env.MAX_DURATION_MIN, 180),
    rateLimitPerMin: parsePositiveInt(process.env.RATE_LIMIT_PER_MIN, 10),
    maxConcurrentPerIp: parsePositiveInt(process.env.MAX_CONCURRENT_PER_IP, 3),
    maxConcurrentJobs: parsePositiveInt(process.env.MAX_CONCURRENT_JOBS, 3),
    downloadTimeoutSec: parsePositiveInt(process.env.DOWNLOAD_TIMEOUT_SEC, 300),
    cookiesFile: process.env.COOKIES_FILE?.trim() || "",
    proxyUrl: process.env.PROXY_URL?.trim() || "",
    tempDir: tempBase,
    logLevel: parseLogLevel(process.env.LOG_LEVEL?.trim().toLowerCase()),
    ytdlpPath: process.env.YTDLP_PATH?.trim() || "yt-dlp",
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
  };
}

export function logMessage(
  level: Exclude<LogLevel, "silent">,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const current = getConfig().logLevel;
  if (LOG_PRIORITY[level] > LOG_PRIORITY[current]) {
    return;
  }
  const timestamp = new Date().toISOString();
  const line = meta
    ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}`
    : `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
