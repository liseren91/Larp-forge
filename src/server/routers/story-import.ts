import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

const RELATIONSHIP_TYPES = [
  "RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE",
  "FAMILY", "MENTORSHIP", "ENMITY", "OTHER",
] as const;

const characterInput = z.object({
  tempId: z.string(),
  name: z.string().min(1).max(200),
  type: z.enum(["CHARACTER", "NPC"]),
  faction: z.string().optional(),
  archetype: z.string().optional(),
  description: z.string().optional(),
  matchedEntityId: z.string().nullable(),
});

const relationshipInput = z.object({
  fromRef: z.string(),
  toRef: z.string(),
  type: z.enum(RELATIONSHIP_TYPES),
  description: z.string().optional(),
  intensity: z.number().int().min(1).max(10).default(5),
  bidirectional: z.boolean().default(true),
});

export const storyImportRouter = router({
  applyImport: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        characters: z.array(characterInput).max(100),
        relationships: z.array(relationshipInput).max(200),
        typeUpdates: z.array(
          z.object({
            entityId: z.string(),
            type: z.enum(["CHARACTER", "NPC"]),
          })
        ).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });

      return ctx.db.$transaction(async (tx) => {
        const tempIdToRealId: Record<string, string> = {};

        const newChars = input.characters.filter((c) => !c.matchedEntityId);
        if (newChars.length > 0) {
          for (const c of newChars) {
            const created = await tx.gameEntity.create({
              data: {
                name: c.name,
                type: c.type,
                faction: c.faction || undefined,
                archetype: c.archetype || undefined,
                description: c.description || undefined,
                gameId: input.gameId,
              },
            });
            tempIdToRealId[c.tempId] = created.id;
          }
        }

        for (const c of input.characters.filter((c) => c.matchedEntityId)) {
          tempIdToRealId[c.tempId] = c.matchedEntityId!;
        }

        for (const upd of input.typeUpdates) {
          await tx.gameEntity.update({
            where: { id: upd.entityId, game: { ownerId: ctx.session.user.id } },
            data: { type: upd.type },
          });
        }

        const createdRels = [];
        for (const rel of input.relationships) {
          const fromId = tempIdToRealId[rel.fromRef] ?? rel.fromRef;
          const toId = tempIdToRealId[rel.toRef] ?? rel.toRef;

          if (!fromId || !toId || fromId === toId) continue;

          const existing = await tx.relationship.findFirst({
            where: {
              gameId: input.gameId,
              OR: [
                { fromEntityId: fromId, toEntityId: toId },
                { fromEntityId: toId, toEntityId: fromId },
              ],
            },
          });
          if (existing) continue;

          const created = await tx.relationship.create({
            data: {
              gameId: input.gameId,
              fromEntityId: fromId,
              toEntityId: toId,
              type: rel.type,
              description: rel.description || undefined,
              intensity: rel.intensity,
              bidirectional: rel.bidirectional,
            },
          });
          createdRels.push(created);
        }

        return {
          createdCharacters: newChars.length,
          updatedTypes: input.typeUpdates.length,
          createdRelationships: createdRels.length,
        };
      });
    }),
});
