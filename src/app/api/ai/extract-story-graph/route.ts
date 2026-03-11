import { getServerSession } from "next-auth";
import { jsonrepair } from "jsonrepair";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_EXTRACT_STORY_GRAPH } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";
import { db } from "@/lib/db";
import { gameAccessWhere } from "@/server/access";

const MAX_TEXT_LENGTH = 30_000;

function extractAndParseJson(response: string): { characters: unknown[]; relationships: unknown[] } {
  let raw = response.trim();

  // Extract from markdown code block if present
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    raw = codeBlockMatch[1].trim();
  }

  // Find JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in AI response");
  }

  let parsed: { characters?: unknown[]; relationships?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(jsonMatch[0]));
    } catch (repairErr: unknown) {
      const msg = repairErr instanceof Error ? repairErr.message : "Invalid JSON";
      throw new Error(`Failed to parse AI response: ${msg}`);
    }
  }

  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
  };
}

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
        where: { id: fileId, gameId, game: gameAccessWhere(session.user.id) },
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

    const response = await chatCompletion(
      [
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
      ],
      { maxTokens: 8192 }
    );

    const parsed = extractAndParseJson(response);
    return Response.json(parsed);
  } catch (err: any) {
    console.error("Extract story graph error:", err);
    return Response.json({ error: err.message ?? "Extraction failed" }, { status: 500 });
  }
}
