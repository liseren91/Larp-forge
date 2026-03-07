import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, actions } = await req.json();

  if (!messageId || !Array.isArray(actions) || actions.length === 0) {
    return Response.json({ error: "Missing messageId or actions" }, { status: 400 });
  }

  // Verify the message belongs to the user
  const message = await db.chatMessage.findFirst({
    where: {
      id: messageId,
      game: { ownerId: session.user.id },
    },
  });

  if (!message) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  // Don't create duplicates — skip actions that already have a DB record
  const existing = await db.chatAction.findMany({
    where: { messageId },
    select: { actionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.actionId));

  const newActions = actions.filter(
    (a: any) => a.actionId && !existingIds.has(a.actionId)
  );

  if (newActions.length > 0) {
    await db.chatAction.createMany({
      data: newActions.map((a: any) => ({
        messageId,
        actionId: a.actionId,
        actionType: a.actionType,
        payload: a.payload,
        status: "PENDING" as const,
      })),
    });
  }

  return Response.json({ saved: newActions.length });
}
