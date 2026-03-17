import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere, nestedGameAccessWhere } from "../access";

const mergeFieldEnum = z.enum([
  "name",
  "type",
  "faction",
  "archetype",
  "description",
  "status",
]);
const mergeFieldStrategySchema = z
  .object({
    name: z.enum(["target", "source"]).optional(),
    type: z.enum(["target", "source"]).optional(),
    faction: z.enum(["target", "source"]).optional(),
    archetype: z.enum(["target", "source"]).optional(),
    description: z.enum(["target", "source"]).optional(),
    status: z.enum(["target", "source"]).optional(),
  })
  .default({});

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export const characterRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.gameEntity.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        include: {
          relationshipsFrom: { include: { toEntity: true } },
          relationshipsTo: { include: { fromEntity: true } },
          briefVersions: { orderBy: { version: "desc" }, take: 1 },
          plotlineEntities: { include: { plotline: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.gameEntity.findFirst({
        where: { id: input.id, ...nestedGameAccessWhere(ctx.session.user.id) },
        include: {
          relationshipsFrom: { include: { toEntity: true, plotline: true } },
          relationshipsTo: { include: { fromEntity: true, plotline: true } },
          briefVersions: { orderBy: { version: "desc" } },
          plotlineEntities: { include: { plotline: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        name: z.string().min(1).max(200),
        type: z.enum(["CHARACTER", "NPC"]).default("CHARACTER"),
        faction: z.string().optional(),
        archetype: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });
      return ctx.db.gameEntity.create({ data: input });
    }),

  createMany: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        characters: z.array(
          z.object({
            name: z.string().min(1).max(200),
            type: z.enum(["CHARACTER", "NPC"]).default("CHARACTER"),
            faction: z.string().optional(),
            archetype: z.string().optional(),
            description: z.string().optional(),
          })
        ).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });
      const data = input.characters.map((c) => ({ ...c, gameId: input.gameId }));
      return ctx.db.gameEntity.createMany({ data });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        type: z.enum(["CHARACTER", "NPC"]).optional(),
        faction: z.string().optional(),
        archetype: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["DRAFT", "IN_PROGRESS", "READY"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.gameEntity.update({
        where: { id, ...nestedGameAccessWhere(ctx.session.user.id) },
        data,
      });
    }),

  findDuplicateNames: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const entities = await ctx.db.gameEntity.findMany({
        where: { gameId: input.gameId },
        orderBy: { createdAt: "asc" },
        include: {
          _count: {
            select: {
              relationshipsFrom: true,
              relationshipsTo: true,
              plotlineEntities: true,
              customFieldValues: true,
              briefVersions: true,
            },
          },
        },
      });

      const groups = new Map<string, typeof entities>();
      for (const entity of entities) {
        const key = normalizeName(entity.name);
        const list = groups.get(key) ?? [];
        list.push(entity);
        groups.set(key, list);
      }

      return Array.from(groups.entries())
        .filter(([, list]) => list.length > 1)
        .map(([normalizedName, list]) => ({
          normalizedName,
          count: list.length,
          entities: list.map((e) => ({
            id: e.id,
            name: e.name,
            type: e.type,
            faction: e.faction,
            archetype: e.archetype,
            description: e.description,
            status: e.status,
            createdAt: e.createdAt,
            relationshipsCount: e._count.relationshipsFrom + e._count.relationshipsTo,
            plotlinesCount: e._count.plotlineEntities,
            attributesCount: e._count.customFieldValues,
            briefsCount: e._count.briefVersions,
          })),
        }));
    }),

  previewMerge: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        targetId: z.string(),
        sourceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.targetId === input.sourceId) {
        throw new Error("Target and source must be different");
      }

      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const [target, source] = await Promise.all([
        ctx.db.gameEntity.findFirstOrThrow({
          where: { id: input.targetId, gameId: input.gameId },
          include: {
            _count: {
              select: {
                relationshipsFrom: true,
                relationshipsTo: true,
                plotlineEntities: true,
                customFieldValues: true,
                briefVersions: true,
              },
            },
          },
        }),
        ctx.db.gameEntity.findFirstOrThrow({
          where: { id: input.sourceId, gameId: input.gameId },
          include: {
            _count: {
              select: {
                relationshipsFrom: true,
                relationshipsTo: true,
                plotlineEntities: true,
                customFieldValues: true,
                briefVersions: true,
              },
            },
          },
        }),
      ]);

      const fieldDiffs = [
        { field: "name" as const, target: target.name, source: source.name },
        { field: "type" as const, target: target.type, source: source.type },
        { field: "faction" as const, target: target.faction, source: source.faction },
        { field: "archetype" as const, target: target.archetype, source: source.archetype },
        { field: "description" as const, target: target.description, source: source.description },
        { field: "status" as const, target: target.status, source: source.status },
      ].map((d) => ({
        ...d,
        different: (d.target ?? "") !== (d.source ?? ""),
        suggested: (d.target == null || d.target === "") && d.source ? "source" : "target",
      }));

      return {
        target: {
          id: target.id,
          name: target.name,
          relationshipsCount: target._count.relationshipsFrom + target._count.relationshipsTo,
          plotlinesCount: target._count.plotlineEntities,
          attributesCount: target._count.customFieldValues,
          briefsCount: target._count.briefVersions,
        },
        source: {
          id: source.id,
          name: source.name,
          relationshipsCount: source._count.relationshipsFrom + source._count.relationshipsTo,
          plotlinesCount: source._count.plotlineEntities,
          attributesCount: source._count.customFieldValues,
          briefsCount: source._count.briefVersions,
        },
        fieldDiffs,
      };
    }),

  mergeDuplicate: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        targetId: z.string(),
        sourceId: z.string(),
        fieldStrategy: mergeFieldStrategySchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.targetId === input.sourceId) {
        throw new Error("Target and source must be different");
      }

      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      return ctx.db.$transaction(async (tx) => {
        const [target, source] = await Promise.all([
          tx.gameEntity.findFirstOrThrow({
            where: { id: input.targetId, gameId: input.gameId },
          }),
          tx.gameEntity.findFirstOrThrow({
            where: { id: input.sourceId, gameId: input.gameId },
          }),
        ]);

        const pickField = <T>(field: z.infer<typeof mergeFieldEnum>, targetValue: T, sourceValue: T): T => {
          return input.fieldStrategy[field] === "source" ? sourceValue : targetValue;
        };

        await tx.gameEntity.update({
          where: { id: target.id },
          data: {
            name: pickField("name", target.name, source.name),
            type: pickField("type", target.type, source.type),
            faction: pickField("faction", target.faction, source.faction),
            archetype: pickField("archetype", target.archetype, source.archetype),
            description: pickField("description", target.description, source.description),
            status: pickField("status", target.status, source.status),
          },
        });

        const sourcePlotlines = await tx.plotlineEntity.findMany({
          where: { entityId: source.id },
          select: { plotlineId: true },
        });
        if (sourcePlotlines.length > 0) {
          await tx.plotlineEntity.createMany({
            data: sourcePlotlines.map((p) => ({ plotlineId: p.plotlineId, entityId: target.id })),
            skipDuplicates: true,
          });
          await tx.plotlineEntity.deleteMany({ where: { entityId: source.id } });
        }

        const involvedRels = await tx.relationship.findMany({
          where: {
            gameId: input.gameId,
            OR: [{ fromEntityId: source.id }, { toEntityId: source.id }],
          },
        });
        let removedSelfRelationships = 0;
        for (const rel of involvedRels) {
          const fromEntityId = rel.fromEntityId === source.id ? target.id : rel.fromEntityId;
          const toEntityId = rel.toEntityId === source.id ? target.id : rel.toEntityId;
          if (fromEntityId === toEntityId) {
            await tx.relationship.delete({ where: { id: rel.id } });
            removedSelfRelationships++;
            continue;
          }
          await tx.relationship.update({
            where: { id: rel.id },
            data: { fromEntityId, toEntityId },
          });
        }

        const [sourceValues, targetValues] = await Promise.all([
          tx.customFieldValue.findMany({
            where: { characterId: source.id },
            include: { selectedOptions: true },
          }),
          tx.customFieldValue.findMany({
            where: { characterId: target.id },
            include: { selectedOptions: true },
          }),
        ]);
        const targetByDefinition = new Map(targetValues.map((v) => [v.definitionId, v] as const));
        for (const sourceVal of sourceValues) {
          const targetVal = targetByDefinition.get(sourceVal.definitionId);
          if (!targetVal) {
            await tx.customFieldValue.update({
              where: { id: sourceVal.id },
              data: { characterId: target.id },
            });
            continue;
          }
          const shouldCopyScalar =
            (targetVal.textValue == null && sourceVal.textValue != null) ||
            (targetVal.numberValue == null && sourceVal.numberValue != null) ||
            (targetVal.booleanValue == null && sourceVal.booleanValue != null) ||
            (targetVal.dateValue == null && sourceVal.dateValue != null);
          if (shouldCopyScalar) {
            await tx.customFieldValue.update({
              where: { id: targetVal.id },
              data: {
                textValue: targetVal.textValue ?? sourceVal.textValue,
                numberValue: targetVal.numberValue ?? sourceVal.numberValue,
                booleanValue: targetVal.booleanValue ?? sourceVal.booleanValue,
                dateValue: targetVal.dateValue ?? sourceVal.dateValue,
              },
            });
          }
          const unionOptionIds = new Set([
            ...targetVal.selectedOptions.map((o) => o.optionId),
            ...sourceVal.selectedOptions.map((o) => o.optionId),
          ]);
          await tx.customFieldValueOption.deleteMany({ where: { valueId: targetVal.id } });
          if (unionOptionIds.size > 0) {
            await tx.customFieldValueOption.createMany({
              data: Array.from(unionOptionIds).map((optionId) => ({ valueId: targetVal.id, optionId })),
            });
          }
          await tx.customFieldValue.delete({ where: { id: sourceVal.id } });
        }

        const [sourceSubRoles, targetSubRoles] = await Promise.all([
          tx.subRole.findMany({ where: { characterId: source.id } }),
          tx.subRole.findMany({ where: { characterId: target.id } }),
        ]);
        const targetSubRoleByDef = new Map(targetSubRoles.map((s) => [s.definitionId, s] as const));
        for (const sourceSubRole of sourceSubRoles) {
          const targetSubRole = targetSubRoleByDef.get(sourceSubRole.definitionId);
          if (!targetSubRole) {
            await tx.subRole.update({
              where: { id: sourceSubRole.id },
              data: { characterId: target.id },
            });
            continue;
          }
          if (!targetSubRole.notes && sourceSubRole.notes) {
            await tx.subRole.update({
              where: { id: targetSubRole.id },
              data: { notes: sourceSubRole.notes },
            });
          }
          await tx.subRole.delete({ where: { id: sourceSubRole.id } });
        }

        const [targetProgress, sourceProgress] = await Promise.all([
          tx.briefProgress.findUnique({ where: { characterId: target.id } }),
          tx.briefProgress.findUnique({ where: { characterId: source.id } }),
        ]);
        if (sourceProgress && !targetProgress) {
          await tx.briefProgress.update({
            where: { id: sourceProgress.id },
            data: { characterId: target.id },
          });
        } else if (sourceProgress && targetProgress) {
          await tx.briefCheckbox.createMany({
            data: (
              await tx.briefCheckbox.findMany({
                where: { progressId: sourceProgress.id, checked: true },
                select: { stageId: true },
              })
            ).map((c) => ({ progressId: targetProgress.id, stageId: c.stageId, checked: true })),
            skipDuplicates: true,
          });
          if (!targetProgress.notes && sourceProgress.notes) {
            await tx.briefProgress.update({
              where: { id: targetProgress.id },
              data: { notes: sourceProgress.notes },
            });
          }
          await tx.briefProgress.delete({ where: { id: sourceProgress.id } });
        }

        const [targetBriefMax, sourceBriefs] = await Promise.all([
          tx.briefVersion.aggregate({
            where: { entityId: target.id },
            _max: { version: true },
          }),
          tx.briefVersion.findMany({
            where: { entityId: source.id },
            orderBy: { version: "asc" },
          }),
        ]);
        let nextVersion = (targetBriefMax._max.version ?? 0) + 1;
        for (const brief of sourceBriefs) {
          await tx.briefVersion.create({
            data: {
              entityId: target.id,
              version: nextVersion++,
              status: brief.status,
              backstory: brief.backstory,
              personality: brief.personality,
              goalsPublic: brief.goalsPublic,
              goalsSecret: brief.goalsSecret,
              relationships: brief.relationships,
              mechanics: brief.mechanics,
              contacts: brief.contacts,
              fullText: brief.fullText,
            },
          });
        }
        if (sourceBriefs.length > 0) {
          await tx.briefVersion.deleteMany({ where: { entityId: source.id } });
        }

        await tx.gameEntity.delete({ where: { id: source.id } });

        return {
          success: true,
          mergedIntoId: target.id,
          removedId: source.id,
          removedSelfRelationships,
          movedPlotlines: sourcePlotlines.length,
          movedCustomFields: sourceValues.length,
          movedSubRoles: sourceSubRoles.length,
          movedBriefVersions: sourceBriefs.length,
        };
      }, { timeout: 120000, maxWait: 15000 });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.gameEntity.delete({
        where: { id: input.id, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
    }),

  deleteMany: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        ids: z.array(z.string()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const result = await ctx.db.gameEntity.deleteMany({
        where: {
          id: { in: input.ids },
          gameId: input.gameId,
          ...nestedGameAccessWhere(ctx.session.user.id),
        },
      });

      return { deleted: result.count };
    }),
});
