import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, logMessage } from "./config";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

const globalForCleanup = globalThis as typeof globalThis & {
  __umdSweepStarted?: boolean;
};

/**
 * Ensures the base temp directory exists and starts the background sweep timer once.
 */
export async function ensureTempBaseDir(): Promise<string> {
  const baseDir = getConfig().tempDir;
  await fs.mkdir(baseDir, { recursive: true });
  startBackgroundSweep();
  return baseDir;
}

/**
 * Creates an isolated temp directory for a single download job.
 */
export async function createJobTempDir(jobId: string): Promise<string> {
  const baseDir = await ensureTempBaseDir();
  const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, "");
  const suffix = crypto.randomBytes(4).toString("hex");
  const dir = path.join(baseDir, `job-${safeId || Date.now()}-${suffix}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Safely deletes a file or directory recursively. Never throws on missing paths.
 */
export async function cleanupPath(targetPath: string | undefined): Promise<void> {
  if (!targetPath) return;
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (err) {
    logMessage("error", "Failed to clean up temp path", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Removes any files or job directories in TEMP_DIR older than maxAgeMs (default 30 min).
 */
export async function sweepOldTempFiles(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<number> {
  const baseDir = getConfig().tempDir;
  let removed = 0;

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(fullPath, { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        // Ignore entries removed concurrently
      }
    }
  } catch {
    // Base dir may not exist yet
  }

  if (removed > 0) {
    logMessage("info", "Background temp sweep removed stale items", { removed });
  }
  return removed;
}

/**
 * Starts the periodic 5-minute background sweep (once per process).
 */
export function startBackgroundSweep(): void {
  if (globalForCleanup.__umdSweepStarted) return;
  globalForCleanup.__umdSweepStarted = true;

  // Run an initial sweep shortly after startup
  void sweepOldTempFiles();

  const timer = setInterval(() => {
    void sweepOldTempFiles();
  }, SWEEP_INTERVAL_MS);

  // Do not keep the Node process alive solely for this timer
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
