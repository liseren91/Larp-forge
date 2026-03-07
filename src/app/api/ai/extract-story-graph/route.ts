import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_EXTRACT_STORY_GRAPH } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";
import { db } from "@/lib/db";

const MAX_TEXT_LENGTH = 30_000;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId, fileId, text } = await req.json();
  if (!gameId) {
    return Response.json({ error: "Missing gameId" }, { status: 400 });
  }
  if (!fileId && !text) {
    return Response.json({ error: "Provide fileId or text" }, { status: 400 });
  }

  try {
    let storyText = text as string | undefined;

    if (fileId && !storyText) {
      const file = await db.gameFile.findFirst({
        where: { id: fileId, gameId, game: { ownerId: session.user.id } },
        select: { extractedText: true },
      });
      if (!file?.extractedText) {
        return Response.json({ error: "File has no extracted text" }, { status: 400 });
      }
      storyText = file.extractedText;
    }

    if (!storyText?.trim()) {
      return Response.json({ error: "Empty text" }, { status: 400 });
    }

    const truncated = storyText.length > MAX_TEXT_LENGTH
      ? storyText.slice(0, MAX_TEXT_LENGTH) + "\n\n[...text truncated...]"
      : storyText;

    const context = await buildGameContext(gameId);

    const existingEntities = context.characters.length > 0
      ? context.characters.map((c) =>
          `- ID="${c.id}" Name="${c.name}" Type=${c.type} Faction="${c.faction ?? "none"}" Archetype="${c.archetype ?? "none"}"`
        ).join("\n")
      : "No existing characters.";

    const existingRelationships = context.relationships.length > 0
      ? context.relationships.map((r) =>
          `- ${r.from} ${r.bidirectional ? "↔" : "→"} ${r.to}: ${r.type}`
        ).join("\n")
      : "No existing relationships.";

    const response = await chatCompletion([
      { role: "system", content: SYSTEM_PROMPT_EXTRACT_STORY_GRAPH },
      {
        role: "user",
        content: `## Game
${context.gameSummary}

## Existing Characters
${existingEntities}

## Existing Relationships
${existingRelationships}

## Story Document to Analyze
${truncated}

Extract all characters and relationships from the story document above. Match characters to existing ones where possible. Respond with ONLY the JSON object.`,
      },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.characters || !Array.isArray(parsed.characters)) {
      parsed.characters = [];
    }
    if (!parsed.relationships || !Array.isArray(parsed.relationships)) {
      parsed.relationships = [];
    }

    return Response.json(parsed);
  } catch (err: any) {
    console.error("Extract story graph error:", err);
    return Response.json({ error: err.message ?? "Extraction failed" }, { status: 500 });
  }
}
