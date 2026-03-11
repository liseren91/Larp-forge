import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere, nestedGameAccessWhere } from "../access";

export const briefPipelineRouter = router({
  listStages: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.briefPipelineStage.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        orderBy: { sortOrder: "asc" },
      });
    }),

  createStage: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        name: z.string().min(1).max(200),
        slug: z.string().min(1).max(100),
        color: z.string().default("#6b7280"),
        stageType: z.enum(["KANBAN_COLUMN", "CHECKBOX"]).default("KANBAN_COLUMN"),
        isFinal: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });
      const maxSort = await ctx.db.briefPipelineStage.aggregate({
        where: { gameId: input.gameId },
        _max: { sortOrder: true },
      });
      return ctx.db.briefPipelineStage.create({
        data: { ...input, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
      });
    }),

  updateStage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        color: z.string().optional(),
        stageType: z.enum(["KANBAN_COLUMN", "CHECKBOX"]).optional(),
        isFinal: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.briefPipelineStage.update({
        where: { id, ...nestedGameAccessWhere(ctx.session.user.id) },
        data,
      });
    }),

  deleteStage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.briefPipelineStage.delete({
        where: { id: input.id, ...nestedGameAccessWhere(ctx.session.user.id) },
      });
    }),

  reorderStages: protectedProcedure
    .input(z.object({ gameId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });
      await ctx.db.$transaction(
        input.orderedIds.map((id, i) =>
          ctx.db.briefPipelineStage.update({ where: { id }, data: { sortOrder: i } })
        )
      );
    }),

  initPreset: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        preset: z.enum(["default", "bedlam"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      await ctx.db.briefPipelineStage.deleteMany({
        where: { gameId: input.gameId },
      });

      const presets = {
        default: [
          { name: "Draft", slug: "draft", color: "#6b7280", stageType: "KANBAN_COLUMN" as const, isFinal: false },
          { name: "In Progress", slug: "in-progress", color: "#f59e0b", stageType: "KANBAN_COLUMN" as const, isFinal: false },
          { name: "Review", slug: "review", color: "#3b82f6", stageType: "KANBAN_COLUMN" as const, isFinal: false },
          { name: "Approved", slug: "approved", color: "#10b981", stageType: "KANBAN_COLUMN" as const, isFinal: false },
          { name: "Delivered", slug: "delivered", color: "#8b5cf6", stageType: "KANBAN_COLUMN" as const, isFinal: true },
        ],
        bedlam: [
          { name: "Rewrite", slug: "rewrite", color: "#f59e0b", stageType: "CHECKBOX" as const, isFinal: false },
          { name: "Editing", slug: "editing", color: "#3b82f6", stageType: "CHECKBOX" as const, isFinal: false },
          { name: "Emotional Check", slug: "emotions", color: "#ec4899", stageType: "CHECKBOX" as const, isFinal: false },
          { name: "Delivered", slug: "delivered", color: "#10b981", stageType: "CHECKBOX" as const, isFinal: true },
          { name: "Payment", slug: "payment", color: "#8b5cf6", stageType: "CHECKBOX" as const, isFinal: false },
        ],
      };

      const stages = presets[input.preset];
      await ctx.db.briefPipelineStage.createMany({
        data: stages.map((s, i) => ({ ...s, gameId: input.gameId, sortOrder: i })),
      });

      return { count: stages.length };
    }),

  getProgress: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      return ctx.db.briefProgress.findMany({
        where: { character: { gameId: input.gameId } },
        include: {
          currentStage: true,
          checkedStages: { include: { stage: true } },
          character: { select: { id: true, name: true, faction: true, type: true } },
        },
      });
    }),

  setCurrentStage: protectedProcedure
    .input(z.object({ characterId: z.string(), stageId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.gameEntity.findFirstOrThrow({
        where: { id: input.characterId, ...nestedGameAccessWhere(ctx.session.user.id) },
      });

      return ctx.db.briefProgress.upsert({
        where: { characterId: input.characterId },
        create: {
          characterId: input.characterId,
          currentStageId: input.stageId,
          lastMovedAt: new Date(),
        },
        update: {
          currentStageId: input.stageId,
          lastMovedAt: new Date(),
        },
      });
    }),

  toggleCheckbox: protectedProcedure
    .input(z.object({ characterId: z.string(), stageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.gameEntity.findFirstOrThrow({
        where: { id: input.characterId, ...nestedGameAccessWhere(ctx.session.user.id) },
      });

      const progress = await ctx.db.briefProgress.upsert({
        where: { characterId: input.characterId },
        create: { characterId: input.characterId },
        update: {},
      });

      const existing = await ctx.db.briefCheckbox.findUnique({
        where: {
          progressId_stageId: {
            progressId: progress.id,
            stageId: input.stageId,
          },
        },
      });

      if (existing) {
        return ctx.db.briefCheckbox.update({
          where: { id: existing.id },
          data: {
            checked: !existing.checked,
            checkedAt: !existing.checked ? new Date() : null,
          },
        });
      } else {
        return ctx.db.briefCheckbox.create({
          data: {
            progressId: progress.id,
            stageId: input.stageId,
            checked: true,
            checkedAt: new Date(),
          },
        });
      }
    }),
});
