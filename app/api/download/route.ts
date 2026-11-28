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

function parseDownloadParams(input: {
  url: string;
  type: string;
  height?: string | number | null;
  audioBitrate?: string | null;
  id?: string | null;
  title?: string | null;
}):
  | {
      ok: true;
      url: string;
      type: "video" | "audio";
      height?: number;
      audioBitrate?: AudioBitrate;
      jobId: string;
      requestedTitle?: string;
    }
  | { ok: false; error: string } {
  const typeParam = input.type || "video";
  if (typeParam !== "video" && typeParam !== "audio") {
    return { ok: false, error: "Invalid download type. Choose 'video' or 'audio'." };
  }

  let audioBitrate: AudioBitrate | undefined;
  if (input.audioBitrate) {
    if (
      input.audioBitrate === "320" ||
      input.audioBitrate === "192" ||
      input.audioBitrate === "128" ||
      input.audioBitrate === "96"
    ) {
      audioBitrate = input.audioBitrate;
    } else {
      return { ok: false, error: "Invalid audio quality selected." };
    }
  }

  let height: number | undefined;
  if (input.height !== undefined && input.height !== null && input.height !== "" && input.height !== "best") {
    const parsedHeight =
      typeof input.height === "number"
        ? input.height
        : Number.parseInt(String(input.height), 10);
    if (!Number.isInteger(parsedHeight) || parsedHeight < 144 || parsedHeight > 4320) {
      return { ok: false, error: "Invalid video quality selected." };
    }
    height = parsedHeight;
  }

  const jobId =
    input.id?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) ||
    crypto.randomUUID();

  return {
    ok: true,
    url: input.url,
    type: typeParam,
    height,
    audioBitrate,
    jobId,
    requestedTitle: input.title ?? undefined,
  };
}

function streamFileResponse(params: {
  filePath: string;
  filename: string;
  contentType: string;
  size: number;
  onFinish: () => Promise<void>;
}): Response {
  const fileStream = fs.createReadStream(params.filePath);

  fileStream.once("close", () => {
    void params.onFinish();
  });
  fileStream.once("error", () => {
    void params.onFinish();
  });

  const webStream = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": params.contentType,
      "Content-Length": String(params.size),
      "Content-Disposition": buildContentDisposition(params.filename),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * POST /api/download
 * Prepares the media file on disk while SSE streams progress, then returns
 * a one-time downloadUrl for the browser's native download manager (no JS RAM buffering).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = parseDownloadParams({
    url: typeof body.url === "string" ? body.url : "",
    type: typeof body.type === "string" ? body.type : "video",
    height:
      typeof body.height === "string" || typeof body.height === "number"
        ? body.height
        : null,
    audioBitrate: typeof body.audioBitrate === "string" ? body.audioBitrate : null,
    id: typeof body.id === "string" ? body.id : null,
    title: typeof body.title === "string" ? body.title : null,
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validation = await validateUrl(parsed.url);
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

  try {
    tempDir = await createJobTempDir(parsed.jobId);

    const result = await downloadMedia({
      url: validation.normalizedUrl,
      type: parsed.type,
      height: parsed.height,
      audioBitrate: parsed.audioBitrate,
      jobId: parsed.jobId,
      tempDir,
      signal: request.signal,
    });

    const filename = sanitizeFilename(
      parsed.requestedTitle || result.title,
      result.extension,
    );

    jobs.setPreparedFile(parsed.jobId, {
      filePath: result.filePath,
      tempDir,
      filename,
      contentType: result.contentType,
      size: result.size,
    });

    lease.release();

    return NextResponse.json(
      {
        downloadUrl: `/api/download?job=${encodeURIComponent(parsed.jobId)}`,
        filename,
        size: result.size,
      },
      { status: 200 },
    );
  } catch (err) {
    const mapped = mapError(err);
    jobs.update(parsed.jobId, {
      stage: "error",
      error: mapped.message,
    });
    logMessage("error", "Download preparation failed", {
      code: mapped.code,
      status: mapped.status,
    });
    lease.release();
    await cleanupPath(tempDir);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/**
 * GET /api/download
 * - With ?job=<jobId>: streams a prepared file and deletes its temp folder immediately after.
 * - With ?url=<link>&type=video|audio&height=<optional>: downloads and streams directly.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const preparedJobId = searchParams.get("job")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);

  if (preparedJobId) {
    const jobs = getJobManager();
    const prepared = jobs.claimPreparedFile(preparedJobId);
    if (!prepared) {
      return NextResponse.json(
        { error: "This download link has expired or was already used. Please click download again." },
        { status: 410 },
      );
    }

    let cleaned = false;
    const finish = async () => {
      if (cleaned) return;
      cleaned = true;
      await cleanupPath(prepared.tempDir);
    };

    return streamFileResponse({
      filePath: prepared.filePath,
      filename: prepared.filename,
      contentType: prepared.contentType,
      size: prepared.size,
      onFinish: finish,
    });
  }

  const parsed = parseDownloadParams({
    url: searchParams.get("url") ?? "",
    type: searchParams.get("type") ?? "video",
    height: searchParams.get("height"),
    audioBitrate: searchParams.get("audioBitrate"),
    id: searchParams.get("id"),
    title: searchParams.get("title"),
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validation = await validateUrl(parsed.url);
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
    tempDir = await createJobTempDir(parsed.jobId);

    const result = await downloadMedia({
      url: validation.normalizedUrl,
      type: parsed.type,
      height: parsed.height,
      audioBitrate: parsed.audioBitrate,
      jobId: parsed.jobId,
      tempDir,
      signal: request.signal,
    });

    const filename = sanitizeFilename(
      parsed.requestedTitle || result.title,
      result.extension,
    );

    return streamFileResponse({
      filePath: result.filePath,
      filename,
      contentType: result.contentType,
      size: result.size,
      onFinish: finalize,
    });
  } catch (err) {
    const mapped = mapError(err);
    jobs.update(parsed.jobId, {
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
