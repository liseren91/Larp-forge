import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { buildChatMessages } from "@/lib/ai/prompts";
import { chatCompletionStream } from "@/lib/ai/llm-client";
import { checkRateLimit } from "@/lib/ai/rate-limit";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { allowed } = checkRateLimit(session.user.id);
  if (!allowed) {
    return new Response("Rate limit exceeded. Please wait a moment.", {
      status: 429,
      headers: { "X-RateLimit-Remaining": "0" },
    });
  }

  const { gameId, message } = await req.json();
  if (!gameId || !message) {
    return new Response("Missing gameId or message", { status: 400 });
  }

  try {
    const context = await buildGameContext(gameId);
    const messages = buildChatMessages(context, message);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chatCompletionStream(messages)) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return new Response(err.message ?? "Internal error", { status: 500 });
  }
}
