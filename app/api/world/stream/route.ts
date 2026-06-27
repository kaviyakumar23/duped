import { getWorldSnapshot } from "@/lib/world/read-model";

/**
 * GET /api/world/stream — the live world feed (SSE). Pushes a full world snapshot every ~1.5s so
 * the arena + economy console render the authoritative state in real time. Stops on client
 * disconnect or after a hard safety cap. The correctness proof is /api/world/proof reading DSQL;
 * this is the display plane.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICK_MS = 1_500;
const MAX_DURATION_MS = 280_000; // hard safety cap

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let closed = false;

      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Stop when the client disconnects.
      if (request.signal.aborted) {
        close();
        return;
      }
      request.signal.addEventListener("abort", close);

      const tick = async () => {
        if (closed) return;
        if (Date.now() - startedAt > MAX_DURATION_MS) {
          close();
          return;
        }
        try {
          send(await getWorldSnapshot());
        } catch (err) {
          send({ error: err instanceof Error ? err.message : "stream error" });
        }
      };

      const timer = setInterval(tick, TICK_MS);
      await tick(); // emit immediately so the UI isn't blank for the first tick
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
