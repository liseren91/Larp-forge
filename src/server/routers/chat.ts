import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const chatRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.chatMessage.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        orderBy: { createdAt: "asc" },
        take: input.limit,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
      });
      return messages;
    }),

  append: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatMessage.create({
        data: {
          ...input,
          userId: input.role === "USER" ? ctx.session.user.id : undefined,
        },
      });
    }),
});
