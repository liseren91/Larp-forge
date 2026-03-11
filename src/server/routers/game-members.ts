import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere } from "../access";

export const gameMembersRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
        select: { id: true, ownerId: true },
      });
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });

      const members = await ctx.db.gameMember.findMany({
        where: { gameId: input.gameId },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      });

      return {
        ownerId: game.ownerId,
        members,
      };
    }),

  invite: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        email: z.string().email(),
        role: z.enum(["EDITOR", "VIEWER"]).default("EDITOR"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });
      if (!game) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can invite members" });
      }

      const targetUser = await ctx.db.user.findUnique({
        where: { email: input.email },
      });
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found. They must register first.",
        });
      }

      if (targetUser.id === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot invite yourself" });
      }

      const existing = await ctx.db.gameMember.findUnique({
        where: { gameId_userId: { gameId: input.gameId, userId: targetUser.id } },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "User is already a member" });
      }

      return ctx.db.gameMember.create({
        data: {
          gameId: input.gameId,
          userId: targetUser.id,
          role: input.role,
        },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),

  remove: protectedProcedure
    .input(z.object({ gameId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });
      if (!game) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can remove members" });
      }

      return ctx.db.gameMember.delete({
        where: { gameId_userId: { gameId: input.gameId, userId: input.userId } },
      });
    }),

  leave: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId },
        select: { ownerId: true },
      });
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });

      if (game.ownerId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The owner cannot leave the project" });
      }

      return ctx.db.gameMember.delete({
        where: { gameId_userId: { gameId: input.gameId, userId: ctx.session.user.id } },
      });
    }),
});
