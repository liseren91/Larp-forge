import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { nestedGameAccessWhere } from "../access";

export const briefRouter = router({
  listByEntity: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.briefVersion.findMany({
        where: {
          entityId: input.entityId,
          entity: nestedGameAccessWhere(ctx.session.user.id),
        },
        orderBy: { version: "desc" },
      });
    }),

  getLatest: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.briefVersion.findFirst({
        where: {
          entityId: input.entityId,
          entity: nestedGameAccessWhere(ctx.session.user.id),
        },
        orderBy: { version: "desc" },
      });
    }),

  save: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        backstory: z.string().optional(),
        personality: z.string().optional(),
        goalsPublic: z.string().optional(),
        goalsSecret: z.string().optional(),
        relationships: z.string().optional(),
        mechanics: z.string().optional(),
        contacts: z.string().optional(),
        fullText: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { entityId, ...sections } = input;
      await ctx.db.gameEntity.findFirstOrThrow({
        where: { id: entityId, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
      const latest = await ctx.db.briefVersion.findFirst({
        where: { entityId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      return ctx.db.briefVersion.create({
        data: { entityId, version: nextVersion, ...sections },
      });
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["DRAFT", "REVIEW", "APPROVED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.briefVersion.findFirstOrThrow({
        where: {
          id: input.id,
          entity: nestedGameAccessWhere(ctx.session.user.id),
        },
      });
      return ctx.db.briefVersion.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});
