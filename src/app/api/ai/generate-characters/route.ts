import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_GENERATE_CHARACTERS } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId, prompt, count } = await req.json();
  if (!gameId || !prompt) {
    return Response.json({ error: "Missing gameId or prompt" }, { status: 400 });
  }

  try {
    const context = await buildGameContext(gameId);

    const existingInfo = context.characters.length > 0
      ? `\n\nExisting characters (avoid duplicating):\n${context.characters.map((c) => `- ${c.name} (${c.type}, faction: ${c.faction ?? "none"}, archetype: ${c.archetype ?? "none"})`).join("\n")}`
      : "";

    const factions = [...new Set(context.characters.map((c) => c.faction).filter(Boolean))];
    const factionInfo = factions.length > 0 ? `\nExisting factions: ${factions.join(", ")}` : "";

    const response = await chatCompletion([
      { role: "system", content: SYSTEM_PROMPT_GENERATE_CHARACTERS },
      {
        role: "user",
        content: `Game: ${context.gameSummary}${existingInfo}${factionInfo}\n\nRequest: Generate ${count ?? "several"} characters based on this description:\n${prompt}\n\nRespond with ONLY a JSON array, no other text.`,
      },
    ]);

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const characters = JSON.parse(jsonMatch[0]);
    return Response.json({ characters });
  } catch (err: any) {
    console.error("Generate characters error:", err);
    return Response.json({ error: err.message ?? "Generation failed" }, { status: 500 });
  }
}
