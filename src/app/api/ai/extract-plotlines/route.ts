import { getServerSession } from "next-auth";
import { jsonrepair } from "jsonrepair";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_EXTRACT_PLOTLINES } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";
import { db } from "@/lib/db";

const MAX_TEXT_LENGTH = 30_000;

interface ExtractedCharacter {
  tempId: string;
  name: string;
  suggestedType: string;
  faction?: string | null;
  archetype?: string | null;
  description?: string | null;
  matchedEntityId?: string | null;
  confidence: number;
}

interface ExtractedRelationship {
  tempId: string;
  fromRef: string;
  toRef: string;
  typeLabel: string;
  description?: string | null;
  intensity: number;
  bidirectional: boolean;
}

interface ExtractedPlotline {
  tempId: string;
  name: string;
  type: string;
  description: string;
  evidence?: string;
  characters: ExtractedCharacter[];
  relationships: ExtractedRelationship[];
}

function extractAndParseJson(response: string): { plotlines: ExtractedPlotline[] } {
  let raw = response.trim();

  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    raw = codeBlockMatch[1].trim();
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in AI response");
  }

  let parsed: { plotlines?: unknown[] };
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
    plotlines: Array.isArray(parsed.plotlines) ? (parsed.plotlines as ExtractedPlotline[]) : [],
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

    const existingPlotlines = context.plotlines.length > 0
      ? context.plotlines.map((p) =>
          `- "${p.name}" (${p.type}): ${p.characters.join(", ") || "no characters"}`
        ).join("\n")
      : "No existing plotlines.";

    const response = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT_EXTRACT_PLOTLINES },
        {
          role: "user",
          content: `## Game
${context.gameSummary}

## Existing Characters
${existingEntities}

## Existing Plotlines
${existingPlotlines}

## Document to Analyze
${truncated}

Extract all major plotlines from the document above. For each plotline, identify the characters involved and the key relationships between them. Match characters to existing ones where possible. Respond with ONLY the JSON object.`,
        },
      ],
      { maxTokens: 8192 }
    );

    const parsed = extractAndParseJson(response);
    return Response.json(parsed);
  } catch (err: any) {
    console.error("Extract plotlines error:", err);
    return Response.json({ error: err.message ?? "Extraction failed" }, { status: 500 });
  }
}
