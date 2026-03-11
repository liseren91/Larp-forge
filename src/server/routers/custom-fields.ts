import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

const fieldTypeEnum = z.enum([
  "TEXT", "TEXTAREA", "NUMBER", "SELECT", "MULTI_SELECT", "DATE", "BOOLEAN", "URL",
]);

export const customFieldsRouter = router({
  listDefinitions: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.customFieldDefinition.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        include: { options: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      });
    }),

  createDefinition: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        name: z.string().min(1).max(200),
        slug: z.string().min(1).max(100),
        fieldType: fieldTypeEnum,
        description: z.string().optional(),
        isRequired: z.boolean().default(false),
        entityCategory: z.string().optional(),
        options: z
          .array(z.object({ label: z.string(), color: z.string().optional() }))
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });

      const { options, ...defData } = input;
      const maxSort = await ctx.db.customFieldDefinition.aggregate({
        where: { gameId: input.gameId },
        _max: { sortOrder: true },
      });

      return ctx.db.customFieldDefinition.create({
        data: {
          ...defData,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          options: options
            ? {
                create: options.map((o, i) => ({
                  label: o.label,
                  color: o.color,
                  sortOrder: i,
                })),
              }
            : undefined,
        },
        include: { options: true },
      });
    }),

  updateDefinition: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        isRequired: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        options: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string(),
              color: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, options, ...data } = input;

      const def = await ctx.db.customFieldDefinition.findFirstOrThrow({
        where: { id, game: { ownerId: ctx.session.user.id } },
      });

      if (options) {
        await ctx.db.customFieldOption.deleteMany({
          where: { definitionId: def.id },
        });
        await ctx.db.customFieldOption.createMany({
          data: options.map((o, i) => ({
            definitionId: def.id,
            label: o.label,
            color: o.color,
            sortOrder: i,
          })),
        });
      }

      return ctx.db.customFieldDefinition.update({
        where: { id },
        data,
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
    }),

  deleteDefinition: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.customFieldDefinition.delete({
        where: {
          id: input.id,
          game: { ownerId: ctx.session.user.id },
        },
      });
    }),

  reorderDefinitions: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        orderedIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ownerId: ctx.session.user.id },
      });
      await ctx.db.$transaction(
        input.orderedIds.map((id, i) =>
          ctx.db.customFieldDefinition.update({
            where: { id },
            data: { sortOrder: i },
          })
        )
      );
    }),

  getValues: protectedProcedure
    .input(z.object({ characterId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.customFieldValue.findMany({
        where: {
          characterId: input.characterId,
          character: { game: { ownerId: ctx.session.user.id } },
        },
        include: { selectedOptions: { include: { option: true } } },
      });
    }),

  setValues: protectedProcedure
    .input(
      z.object({
        characterId: z.string(),
        values: z.array(
          z.object({
            definitionId: z.string(),
            textValue: z.string().nullable().optional(),
            numberValue: z.number().nullable().optional(),
            booleanValue: z.boolean().nullable().optional(),
            dateValue: z.string().nullable().optional(),
            selectedOptionIds: z.array(z.string()).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entity = await ctx.db.gameEntity.findFirstOrThrow({
        where: { id: input.characterId, game: { ownerId: ctx.session.user.id } },
      });

      for (const val of input.values) {
        const existing = await ctx.db.customFieldValue.findUnique({
          where: {
            definitionId_characterId: {
              definitionId: val.definitionId,
              characterId: entity.id,
            },
          },
        });

        const data = {
          textValue: val.textValue ?? null,
          numberValue: val.numberValue ?? null,
          booleanValue: val.booleanValue ?? null,
          dateValue: val.dateValue ? new Date(val.dateValue) : null,
        };

        let valueId: string;
        if (existing) {
          await ctx.db.customFieldValue.update({ where: { id: existing.id }, data });
          valueId = existing.id;
        } else {
          const created = await ctx.db.customFieldValue.create({
            data: {
              definitionId: val.definitionId,
              characterId: entity.id,
              ...data,
            },
          });
          valueId = created.id;
        }

        if (val.selectedOptionIds) {
          await ctx.db.customFieldValueOption.deleteMany({ where: { valueId } });
          if (val.selectedOptionIds.length > 0) {
            await ctx.db.customFieldValueOption.createMany({
              data: val.selectedOptionIds.map((optionId) => ({ valueId, optionId })),
            });
          }
        }
      }

      return { success: true };
    }),

  bulkGetValues: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.customFieldValue.findMany({
        where: {
          character: {
            gameId: input.gameId,
            game: { ownerId: ctx.session.user.id },
          },
        },
        include: { selectedOptions: { include: { option: true } } },
      });
    }),
});
