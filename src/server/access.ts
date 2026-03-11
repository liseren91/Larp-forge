import { Prisma } from "@prisma/client";

/**
 * Prisma WHERE fragment for Game-level queries.
 * Matches games where the user is either the owner or a member.
 */
export function gameAccessWhere(userId: string): Prisma.GameWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { members: { some: { userId } } },
    ],
  };
}

/**
 * Prisma WHERE fragment for nested queries on entities that belong to a Game
 * (e.g. characters, plotlines, relationships, files, etc.).
 */
export function nestedGameAccessWhere(userId: string) {
  return { game: gameAccessWhere(userId) };
}
