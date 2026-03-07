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

const PLOTLINE_TYPES = [
  "POLITICAL", "PERSONAL", "MYSTERY", "ACTION", "SOCIAL", "OTHER",
] as const;

const plotlineCharInput = z.object({
  tempId: z.string(),
  name: z.string().min(1).max(200),
  type: z.enum(["CHARACTER", "NPC"]),
  faction: z.string().optional(),
  archetype: z.string().optional(),
  description: z.string().optional(),
  matchedEntityId: z.string().nullable(),
});

const plotlineRelInput = z.object({
  fromRef: z.string(),
  toRef: z.string(),
  type: z.enum(RELATIONSHIP_TYPES),
  description: z.string().optional(),
  intensity: z.number().int().min(1).max(10).default(5),
  bidirectional: z.boolean().default(true),
});

const plotlineItemInput = z.object({
  tempId: z.string(),
  name: z.string().min(1).max(200),
  type: z.enum(PLOTLINE_TYPES).default("OTHER"),
  description: z.string().optional(),
  characters: z.array(plotlineCharInput).max(100),
  relationships: z.array(plotlineRelInput).max(200),
});

export const storyImportRouter = router({
  applyPlotlinesImport: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        plotlines: z.array(plotlineItemInput).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });

      return ctx.db.$transaction(async (tx) => {
        const tempIdToRealId: Record<string, string> = {};
        let createdCharacters = 0;
        let reusedCharacters = 0;
        let createdPlotlines = 0;
        let skippedPlotlines = 0;
        let linkedToPlotlines = 0;
        let createdRelationships = 0;

        const allChars = input.plotlines.flatMap((pl) => pl.characters);
        const uniqueChars = new Map<string, typeof allChars[number]>();
        for (const c of allChars) {
          if (!uniqueChars.has(c.tempId)) uniqueChars.set(c.tempId, c);
        }

        for (const c of uniqueChars.values()) {
          if (c.matchedEntityId) {
            tempIdToRealId[c.tempId] = c.matchedEntityId;
            reusedCharacters++;
          } else {
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
            createdCharacters++;
          }
        }

        for (const plInput of input.plotlines) {
          const normalizedName = plInput.name.trim().toLowerCase();
          const duplicate = await tx.plotline.findFirst({
            where: {
              gameId: input.gameId,
              name: { equals: normalizedName, mode: "insensitive" },
            },
          });

          let plotlineId: string;
          if (duplicate) {
            plotlineId = duplicate.id;
            skippedPlotlines++;
          } else {
            const created = await tx.plotline.create({
              data: {
                gameId: input.gameId,
                name: plInput.name.trim(),
                type: plInput.type,
                description: plInput.description || undefined,
              },
            });
            plotlineId = created.id;
            createdPlotlines++;
          }

          for (const c of plInput.characters) {
            const entityId = tempIdToRealId[c.tempId];
            if (!entityId) continue;

            const existingLink = await tx.plotlineEntity.findUnique({
              where: { plotlineId_entityId: { plotlineId, entityId } },
            });
            if (!existingLink) {
              await tx.plotlineEntity.create({ data: { plotlineId, entityId } });
              linkedToPlotlines++;
            }
          }

          for (const rel of plInput.relationships) {
            const fromId = tempIdToRealId[rel.fromRef] ?? rel.fromRef;
            const toId = tempIdToRealId[rel.toRef] ?? rel.toRef;
            if (!fromId || !toId || fromId === toId) continue;

            const existingRel = await tx.relationship.findFirst({
              where: {
                gameId: input.gameId,
                plotlineId,
                OR: [
                  { fromEntityId: fromId, toEntityId: toId },
                  { fromEntityId: toId, toEntityId: fromId },
                ],
              },
            });
            if (existingRel) continue;

            await tx.relationship.create({
              data: {
                gameId: input.gameId,
                fromEntityId: fromId,
                toEntityId: toId,
                type: rel.type,
                description: rel.description || undefined,
                intensity: rel.intensity,
                bidirectional: rel.bidirectional,
                plotlineId,
              },
            });
            createdRelationships++;
          }
        }

        return {
          createdPlotlines,
          skippedPlotlines,
          createdCharacters,
          reusedCharacters,
          linkedToPlotlines,
          createdRelationships,
        };
      }, { timeout: 30000 });
    }),

  applyPlotlineImport: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        plotlineId: z.string(),
        characters: z.array(characterInput).max(100),
        relationships: z.array(relationshipInput).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });
      await ctx.db.plotline.findFirstOrThrow({
        where: { id: input.plotlineId, gameId: input.gameId },
      });

      return ctx.db.$transaction(async (tx) => {
        const tempIdToRealId: Record<string, string> = {};

        const newChars = input.characters.filter((c) => !c.matchedEntityId);
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

        for (const c of input.characters.filter((c) => c.matchedEntityId)) {
          tempIdToRealId[c.tempId] = c.matchedEntityId!;
        }

        let linkedToPlotline = 0;
        for (const c of input.characters) {
          const entityId = tempIdToRealId[c.tempId];
          if (!entityId) continue;

          const existing = await tx.plotlineEntity.findUnique({
            where: {
              plotlineId_entityId: {
                plotlineId: input.plotlineId,
                entityId,
              },
            },
          });
          if (!existing) {
            await tx.plotlineEntity.create({
              data: { plotlineId: input.plotlineId, entityId },
            });
            linkedToPlotline++;
          }
        }

        const createdRels = [];
        for (const rel of input.relationships) {
          const fromId = tempIdToRealId[rel.fromRef] ?? rel.fromRef;
          const toId = tempIdToRealId[rel.toRef] ?? rel.toRef;

          if (!fromId || !toId || fromId === toId) continue;

          const existingRel = await tx.relationship.findFirst({
            where: {
              gameId: input.gameId,
              OR: [
                { fromEntityId: fromId, toEntityId: toId },
                { fromEntityId: toId, toEntityId: fromId },
              ],
            },
          });
          if (existingRel) continue;

          const created = await tx.relationship.create({
            data: {
              gameId: input.gameId,
              fromEntityId: fromId,
              toEntityId: toId,
              type: rel.type,
              description: rel.description || undefined,
              intensity: rel.intensity,
              bidirectional: rel.bidirectional,
              plotlineId: input.plotlineId,
            },
          });
          createdRels.push(created);
        }

        return {
          createdCharacters: newChars.length,
          linkedToPlotline,
          createdRelationships: createdRels.length,
        };
      });
    }),

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
