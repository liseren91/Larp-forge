import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const plotlineMatrixRouter = router({
  getData: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });

      const characters = await ctx.db.gameEntity.findMany({
        where: { gameId: game.id },
        orderBy: [{ faction: "asc" }, { name: "asc" }],
        select: { id: true, name: true, faction: true, type: true },
      });

      const plotlines = await ctx.db.plotline.findMany({
        where: { gameId: game.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, type: true, status: true },
      });

      const assignments = await ctx.db.plotlineEntity.findMany({
        where: { plotline: { gameId: game.id } },
        select: { plotlineId: true, entityId: true },
      });

      const cells: Record<string, Set<string>> = {};
      for (const a of assignments) {
        if (!cells[a.plotlineId]) cells[a.plotlineId] = new Set();
        cells[a.plotlineId].add(a.entityId);
      }

      const columnTotals: Record<string, number> = {};
      for (const c of characters) {
        columnTotals[c.id] = 0;
      }
      const rowTotals: Record<string, number> = {};
      for (const p of plotlines) {
        rowTotals[p.id] = cells[p.id]?.size ?? 0;
        for (const entityId of cells[p.id] ?? []) {
          columnTotals[entityId] = (columnTotals[entityId] ?? 0) + 1;
        }
      }

      const serializedCells: Record<string, string[]> = {};
      for (const [plotlineId, entityIds] of Object.entries(cells)) {
        serializedCells[plotlineId] = Array.from(entityIds);
      }

      return { characters, plotlines, cells: serializedCells, columnTotals, rowTotals };
    }),

  toggleCell: protectedProcedure
    .input(z.object({ plotlineId: z.string(), characterId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plotline = await ctx.db.plotline.findFirstOrThrow({
        where: { id: input.plotlineId, game: { ownerId: ctx.session.user.id } },
      });

      const existing = await ctx.db.plotlineEntity.findUnique({
        where: {
          plotlineId_entityId: {
            plotlineId: plotline.id,
            entityId: input.characterId,
          },
        },
      });

      if (existing) {
        await ctx.db.plotlineEntity.delete({ where: { id: existing.id } });
        return { assigned: false };
      } else {
        await ctx.db.plotlineEntity.create({
          data: { plotlineId: plotline.id, entityId: input.characterId },
        });
        return { assigned: true };
      }
    }),

  bulkUpdate: protectedProcedure
    .input(
      z.object({
        plotlineId: z.string(),
        characterIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plotline = await ctx.db.plotline.findFirstOrThrow({
        where: { id: input.plotlineId, game: { ownerId: ctx.session.user.id } },
      });

      await ctx.db.plotlineEntity.deleteMany({
        where: { plotlineId: plotline.id },
      });

      if (input.characterIds.length > 0) {
        await ctx.db.plotlineEntity.createMany({
          data: input.characterIds.map((entityId) => ({
            plotlineId: plotline.id,
            entityId,
          })),
        });
      }

      return { success: true };
    }),
});
