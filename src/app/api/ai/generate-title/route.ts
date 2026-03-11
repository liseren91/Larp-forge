import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { chatCompletion } from "@/lib/ai/llm-client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { message } = await req.json();
  if (!message) {
    return new Response("Missing message", { status: 400 });
  }

  try {
    const title = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Generate a very short title (3-6 words, max 50 chars) for a chat conversation that starts with the following message. Reply with ONLY the title, no quotes, no punctuation at the end. Use the same language as the message.",
        },
        { role: "user", content: message },
      ],
      { maxTokens: 60 }
    );

    return Response.json({ title: title.trim().slice(0, 100) });
  } catch (err: any) {
    console.error("Generate title error:", err);
    const fallback =
      message.length > 40 ? message.slice(0, 40) + "..." : message;
    return Response.json({ title: fallback });
  }
}
