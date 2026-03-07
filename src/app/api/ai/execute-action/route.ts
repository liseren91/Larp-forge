import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeAction } from "@/lib/ai/action-executor";
import type { ActionType } from "@/lib/ai/action-types";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { gameId, messageId, actionId, actionType, payload } = body;

  if (!gameId || !actionType || !payload) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const game = await db.game.findFirst({
    where: { id: gameId, ownerId: session.user.id },
  });
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  // Check if action was already applied
  if (messageId && actionId) {
    const existing = await db.chatAction.findFirst({
      where: { messageId, actionId, status: "APPLIED" },
    });
    if (existing) {
      return Response.json(
        { success: true, createdEntities: [], errors: [{ field: "_duplicate", message: "Already applied" }] },
        { status: 200 }
      );
    }
  }

  try {
    const result = await executeAction(gameId, actionType as ActionType, payload);

    // Persist action record — only if we have a valid messageId (ChatMessage.id)
    if (messageId && actionId) {
      try {
        const existingAction = await db.chatAction.findFirst({
          where: { messageId, actionId },
        });

        const statusValue = result.success ? "APPLIED" : "FAILED";
        const appliedAt = result.success ? new Date() : null;

        if (existingAction) {
          await db.chatAction.update({
            where: { id: existingAction.id },
            data: { status: statusValue, result: result as any, appliedAt },
          });
        } else {
          // Verify messageId is a real ChatMessage before creating
          const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
          if (msg) {
            await db.chatAction.create({
              data: {
                messageId,
                actionId,
                actionType,
                payload,
                status: statusValue,
                result: result as any,
                appliedAt,
              },
            });
          }
        }
      } catch (dbErr) {
        console.error("Failed to persist action record:", dbErr);
      }
    }

    return Response.json(result);
  } catch (err: any) {
    console.error("Execute action error:", err);
    return Response.json(
      { success: false, createdEntities: [], errors: [{ field: "_internal", message: err.message ?? "Execution error" }] },
      { status: 500 }
    );
  }
}
