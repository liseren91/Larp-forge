import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

interface CreatedEntity {
  type: string;
  id: string;
  name: string;
}

async function undoCreatedEntities(entities: CreatedEntity[]) {
  // Process in reverse order to handle dependencies
  const reversed = [...entities].reverse();

  for (const entity of reversed) {
    try {
      switch (entity.type) {
        case "character":
        case "npc":
          await db.gameEntity.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "relationship":
          await db.relationship.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "plotline":
          await db.plotline.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "plotline_entity":
          await db.plotlineEntity.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "custom_field_definition":
          await db.customFieldDefinition.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "custom_field_option":
          // Delete value-option links first, then the option
          await db.customFieldValueOption.deleteMany({ where: { optionId: entity.id } }).catch(() => {});
          await db.customFieldOption.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "custom_field_value":
          await db.customFieldValueOption.deleteMany({ where: { valueId: entity.id } }).catch(() => {});
          await db.customFieldValue.delete({ where: { id: entity.id } }).catch(() => {});
          break;

        case "brief_section":
          // Can't fully undo a brief section edit — skip
          break;

        case "timeline_event":
          // Stub — no model yet
          break;
      }
    } catch {
      // Best-effort: continue with remaining entities
    }
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatActionId } = await req.json();

  if (!chatActionId) {
    return Response.json({ error: "Missing chatActionId" }, { status: 400 });
  }

  const action = await db.chatAction.findUnique({
    where: { id: chatActionId },
    include: {
      message: {
        include: {
          game: { select: { ownerId: true } },
        },
      },
    },
  });

  if (!action) {
    return Response.json({ error: "Action not found" }, { status: 404 });
  }

  if (action.message.game.ownerId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action.status !== "APPLIED") {
    return Response.json({ error: "Can only undo APPLIED actions" }, { status: 400 });
  }

  const result = action.result as { createdEntities?: CreatedEntity[] } | null;
  if (result?.createdEntities && result.createdEntities.length > 0) {
    await undoCreatedEntities(result.createdEntities);
  }

  await db.chatAction.update({
    where: { id: chatActionId },
    data: { status: "UNDONE" },
  });

  return Response.json({ success: true });
}
