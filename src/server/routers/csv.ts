import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { generateCsv, parseCsv } from "@/lib/csv";
import { TRPCError } from "@trpc/server";

const CHARACTER_HEADERS = ["name", "type", "faction", "archetype", "description", "status"];
const RELATIONSHIP_HEADERS = [
  "from",
  "to",
  "type",
  "description",
  "intensity",
  "bidirectional",
];

const VALID_ENTITY_TYPES = ["CHARACTER", "NPC"] as const;
const VALID_RELATIONSHIP_TYPES = [
  "RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE",
  "FAMILY", "MENTORSHIP", "ENMITY", "OTHER",
] as const;
const VALID_STATUSES = ["DRAFT", "IN_PROGRESS", "READY"] as const;

export const csvRouter = router({
  exportCharacters: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entities = await ctx.db.gameEntity.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        orderBy: { createdAt: "asc" },
      });

      const rows = entities.map((e) => [
        e.name,
        e.type,
        e.faction ?? "",
        e.archetype ?? "",
        e.description ?? "",
        e.status,
      ]);

      return { csv: generateCsv(CHARACTER_HEADERS, rows), count: entities.length };
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
        where: { id: input.gameId, ownerId: ctx.session.user.id },
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
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const relationships = await ctx.db.relationship.findMany({
        where: { gameId: input.gameId, game: { ownerId: ctx.session.user.id } },
        include: { fromEntity: true, toEntity: true },
        orderBy: { createdAt: "asc" },
      });

      const rows = relationships.map((r) => [
        r.fromEntity.name,
        r.toEntity.name,
        r.type,
        r.description ?? "",
        String(r.intensity),
        r.bidirectional ? "true" : "false",
      ]);

      return { csv: generateCsv(RELATIONSHIP_HEADERS, rows), count: relationships.length };
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
        where: { id: input.gameId, ownerId: ctx.session.user.id },
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
});
