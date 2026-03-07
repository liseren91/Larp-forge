import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const subRolesRouter = router({
  listDefinitions: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.subRoleDefinition.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        orderBy: { sortOrder: "asc" },
      });
    }),

  createDefinition: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        name: z.string().min(1).max(200),
        slug: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });
      const maxSort = await ctx.db.subRoleDefinition.aggregate({
        where: { gameId: input.gameId },
        _max: { sortOrder: true },
      });
      return ctx.db.subRoleDefinition.create({
        data: { ...input, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
      });
    }),

  updateDefinition: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.subRoleDefinition.update({
        where: { id, game: { ownerId: ctx.session.user.id } },
        data,
      });
    }),

  deleteDefinition: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.subRoleDefinition.delete({
        where: { id: input.id, game: { ownerId: ctx.session.user.id } },
      });
    }),

  initPreset: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        preset: z.enum(["ego_alter", "human_beast", "public_secret"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });

      await ctx.db.subRoleDefinition.deleteMany({ where: { gameId: input.gameId } });

      const presets = {
        ego_alter: [
          { name: "Ego", slug: "ego" },
          { name: "Alter-Ego", slug: "alter-ego" },
        ],
        human_beast: [
          { name: "Human", slug: "human" },
          { name: "Beast", slug: "beast" },
        ],
        public_secret: [
          { name: "Public Identity", slug: "public" },
          { name: "Secret Identity", slug: "secret" },
        ],
      };

      const defs = presets[input.preset];
      await ctx.db.subRoleDefinition.createMany({
        data: defs.map((d, i) => ({ ...d, gameId: input.gameId, sortOrder: i })),
      });
      return { count: defs.length };
    }),

  getForCharacter: protectedProcedure
    .input(z.object({ characterId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.subRole.findMany({
        where: {
          characterId: input.characterId,
          character: { game: { ownerId: ctx.session.user.id } },
        },
        include: { definition: true },
        orderBy: { definition: { sortOrder: "asc" } },
      });
    }),

  setNotes: protectedProcedure
    .input(
      z.object({
        characterId: z.string(),
        definitionId: z.string(),
        notes: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.gameEntity.findFirstOrThrow({
        where: { id: input.characterId, game: { ownerId: ctx.session.user.id } },
      });

      return ctx.db.subRole.upsert({
        where: {
          characterId_definitionId: {
            characterId: input.characterId,
            definitionId: input.definitionId,
          },
        },
        create: {
          characterId: input.characterId,
          definitionId: input.definitionId,
          notes: input.notes,
        },
        update: { notes: input.notes },
      });
    }),

  enableForCharacter: protectedProcedure
    .input(z.object({ characterId: z.string(), enable: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const entity = await ctx.db.gameEntity.findFirstOrThrow({
        where: { id: input.characterId, game: { ownerId: ctx.session.user.id } },
      });

      await ctx.db.gameEntity.update({
        where: { id: entity.id },
        data: { hasSubRoles: input.enable },
      });

      if (input.enable) {
        const defs = await ctx.db.subRoleDefinition.findMany({
          where: { gameId: entity.gameId },
        });
        for (const def of defs) {
          await ctx.db.subRole.upsert({
            where: {
              characterId_definitionId: {
                characterId: entity.id,
                definitionId: def.id,
              },
            },
            create: { characterId: entity.id, definitionId: def.id },
            update: {},
          });
        }
      }

      return { success: true };
    }),
});
