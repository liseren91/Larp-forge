import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_FIELD_ASSIST } from "@/lib/ai/prompts";
import { chatCompletionStream } from "@/lib/ai/llm-client";

const actionInstructions: Record<string, string> = {
  generate:
    "Generate appropriate content for this field from scratch based on the game context. Write in a natural, engaging style matching the game's genre.",
  improve:
    "Improve and rewrite the existing text. Enhance style, clarity, and drama while preserving the original intent. Return only the improved text.",
  expand:
    "Expand and add more detail to the existing text. Add meaningful depth, specific details, and narrative richness. Return the expanded version.",
  translate_ru:
    "Translate the following text to Russian. Preserve the tone, style, and LARP-specific terminology. Return only the translation.",
  translate_en:
    "Translate the following text to English. Preserve the tone, style, and LARP-specific terminology. Return only the translation.",
  custom: "",
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId, fieldName, currentValue, action, customPrompt } = await req.json();
  if (!gameId || !action) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const context = await buildGameContext(gameId);

    const contextBlock = `
Game: ${context.gameSummary}
${context.designDoc ? `Design Doc: ${context.designDoc.slice(0, 1000)}` : ""}
Characters: ${context.characters.map((c) => `${c.name} (${c.faction ?? "no faction"})`).join(", ")}
Plotlines: ${context.plotlines.map((p) => p.name).join(", ")}
${context.documents?.length ? `Documents: ${context.documents.map((d) => `${d.name}${d.description ? ` (${d.description})` : ""}`).join(", ")}` : ""}
`;

    const instruction = action === "custom"
      ? customPrompt
      : actionInstructions[action] ?? actionInstructions.generate;

    const userContent = currentValue
      ? `Field: "${fieldName}"\nCurrent value: "${currentValue}"\n\nInstruction: ${instruction}${action === "custom" ? `\n\nUser prompt: ${customPrompt}` : ""}\n\nGame context:\n${contextBlock}\n\nRespond with ONLY the text for the field, no explanations or quotes.`
      : `Field: "${fieldName}"\n\nInstruction: ${instruction}${action === "custom" ? `\n\nUser prompt: ${customPrompt}` : ""}\n\nGame context:\n${contextBlock}\n\nRespond with ONLY the text for the field, no explanations or quotes.`;

    const stream = chatCompletionStream([
      { role: "system", content: SYSTEM_PROMPT_FIELD_ASSIST },
      { role: "user", content: userContent },
    ]);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("Field assist error:", err);
    return Response.json({ error: err.message ?? "Failed" }, { status: 500 });
  }
}
