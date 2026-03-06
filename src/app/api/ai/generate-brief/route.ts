import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildCharacterContext } from "@/lib/ai/context-builder";
import { buildBriefPrompt } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId, gameId } = await req.json();
  if (!entityId || !gameId) {
    return Response.json({ error: "Missing entityId or gameId" }, { status: 400 });
  }

  try {
    const charContext = await buildCharacterContext(entityId);
    const messages = buildBriefPrompt(charContext);
    const response = await chatCompletion(messages);

    let brief;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      brief = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      brief = {
        backstory: response,
        personality: null,
        goalsPublic: null,
        goalsSecret: null,
        relationships: null,
        mechanics: null,
        contacts: null,
      };
    }

    return Response.json({ brief });
  } catch (err: any) {
    console.error("Brief generation error:", err);
    return Response.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
