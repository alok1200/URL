import { NextResponse } from "next/server";
import { validateUrl } from "@/lib/url-validation";
import { getClientIp, getRateLimiter } from "@/lib/rate-limiter";
import { getMediaInfo } from "@/lib/ytdlp";
import { mapError } from "@/lib/error-mapper";
import { logMessage } from "@/lib/config";
import { startBackgroundSweep } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  startBackgroundSweep();

  const ip = getClientIp(request);
  const limiter = getRateLimiter();
  const limitCheck = limiter.checkInfoRateLimit(ip);

  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: `Too many requests. Please wait ${limitCheck.retryAfterSec ?? 60} seconds before trying again.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitCheck.retryAfterSec ?? 60),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url") ?? "";

  const validation = await validateUrl(rawUrl);
  if (!validation.valid || !validation.normalizedUrl) {
    return NextResponse.json(
      { error: validation.error ?? "Please enter a valid video or audio link." },
      { status: 400 },
    );
  }

  try {
    const info = await getMediaInfo(validation.normalizedUrl);
    return NextResponse.json(info, { status: 200 });
  } catch (err) {
    const mapped = mapError(err);
    logMessage("error", "Info extraction failed", {
      code: mapped.code,
      status: mapped.status,
    });
    // Return 4xx/5xx with friendly message, never raw stack traces or paths
    const status = mapped.status >= 400 && mapped.status < 600 ? mapped.status : 400;
    return NextResponse.json({ error: mapped.message }, { status });
  }
}
