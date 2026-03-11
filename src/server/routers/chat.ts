import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { nestedGameAccessWhere } from "../access";

export const chatRouter = router({
  listThreads: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.chatThread.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        include: { _count: { select: { messages: true } } },
        orderBy: { updatedAt: "desc" },
      });
    }),

  createThread: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatThread.create({
        data: {
          gameId: input.gameId,
          title: input.title ?? "New Chat",
        },
      });
    }),

  renameThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        title: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatThread.update({
        where: {
          id: input.threadId,
          ...nestedGameAccessWhere(ctx.session.user.id),
        },
        data: { title: input.title },
      });
    }),

  deleteThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatThread.delete({
        where: {
          id: input.threadId,
          ...nestedGameAccessWhere(ctx.session.user.id),
        },
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        threadId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.chatMessage.findMany({
        where: {
          gameId: input.gameId,
          threadId: input.threadId,
          ...nestedGameAccessWhere(ctx.session.user.id),
        },
        include: {
          actions: {
            orderBy: { createdAt: "asc" },
          },
        },
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
        threadId: z.string(),
        role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [message] = await ctx.db.$transaction([
        ctx.db.chatMessage.create({
          data: {
            gameId: input.gameId,
            threadId: input.threadId,
            role: input.role,
            content: input.content,
            userId: input.role === "USER" ? ctx.session.user.id : undefined,
          },
        }),
        ctx.db.chatThread.update({
          where: { id: input.threadId },
          data: { updatedAt: new Date() },
        }),
      ]);
      return message;
    }),
});
