import { db } from "@/lib/db";

export interface GameContext {
  gameSummary: string;
  designDoc: string | null;
  characters: Array<{
    id: string;
    name: string;
    type: string;
    faction: string | null;
    archetype: string | null;
    description: string | null;
    status: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    description: string | null;
    intensity: number;
    bidirectional: boolean;
  }>;
  plotlines: Array<{
    name: string;
    type: string;
    description: string | null;
    characters: string[];
  }>;
}

export async function buildGameContext(gameId: string): Promise<GameContext> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: {
      characters: true,
      relationships: {
        include: { fromEntity: true, toEntity: true },
      },
      plotlines: {
        include: { entities: { include: { entity: true } } },
      },
    },
  });

  if (!game) throw new Error("Game not found");

  return {
    gameSummary: `"${game.name}" — ${game.genre ?? "Unknown genre"}, ${game.format.toLowerCase()} format, ${game.playerCount ?? "?"} players. ${game.setting ?? ""}`.trim(),
    designDoc: game.designDocSummary,
    characters: game.characters.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      faction: c.faction,
      archetype: c.archetype,
      description: c.description,
      status: c.status,
    })),
    relationships: game.relationships.map((r) => ({
      from: r.fromEntity.name,
      to: r.toEntity.name,
      type: r.type,
      description: r.description,
      intensity: r.intensity,
      bidirectional: r.bidirectional,
    })),
    plotlines: game.plotlines.map((p) => ({
      name: p.name,
      type: p.type,
      description: p.description,
      characters: p.entities.map((e) => e.entity.name),
    })),
  };
}

export async function buildCharacterContext(entityId: string) {
  const entity = await db.gameEntity.findUnique({
    where: { id: entityId },
    include: {
      game: true,
      relationshipsFrom: { include: { toEntity: true, plotline: true } },
      relationshipsTo: { include: { fromEntity: true, plotline: true } },
      plotlineEntities: { include: { plotline: { include: { entities: { include: { entity: true } } } } } },
      briefVersions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 },
    },
  });

  if (!entity) throw new Error("Entity not found");

  const allRels = [
    ...entity.relationshipsFrom.map((r) => ({
      otherName: r.toEntity.name,
      type: r.type,
      description: r.description,
      intensity: r.intensity,
      direction: "outgoing" as const,
      bidirectional: r.bidirectional,
    })),
    ...entity.relationshipsTo.map((r) => ({
      otherName: r.fromEntity.name,
      type: r.type,
      description: r.description,
      intensity: r.intensity,
      direction: "incoming" as const,
      bidirectional: r.bidirectional,
    })),
  ];

  const connectedIds = new Set([
    ...entity.relationshipsFrom.map((r) => r.toEntityId),
    ...entity.relationshipsTo.map((r) => r.fromEntityId),
  ]);

  const connectedBriefs = await db.briefVersion.findMany({
    where: {
      entityId: { in: Array.from(connectedIds) },
      status: "APPROVED",
    },
    include: { entity: true },
    orderBy: { version: "desc" },
  });

  const uniqueBriefs = new Map<string, typeof connectedBriefs[number]>();
  connectedBriefs.forEach((b) => {
    if (!uniqueBriefs.has(b.entityId)) uniqueBriefs.set(b.entityId, b);
  });

  return {
    character: {
      name: entity.name,
      type: entity.type,
      faction: entity.faction,
      archetype: entity.archetype,
      description: entity.description,
    },
    relationships: allRels,
    plotlines: entity.plotlineEntities.map((pe) => ({
      name: pe.plotline.name,
      type: pe.plotline.type,
      description: pe.plotline.description,
      otherCharacters: pe.plotline.entities
        .filter((e) => e.entityId !== entityId)
        .map((e) => e.entity.name),
    })),
    connectedBriefs: Array.from(uniqueBriefs.values()).map((b) => ({
      characterName: b.entity.name,
      backstory: b.backstory?.slice(0, 500),
      goals: b.goalsPublic?.slice(0, 300),
    })),
    gameName: entity.game.name,
    gameGenre: entity.game.genre,
    gameSetting: entity.game.setting,
    designDoc: entity.game.designDocSummary,
  };
}
