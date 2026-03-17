import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { gameAccessWhere, nestedGameAccessWhere } from "../access";
import { generateCsv, parseCsv } from "@/lib/csv";
import { TRPCError } from "@trpc/server";

const CHARACTER_HEADERS = ["name", "type", "faction", "archetype", "description", "status"] as const;
const RELATIONSHIP_HEADERS = [
  "from",
  "to",
  "type",
  "description",
  "intensity",
  "bidirectional",
 ] as const;
const MATRIX_EXPORT_FIELDS = ["id", "name", "description", "type", "plotlines", "attributes"] as const;

const VALID_ENTITY_TYPES = ["CHARACTER", "NPC"] as const;
const VALID_RELATIONSHIP_TYPES = [
  "RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE",
  "FAMILY", "MENTORSHIP", "ENMITY", "OTHER",
] as const;
const VALID_STATUSES = ["DRAFT", "IN_PROGRESS", "READY"] as const;
const DESCRIPTION_PLOTLINE_REGEX =
  /(?:^|\n)\s*(?:[-*]\s*)?(?:plotline|сюжет|завязка)\s*:\s*(.+?)\s*$/gim;

function extractPlotlineNamesFromDescription(description: string | undefined): string[] {
  if (!description?.trim()) return [];
  const matches = description.matchAll(DESCRIPTION_PLOTLINE_REGEX);
  const names = new Set<string>();
  for (const match of matches) {
    const rawName = match[1]?.trim();
    if (!rawName) continue;
    const normalizedWhitespace = rawName.replace(/\s+/g, " ");
    if (!normalizedWhitespace) continue;
    names.add(normalizedWhitespace);
  }
  return Array.from(names);
}

function parseBooleanLike(value: string | undefined): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

export const csvRouter = router({
  exportCharacters: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        fields: z.array(z.enum(CHARACTER_HEADERS)).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entities = await ctx.db.gameEntity.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        orderBy: { createdAt: "asc" },
      });

      const selectedFields = input.fields?.length ? input.fields : [...CHARACTER_HEADERS];
      if (selectedFields.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one character export field must be selected.",
        });
      }

      const rows = entities.map((e) => {
        const fieldMap: Record<(typeof CHARACTER_HEADERS)[number], string> = {
          name: e.name,
          type: e.type,
          faction: e.faction ?? "",
          archetype: e.archetype ?? "",
          description: e.description ?? "",
          status: e.status,
        };
        return selectedFields.map((field) => fieldMap[field]);
      });

      return { csv: generateCsv(selectedFields, rows), count: entities.length };
    }),

  importCharacters: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        csvText: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const records = parseCsv(input.csvText);
      if (records.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CSV file is empty or has no data rows." });
      }
      if (records.length > 200) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 200 characters per import." });
      }

      const first = records[0];
      if (!("name" in first)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "CSV must have a 'name' column.",
        });
      }

      const errors: string[] = [];
      const data = records.map((r, idx) => {
        const row = idx + 2;
        if (!r.name?.trim()) {
          errors.push(`Row ${row}: name is required.`);
        }
        const rawType = (r.type ?? "CHARACTER").toUpperCase();
        const type = VALID_ENTITY_TYPES.includes(rawType as any)
          ? (rawType as (typeof VALID_ENTITY_TYPES)[number])
          : "CHARACTER";
        const rawStatus = (r.status ?? "DRAFT").toUpperCase();
        const status = VALID_STATUSES.includes(rawStatus as any)
          ? (rawStatus as (typeof VALID_STATUSES)[number])
          : "DRAFT";

        return {
          gameId: input.gameId,
          name: r.name?.trim() ?? "",
          type,
          faction: r.faction?.trim() || null,
          archetype: r.archetype?.trim() || null,
          description: r.description?.trim() || null,
          status,
        };
      });

      if (errors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errors.slice(0, 10).join("\n"),
        });
      }

      const result = await ctx.db.gameEntity.createMany({ data });
      return { imported: result.count };
    }),

  exportRelationships: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        fields: z.array(z.enum(RELATIONSHIP_HEADERS)).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const relationships = await ctx.db.relationship.findMany({
        where: { gameId: input.gameId, ...nestedGameAccessWhere(ctx.session.user.id) },
        include: { fromEntity: true, toEntity: true },
        orderBy: { createdAt: "asc" },
      });

      const selectedFields = input.fields?.length ? input.fields : [...RELATIONSHIP_HEADERS];
      if (selectedFields.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one relationship export field must be selected.",
        });
      }

      const rows = relationships.map((r) => {
        const fieldMap: Record<(typeof RELATIONSHIP_HEADERS)[number], string> = {
          from: r.fromEntity.name,
          to: r.toEntity.name,
          type: r.type,
          description: r.description ?? "",
          intensity: String(r.intensity),
          bidirectional: r.bidirectional ? "true" : "false",
        };
        return selectedFields.map((field) => fieldMap[field]);
      });

      return { csv: generateCsv(selectedFields, rows), count: relationships.length };
    }),

  importRelationships: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        csvText: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const records = parseCsv(input.csvText);
      if (records.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CSV file is empty or has no data rows." });
      }
      if (records.length > 500) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 500 relationships per import." });
      }

      const first = records[0];
      if (!("from" in first) || !("to" in first)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "CSV must have 'from' and 'to' columns with character names.",
        });
      }

      const entities = await ctx.db.gameEntity.findMany({
        where: { gameId: input.gameId },
        select: { id: true, name: true },
      });
      const nameMap = new Map<string, string>();
      for (const e of entities) {
        nameMap.set(e.name.toLowerCase(), e.id);
      }

      const errors: string[] = [];
      const data: {
        gameId: string;
        fromEntityId: string;
        toEntityId: string;
        type: (typeof VALID_RELATIONSHIP_TYPES)[number];
        description: string | null;
        intensity: number;
        bidirectional: boolean;
      }[] = [];

      for (let idx = 0; idx < records.length; idx++) {
        const r = records[idx];
        const row = idx + 2;
        const fromId = nameMap.get(r.from?.trim().toLowerCase() ?? "");
        const toId = nameMap.get(r.to?.trim().toLowerCase() ?? "");
        if (!fromId) errors.push(`Row ${row}: character "${r.from}" not found.`);
        if (!toId) errors.push(`Row ${row}: character "${r.to}" not found.`);
        if (!fromId || !toId) continue;

        const rawType = (r.type ?? "OTHER").toUpperCase();
        const type = VALID_RELATIONSHIP_TYPES.includes(rawType as any)
          ? (rawType as (typeof VALID_RELATIONSHIP_TYPES)[number])
          : "OTHER";
        const intensity = Math.max(1, Math.min(10, parseInt(r.intensity ?? "5") || 5));
        const bidirectional = (r.bidirectional ?? "true").toLowerCase() !== "false";

        data.push({
          gameId: input.gameId,
          fromEntityId: fromId,
          toEntityId: toId,
          type,
          description: r.description?.trim() || null,
          intensity,
          bidirectional,
        });
      }

      if (errors.length > 0 && data.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errors.slice(0, 10).join("\n"),
        });
      }

      const result = await ctx.db.relationship.createMany({ data });
      return {
        imported: result.count,
        warnings: errors.length > 0 ? errors.slice(0, 10) : undefined,
      };
    }),

  exportCharactersMatrix: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        fields: z.array(z.enum(MATRIX_EXPORT_FIELDS)).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const entities = await ctx.db.gameEntity.findMany({
        where: { gameId: game.id },
        orderBy: { createdAt: "asc" },
        include: { plotlineEntities: { select: { plotlineId: true } } },
      });

      const plotlines = await ctx.db.plotline.findMany({
        where: { gameId: game.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });
      const customFieldDefinitions = await ctx.db.customFieldDefinition.findMany({
        where: { gameId: game.id },
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, label: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      });
      const customFieldValues = await ctx.db.customFieldValue.findMany({
        where: { character: { gameId: game.id } },
        include: { selectedOptions: { include: { option: true } } },
      });
      const valueByCharacterAndDefinition = new Map<string, (typeof customFieldValues)[number]>();
      for (const value of customFieldValues) {
        valueByCharacterAndDefinition.set(`${value.characterId}:${value.definitionId}`, value);
      }

      const selectedFields = input.fields?.length ? input.fields : [...MATRIX_EXPORT_FIELDS];
      if (selectedFields.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one matrix export field must be selected.",
        });
      }

      const includePlotlines = selectedFields.includes("plotlines");
      const includeAttributes = selectedFields.includes("attributes");
      const fixedHeaders = selectedFields.filter(
        (field): field is "id" | "name" | "description" | "type" =>
          field !== "plotlines" && field !== "attributes"
      );
      const plotlineHeaders = includePlotlines
        ? plotlines.map((p) => `${p.name} [plotline:${p.id}]`)
        : [];
      const attributeHeaders = includeAttributes
        ? customFieldDefinitions.map((def) => `attr:${def.slug}`)
        : [];
      const headers = [...fixedHeaders, ...plotlineHeaders, ...attributeHeaders];

      const rows = entities.map((e) => {
        const assignedIds = new Set(
          e.plotlineEntities.map((pe) => pe.plotlineId)
        );
        const fieldMap = {
          id: e.id,
          name: e.name,
          description: e.description ?? "",
          type: e.type,
        };
        const fixed = fixedHeaders.map((field) => fieldMap[field]);
        const plotlineCells = includePlotlines
          ? plotlines.map((p) => (assignedIds.has(p.id) ? "1" : "0"))
          : [];
        const attributeCells = includeAttributes
          ? customFieldDefinitions.map((def) => {
              const stored = valueByCharacterAndDefinition.get(`${e.id}:${def.id}`);
              if (!stored) return "";
              if (def.fieldType === "NUMBER") return stored.numberValue != null ? String(stored.numberValue) : "";
              if (def.fieldType === "BOOLEAN") {
                return stored.booleanValue == null ? "" : stored.booleanValue ? "true" : "false";
              }
              if (def.fieldType === "DATE") {
                return stored.dateValue ? stored.dateValue.toISOString().slice(0, 10) : "";
              }
              if (def.fieldType === "SELECT" || def.fieldType === "MULTI_SELECT") {
                const labels = stored.selectedOptions.map((so) => so.option.label);
                return labels.join("|");
              }
              return stored.textValue ?? "";
            })
          : [];
        return [...fixed, ...plotlineCells, ...attributeCells];
      });

      return { csv: generateCsv(headers, rows), count: entities.length };
    }),

  importCharactersMatrix: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        csvText: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const game = await ctx.db.game.findFirstOrThrow({
        where: { id: input.gameId, ...gameAccessWhere(ctx.session.user.id) },
      });

      const records = parseCsv(input.csvText);
      if (records.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "CSV file is empty or has no data rows.",
        });
      }
      if (records.length > 500) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum 500 characters per import.",
        });
      }

      const first = records[0];
      if (!("id" in first)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "CSV must have an 'id' column for character matching.",
        });
      }

      const headers = Object.keys(first);
      const plotlineColumns: { header: string; plotlineId: string }[] = [];
      const attributeColumns: { header: string; slug: string }[] = [];
      for (const h of headers) {
        const bracketMatch = h.match(/\[plotline:([^\]]+)\]/);
        if (bracketMatch) {
          plotlineColumns.push({ header: h, plotlineId: bracketMatch[1] });
          continue;
        }
        const directMatch = h.match(/^plotline:(.+)$/);
        if (directMatch) {
          plotlineColumns.push({ header: h, plotlineId: directMatch[1] });
        }
        const attrMatch = h.match(/^attr(?:ibute)?:(.+)$/);
        if (attrMatch) {
          attributeColumns.push({ header: h, slug: attrMatch[1].trim().toLowerCase() });
        }
      }

      const gamePlotlines = await ctx.db.plotline.findMany({
        where: { gameId: game.id },
        select: { id: true, name: true },
      });
      const validPlotlineIds = new Set(gamePlotlines.map((p) => p.id));
      const plotlineNameToId = new Map<string, string>();
      for (const plotline of gamePlotlines) {
        plotlineNameToId.set(plotline.name.trim().toLowerCase(), plotline.id);
      }
      const validPlotlineColumns = plotlineColumns.filter((pc) =>
        validPlotlineIds.has(pc.plotlineId)
      );

      const existingEntities = await ctx.db.gameEntity.findMany({
        where: { gameId: game.id },
        select: { id: true },
      });
      const existingIds = new Set(existingEntities.map((e) => e.id));
      const customFieldDefinitions = await ctx.db.customFieldDefinition.findMany({
        where: { gameId: game.id },
        include: {
          options: { select: { id: true, label: true } },
        },
      });
      const definitionBySlug = new Map(
        customFieldDefinitions.map((def) => [def.slug.trim().toLowerCase(), def] as const)
      );
      const validAttributeColumns = attributeColumns
        .map((col) => ({ ...col, definition: definitionBySlug.get(col.slug) }))
        .filter((col): col is { header: string; slug: string; definition: (typeof customFieldDefinitions)[number] } => !!col.definition);
      const optionLabelMapByDefinition = new Map<string, Map<string, string>>();
      for (const def of customFieldDefinitions) {
        const map = new Map<string, string>();
        for (const option of def.options) {
          map.set(option.label.trim().toLowerCase(), option.id);
        }
        optionLabelMapByDefinition.set(def.id, map);
      }
      const definitionIds = customFieldDefinitions.map((def) => def.id);
      const existingAttributeValues =
        definitionIds.length > 0
          ? await ctx.db.customFieldValue.findMany({
              where: {
                characterId: { in: Array.from(existingIds) },
                definitionId: { in: definitionIds },
              },
              select: { id: true, characterId: true, definitionId: true },
            })
          : [];
      const customFieldValueIdByKey = new Map<string, string>();
      for (const value of existingAttributeValues) {
        customFieldValueIdByKey.set(`${value.characterId}:${value.definitionId}`, value.id);
      }

      const errors: string[] = [];
      const skipped: string[] = [];
      let updated = 0;
      let createdPlotlines = 0;
      let linkedFromDescription = 0;
      let updatedAttributes = 0;

      await ctx.db.$transaction(async (tx) => {
        for (let idx = 0; idx < records.length; idx++) {
          const r = records[idx];
          const row = idx + 2;
          const entityId = r.id?.trim();

          if (!entityId) {
            skipped.push(`Row ${row}: empty id, skipped.`);
            continue;
          }

          if (!existingIds.has(entityId)) {
            skipped.push(
              `Row ${row}: character id "${entityId}" not found, skipped.`
            );
            continue;
          }

          const rawType = (r.type ?? "").toUpperCase();
          if (rawType && !VALID_ENTITY_TYPES.includes(rawType as any)) {
            errors.push(
              `Row ${row}: invalid type "${r.type}", must be CHARACTER or NPC.`
            );
            continue;
          }

          const updateData: Record<string, unknown> = {};
          if (r.name?.trim()) updateData.name = r.name.trim();
          if ("description" in r)
            updateData.description = r.description?.trim() || null;
          if (rawType) updateData.type = rawType;

          if (Object.keys(updateData).length > 0) {
            await tx.gameEntity.update({
              where: { id: entityId },
              data: updateData,
            });
          }

          const targetPlotlineIds = new Set<string>();
          const extractedPlotlineIds = new Set<string>();

          for (const pc of validPlotlineColumns) {
            const val = r[pc.header]?.trim().toLowerCase();
            if (val === "1" || val === "true" || val === "yes") {
              targetPlotlineIds.add(pc.plotlineId);
            }
          }

          if ("description" in r) {
            const extractedPlotlineNames = extractPlotlineNamesFromDescription(r.description);
            for (const plotlineName of extractedPlotlineNames) {
              if (plotlineName.length > 200) {
                errors.push(
                  `Row ${row}: extracted plotline "${plotlineName.slice(0, 50)}..." is longer than 200 characters.`
                );
                continue;
              }

              const normalizedName = plotlineName.toLowerCase();
              let plotlineId = plotlineNameToId.get(normalizedName);
              if (!plotlineId) {
                const created = await tx.plotline.create({
                  data: {
                    gameId: game.id,
                    name: plotlineName,
                    type: "OTHER",
                  },
                  select: { id: true },
                });
                plotlineId = created.id;
                plotlineNameToId.set(normalizedName, created.id);
                validPlotlineIds.add(created.id);
                createdPlotlines++;
              }
              targetPlotlineIds.add(plotlineId);
              extractedPlotlineIds.add(plotlineId);
            }
          }

          if (validPlotlineColumns.length > 0 || targetPlotlineIds.size > 0) {
            const scopedPlotlineIds = Array.from(validPlotlineIds);
            const currentAssignments = await tx.plotlineEntity.findMany({
              where: {
                entityId,
                plotlineId: { in: scopedPlotlineIds },
              },
              select: { id: true, plotlineId: true },
            });

            const currentPlotlineIds = new Set(
              currentAssignments.map((a) => a.plotlineId)
            );

            const toDelete = currentAssignments.filter(
              (a) => !targetPlotlineIds.has(a.plotlineId)
            );
            if (toDelete.length > 0) {
              await tx.plotlineEntity.deleteMany({
                where: { id: { in: toDelete.map((d) => d.id) } },
              });
            }

            const toAdd = Array.from(targetPlotlineIds).filter(
              (id) => !currentPlotlineIds.has(id)
            );
            if (toAdd.length > 0) {
              await tx.plotlineEntity.createMany({
                data: toAdd.map((plotlineId) => ({
                  plotlineId,
                  entityId,
                })),
              });
              for (const addedId of toAdd) {
                if (extractedPlotlineIds.has(addedId)) linkedFromDescription++;
              }
            }
          }

          if (validAttributeColumns.length > 0) {
            for (const attrColumn of validAttributeColumns) {
              const raw = r[attrColumn.header] ?? "";
              const trimmed = raw.trim();
              const definition = attrColumn.definition;
              const valueKey = `${entityId}:${definition.id}`;
              const existingValueId = customFieldValueIdByKey.get(valueKey);

              let valueId: string;
              if (definition.fieldType === "NUMBER") {
                const numberValue =
                  trimmed === "" ? null : Number.isFinite(Number(trimmed)) ? Number(trimmed) : null;
                if (trimmed !== "" && numberValue == null) {
                  errors.push(`Row ${row}: invalid number for attr:${definition.slug} => "${raw}"`);
                  continue;
                }
                if (existingValueId) {
                  await tx.customFieldValue.update({
                    where: { id: existingValueId },
                    data: { textValue: null, numberValue, booleanValue: null, dateValue: null },
                  });
                  valueId = existingValueId;
                } else {
                  const created = await tx.customFieldValue.create({
                    data: {
                      definitionId: definition.id,
                      characterId: entityId,
                      textValue: null,
                      numberValue,
                      booleanValue: null,
                      dateValue: null,
                    },
                  });
                  valueId = created.id;
                  customFieldValueIdByKey.set(valueKey, created.id);
                }
              } else if (definition.fieldType === "BOOLEAN") {
                const booleanValue = parseBooleanLike(trimmed);
                if (trimmed !== "" && booleanValue == null) {
                  errors.push(`Row ${row}: invalid boolean for attr:${definition.slug} => "${raw}"`);
                  continue;
                }
                if (existingValueId) {
                  await tx.customFieldValue.update({
                    where: { id: existingValueId },
                    data: { textValue: null, numberValue: null, booleanValue, dateValue: null },
                  });
                  valueId = existingValueId;
                } else {
                  const created = await tx.customFieldValue.create({
                    data: {
                      definitionId: definition.id,
                      characterId: entityId,
                      textValue: null,
                      numberValue: null,
                      booleanValue,
                      dateValue: null,
                    },
                  });
                  valueId = created.id;
                  customFieldValueIdByKey.set(valueKey, created.id);
                }
              } else if (definition.fieldType === "DATE") {
                const parsed = trimmed ? new Date(trimmed) : null;
                if (trimmed && (!parsed || Number.isNaN(parsed.getTime()))) {
                  errors.push(`Row ${row}: invalid date for attr:${definition.slug} => "${raw}"`);
                  continue;
                }
                if (existingValueId) {
                  await tx.customFieldValue.update({
                    where: { id: existingValueId },
                    data: { textValue: null, numberValue: null, booleanValue: null, dateValue: parsed },
                  });
                  valueId = existingValueId;
                } else {
                  const created = await tx.customFieldValue.create({
                    data: {
                      definitionId: definition.id,
                      characterId: entityId,
                      textValue: null,
                      numberValue: null,
                      booleanValue: null,
                      dateValue: parsed,
                    },
                  });
                  valueId = created.id;
                  customFieldValueIdByKey.set(valueKey, created.id);
                }
              } else {
                if (existingValueId) {
                  await tx.customFieldValue.update({
                    where: { id: existingValueId },
                    data: {
                      textValue:
                        definition.fieldType === "TEXT" ||
                        definition.fieldType === "TEXTAREA" ||
                        definition.fieldType === "URL"
                          ? (trimmed || null)
                          : null,
                      numberValue: null,
                      booleanValue: null,
                      dateValue: null,
                    },
                  });
                  valueId = existingValueId;
                } else {
                  const created = await tx.customFieldValue.create({
                    data: {
                      definitionId: definition.id,
                      characterId: entityId,
                      textValue:
                        definition.fieldType === "TEXT" ||
                        definition.fieldType === "TEXTAREA" ||
                        definition.fieldType === "URL"
                          ? (trimmed || null)
                          : null,
                      numberValue: null,
                      booleanValue: null,
                      dateValue: null,
                    },
                  });
                  valueId = created.id;
                  customFieldValueIdByKey.set(valueKey, created.id);
                }

                if (definition.fieldType === "SELECT" || definition.fieldType === "MULTI_SELECT") {
                  const optionMap = optionLabelMapByDefinition.get(definition.id) ?? new Map<string, string>();
                  const labels = trimmed
                    ? trimmed.split("|").map((v) => v.trim()).filter(Boolean)
                    : [];
                  const selectedOptionIds: string[] = [];
                  for (const label of labels) {
                    const optionId = optionMap.get(label.toLowerCase());
                    if (!optionId) {
                      errors.push(
                        `Row ${row}: unknown option "${label}" for attr:${definition.slug}`
                      );
                      continue;
                    }
                    selectedOptionIds.push(optionId);
                  }
                  await tx.customFieldValueOption.deleteMany({ where: { valueId } });
                  if (selectedOptionIds.length > 0) {
                    await tx.customFieldValueOption.createMany({
                      data: selectedOptionIds.map((optionId) => ({ valueId, optionId })),
                    });
                  }
                }
              }
              updatedAttributes++;
            }
          }

          updated++;
        }
      }, { timeout: 30000, maxWait: 10000 });

      return {
        updated,
        skipped: skipped.length > 0 ? skipped : undefined,
        errors: errors.length > 0 ? errors : undefined,
        createdPlotlines,
        linkedFromDescription,
        updatedAttributes,
        totalRows: records.length,
      };
    }),
});
