import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere, nestedGameAccessWhere } from "../access";

export const plotlineRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.plotline.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        include: {
          entities: { include: { entity: true } },
          _count: { select: { entities: true, relationships: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        name: z.string().min(1).max(200),
        type: z.enum(["POLITICAL", "PERSONAL", "MYSTERY", "ACTION", "SOCIAL", "OTHER"]).default("OTHER"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });
      return ctx.db.plotline.create({ data: input });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        type: z.enum(["POLITICAL", "PERSONAL", "MYSTERY", "ACTION", "SOCIAL", "OTHER"]).optional(),
        description: z.string().optional(),
        status: z.enum(["DRAFT", "ACTIVE", "RESOLVED"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.plotline.update({
        where: { id, ...nestedGameAccessWhere(ctx.session.user.id) },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.plotline.delete({
        where: { id: input.id, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
    }),

  assignEntity: protectedProcedure
    .input(
      z.object({
        plotlineId: z.string(),
        entityId: z.string(),
        role: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [plotline, entity] = await Promise.all([
        ctx.db.plotline.findFirstOrThrow({
          where: { id: input.plotlineId, ...nestedGameAccessWhere(ctx.session.user.id) },
          select: { gameId: true },
        }),
        ctx.db.gameEntity.findFirstOrThrow({
          where: { id: input.entityId, ...nestedGameAccessWhere(ctx.session.user.id) },
          select: { gameId: true },
        }),
      ]);
      if (plotline.gameId !== entity.gameId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Plotline and entity must belong to the same game",
        });
      }
      return ctx.db.plotlineEntity.create({ data: input });
    }),

  assignEntities: protectedProcedure
    .input(
      z.object({
        plotlineId: z.string(),
        entityIds: z.array(z.string()).min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.plotline.findFirstOrThrow({
        where: { id: input.plotlineId, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
      const existing = await ctx.db.plotlineEntity.findMany({
        where: { plotlineId: input.plotlineId, entityId: { in: input.entityIds } },
        select: { entityId: true },
      });
      const existingIds = new Set(existing.map((e) => e.entityId));
      const toAdd = input.entityIds.filter((id) => !existingIds.has(id));
      if (toAdd.length === 0) return { added: 0 };
      await ctx.db.plotlineEntity.createMany({
        data: toAdd.map((entityId) => ({ plotlineId: input.plotlineId, entityId })),
        skipDuplicates: true,
      });
      return { added: toAdd.length };
    }),

  removeEntity: protectedProcedure
    .input(z.object({ plotlineId: z.string(), entityId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.plotline.findFirstOrThrow({
        where: { id: input.plotlineId, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
      return ctx.db.plotlineEntity.delete({
        where: {
          plotlineId_entityId: {
            plotlineId: input.plotlineId,
            entityId: input.entityId,
          },
        },
      });
    }),
});
