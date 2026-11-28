import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { validateUrl } from "@/lib/url-validation";
import { getClientIp, getRateLimiter } from "@/lib/rate-limiter";
import { downloadMedia, type AudioBitrate } from "@/lib/ytdlp";
import { createJobTempDir, cleanupPath } from "@/lib/cleanup";
import { buildContentDisposition, sanitizeFilename } from "@/lib/sanitize";
import { mapError } from "@/lib/error-mapper";
import { getJobManager } from "@/lib/job-manager";
import { logMessage } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Respond cleanly to browser/download-manager HEAD probes without re-running yt-dlp
export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url") ?? "";
  const typeParam = searchParams.get("type") ?? "video";
  const heightParam = searchParams.get("height");
  const bitrateParam = searchParams.get("audioBitrate");
  const requestedTitle = searchParams.get("title") ?? undefined;
  const jobId =
    searchParams.get("id")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) ||
    crypto.randomUUID();

  if (typeParam !== "video" && typeParam !== "audio") {
    return NextResponse.json(
      { error: "Invalid download type. Choose 'video' or 'audio'." },
      { status: 400 },
    );
  }

  let audioBitrate: AudioBitrate | undefined;
  if (bitrateParam) {
    if (
      bitrateParam === "320" ||
      bitrateParam === "192" ||
      bitrateParam === "128" ||
      bitrateParam === "96"
    ) {
      audioBitrate = bitrateParam;
    } else {
      return NextResponse.json(
        { error: "Invalid audio quality selected." },
        { status: 400 },
      );
    }
  }

  let height: number | undefined;
  if (heightParam && heightParam !== "best") {
    const parsedHeight = Number.parseInt(heightParam, 10);
    if (!Number.isInteger(parsedHeight) || parsedHeight < 144 || parsedHeight > 4320) {
      return NextResponse.json(
        { error: "Invalid video quality selected." },
        { status: 400 },
      );
    }
    height = parsedHeight;
  }

  const validation = await validateUrl(rawUrl);
  if (!validation.valid || !validation.normalizedUrl) {
    return NextResponse.json(
      { error: validation.error ?? "Please enter a valid video or audio link." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  const limiter = getRateLimiter();
  const lease = limiter.acquireDownloadSlot(ip);

  if (!lease.allowed) {
    const message =
      lease.reason === "IP_LIMIT"
        ? "You have reached the maximum number of simultaneous downloads. Please wait for one to finish."
        : "The server is currently busy processing other downloads. Please try again in a moment.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  const jobs = getJobManager();
  let tempDir: string | undefined;
  let cleanedUp = false;

  const finalize = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    lease.release();
    await cleanupPath(tempDir);
  };

  try {
    tempDir = await createJobTempDir(jobId);

    const result = await downloadMedia({
      url: validation.normalizedUrl,
      type: typeParam,
      height,
      audioBitrate,
      jobId,
      tempDir,
      signal: request.signal,
    });

    const filename = sanitizeFilename(
      requestedTitle || result.title,
      result.extension,
    );

    const fileStream = fs.createReadStream(result.filePath);

    // Ensure temp directory and concurrency slot are released once streaming ends or errors
    fileStream.once("close", () => {
      void finalize();
    });
    fileStream.once("error", () => {
      void finalize();
    });

    const webStream = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.size),
        "Content-Disposition": buildContentDisposition(filename),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const mapped = mapError(err);
    jobs.update(jobId, {
      stage: "error",
      error: mapped.message,
    });
    logMessage("error", "Download failed", {
      code: mapped.code,
      status: mapped.status,
    });
    await finalize();
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
