import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const fileRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.gameFile.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          category: true,
          description: true,
          extractedText: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.gameFile.findFirst({
        where: { id: input.id, game: { ownerId: ctx.session.user.id } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        description: z.string().optional(),
        category: z.enum(["DESIGN_DOC", "RULESET", "REFERENCE", "EXPORT"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.gameFile.update({
        where: { id, game: { ownerId: ctx.session.user.id } },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.gameFile.delete({
        where: { id: input.id, game: { ownerId: ctx.session.user.id } },
      });
    }),
});
