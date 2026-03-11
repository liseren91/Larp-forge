import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere } from "../access";

export const gameRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.game.findMany({
      where: gameAccessWhere(ctx.session.user.id),
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { characters: true, plotlines: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirst({
        where: { id: input.id, ...gameAccessWhere(ctx.session.user.id) },
        include: {
          characters: { orderBy: { createdAt: "asc" } },
          relationships: true,
          plotlines: { include: { entities: true } },
          files: true,
          _count: {
            select: { characters: true, relationships: true, plotlines: true, chatMessages: true },
          },
        },
      });
      return game;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        genre: z.string().optional(),
        setting: z.string().optional(),
        format: z.enum(["CHAMBER", "FIELD"]).default("CHAMBER"),
        playerCount: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.game.create({
        data: { ...input, ownerId: ctx.session.user.id },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        genre: z.string().optional(),
        setting: z.string().optional(),
        format: z.enum(["CHAMBER", "FIELD"]).optional(),
        playerCount: z.number().int().positive().optional(),
        status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
        designDocSummary: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db.game.findFirstOrThrow({
        where: { id, ...gameAccessWhere(ctx.session.user.id) },
      });
      return ctx.db.game.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.game.delete({
        where: { id: input.id, ownerId: ctx.session.user.id },
      });
    }),
});
