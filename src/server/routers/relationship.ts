import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const relationshipRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.relationship.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        include: { fromEntity: true, toEntity: true, plotline: true },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        fromEntityId: z.string(),
        toEntityId: z.string(),
        type: z
          .enum(["RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE", "FAMILY", "MENTORSHIP", "ENMITY", "OTHER"])
          .default("OTHER"),
        description: z.string().optional(),
        intensity: z.number().int().min(1).max(10).default(5),
        bidirectional: z.boolean().default(true),
        plotlineId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });
      return ctx.db.relationship.create({ data: input });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z
          .enum(["RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE", "FAMILY", "MENTORSHIP", "ENMITY", "OTHER"])
          .optional(),
        description: z.string().optional(),
        intensity: z.number().int().min(1).max(10).optional(),
        bidirectional: z.boolean().optional(),
        plotlineId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.relationship.update({
        where: { id, game: { ownerId: ctx.session.user.id } },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.relationship.delete({
        where: { id: input.id, game: { ownerId: ctx.session.user.id } },
      });
    }),
});
