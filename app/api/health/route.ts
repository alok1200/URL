import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/ytdlp";
import { startBackgroundSweep } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  startBackgroundSweep();
  const health = await checkHealth();

  return NextResponse.json(
    {
      status: health.ok ? "ok" : "degraded",
      ytdlp: health.ytdlp,
      ffmpeg: health.ffmpeg,
      timestamp: new Date().toISOString(),
    },
    { status: health.ok ? 200 : 503 },
  );
}
