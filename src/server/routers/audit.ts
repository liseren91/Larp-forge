import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere, nestedGameAccessWhere } from "../access";

export const auditRouter = router({
  list: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.auditRun.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        include: { findings: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.string(), resolved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.auditFinding.update({
        where: {
          id: input.id,
          auditRun: nestedGameAccessWhere(ctx.session.user.id),
        },
        data: { resolved: input.resolved },
      });
    }),

  deleteRun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.auditRun.delete({
        where: {
          id: input.id,
          ...nestedGameAccessWhere(ctx.session.user.id),
        },
      });
    }),
});
