import { getServerSession } from "next-auth";
import { jsonrepair } from "jsonrepair";
import { authOptions } from "@/lib/auth";
import { chatCompletion } from "@/lib/ai/llm-client";
import { db } from "@/lib/db";
import { gameAccessWhere } from "@/server/access";

const SYSTEM_PROMPT = `You are an AI assistant for LARP game masters. Your task is to recommend which characters (PC and NPC) from the game would best fit a given plotline.

You will receive:
1. A plotline: name, type, and description.
2. A list of available characters (those not yet assigned to this plotline). Each has: id, name, type (PC/NPC), faction, and optional description.

Recommend only characters that would meaningfully contribute to this plotline (thematic fit, faction relevance, or narrative potential). Prefer a focused set (typically 2–8 characters) rather than recommending everyone. Return your answer as a JSON object only, no markdown or extra text:

{"recommendedIds": ["id1", "id2", ...], "reasoning": "Brief explanation in the same language as the plotline."}

Use the exact character "id" values from the list. recommendedIds must be an array of strings. reasoning must be a short string.`;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId, plotlineId } = await req.json();
  if (!gameId || !plotlineId) {
    return Response.json({ error: "Missing gameId or plotlineId" }, { status: 400 });
  }

  const userId = session.user.id;

  const [game, plotline] = await Promise.all([
    db.game.findFirst({
      where: { id: gameId, ...gameAccessWhere(userId) },
      select: { id: true },
    }),
    db.plotline.findFirst({
      where: { id: plotlineId, gameId },
      include: { entities: { select: { entityId: true } } },
    }),
  ]);

  if (!game || !plotline) {
    return Response.json({ error: "Game or plotline not found" }, { status: 404 });
  }

  const assignedIds = new Set(plotline.entities.map((e) => e.entityId));
  const available = await db.gameEntity.findMany({
    where:
      assignedIds.size > 0
        ? { gameId, id: { notIn: Array.from(assignedIds) } }
        : { gameId },
    select: {
      id: true,
      name: true,
      type: true,
      faction: true,
      description: true,
      archetype: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (available.length === 0) {
    return Response.json({
      recommendedIds: [],
      reasoning: "Все персонажи уже добавлены в этот сюжет.",
    });
  }

  const plotlineDesc = [
    `Name: ${plotline.name}`,
    `Type: ${plotline.type}`,
    plotline.description ? `Description: ${plotline.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const charactersList = available
    .map(
      (c) =>
        `- id: "${c.id}" | name: ${c.name} | type: ${c.type} | faction: ${c.faction ?? "—"}${c.archetype ? ` | archetype: ${c.archetype}` : ""}${c.description ? ` | description: ${c.description.slice(0, 200)}${c.description.length > 200 ? "…" : ""}` : ""}`
    )
    .join("\n");

  const userMessage = `Plotline:\n${plotlineDesc}\n\nAvailable characters (use their "id" in recommendedIds):\n${charactersList}\n\nRespond with a single JSON object: {"recommendedIds": ["...", ...], "reasoning": "..."}.`;

  try {
    const response = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      { maxTokens: 1024 }
    );

    let raw = response.trim();
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) raw = codeBlockMatch[1].trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "AI did not return valid JSON", raw: response.slice(0, 500) },
        { status: 500 }
      );
    }

    let parsed: { recommendedIds?: unknown; reasoning?: string };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(jsonMatch[0]));
      } catch {
        return Response.json(
          { error: "Failed to parse AI response", raw: jsonMatch[0].slice(0, 300) },
          { status: 500 }
        );
      }
    }

    const recommendedIds = Array.isArray(parsed.recommendedIds)
      ? (parsed.recommendedIds as string[]).filter(
          (id) => typeof id === "string" && available.some((c) => c.id === id)
        )
      : [];
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";

    return Response.json({ recommendedIds, reasoning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Recommendation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
