import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere, nestedGameAccessWhere } from "../access";

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

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.gameEntity.delete({
        where: { id: input.id, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
    }),
});
