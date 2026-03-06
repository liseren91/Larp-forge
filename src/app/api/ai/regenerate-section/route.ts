import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildCharacterContext } from "@/lib/ai/context-builder";
import { chatCompletion } from "@/lib/ai/llm-client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId, gameId, section, currentBrief } = await req.json();
  if (!entityId || !gameId || !section) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const charContext = await buildCharacterContext(entityId);

    const sectionLabels: Record<string, string> = {
      backstory: "Backstory",
      personality: "Personality",
      goalsPublic: "Public Goals",
      goalsSecret: "Secret Goals",
      relationships: "Relationships",
      mechanics: "Mechanics",
      contacts: "Contacts",
    };

    const prompt = `You are regenerating the "${sectionLabels[section] ?? section}" section of a character brief for ${charContext.character.name}.

Game: ${charContext.gameName} (${charContext.gameGenre ?? "Unknown genre"})
Character: ${charContext.character.name} (${charContext.character.faction ?? "no faction"}, ${charContext.character.archetype ?? "no archetype"})

Current brief context:
${JSON.stringify(currentBrief, null, 2)}

Relationships: ${charContext.relationships.map((r: any) => `${r.otherName} (${r.type})`).join(", ")}
Plotlines: ${charContext.plotlines.map((p: any) => p.name).join(", ")}

Write ONLY the content for the "${sectionLabels[section] ?? section}" section. Be creative, dramatic, and consistent with the existing brief. 2-4 paragraphs. Output raw text only, no JSON wrapping.`;

    const content = await chatCompletion([
      { role: "system", content: "You are a LARP character brief writer. Output only the requested section content as plain text." },
      { role: "user", content: prompt },
    ]);

    return Response.json({ content });
  } catch (err: any) {
    console.error("Section regeneration error:", err);
    return Response.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
