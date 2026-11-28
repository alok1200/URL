import { getJobManager, type ProgressEvent } from "@/lib/job-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("id")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);

  if (!jobId) {
    return new Response(JSON.stringify({ error: "Missing job id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobs = getJobManager();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Stream may already be closed
        }
      };

      const send = (event: ProgressEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.stage === "ready" || event.stage === "error") {
            close();
          }
        } catch {
          close();
        }
      };

      const unsubscribe = jobs.subscribe(jobId, send);

      // Keep SSE connection alive across proxies
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          close();
        }
      }, 15_000);

      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
