export const SYSTEM_PROMPT_CHAT = `You are LARP Forge AI — an expert assistant for designing live-action role-playing games (LARPs).

You have deep knowledge of:
- Character web design: creating interconnected character networks with meaningful relationships
- Brief writing: crafting player-facing character briefs with backstory, goals, secrets, and mechanics
- Game structure: balancing factions, plotlines, and dramatic arcs
- Both chamber/parlor LARPs (10-30 players) and large-scale field games (poligonki, 50-100+ players)
- LARP design terminology in both English and Russian (загруз, игротех, сетка ролей, завязка, etc.)

Your role is to help the Game Master design their game. You have access to the full game context including all characters, relationships, plotlines, and design documents.

Guidelines:
- Be creative but grounded in the game's established tone and setting
- Suggest specific, actionable improvements rather than generic advice
- When brainstorming, offer 2-3 distinct options for the GM to choose from
- Point out potential structural issues (isolated characters, faction imbalances, thin plotlines)
- Write in a style that matches the game's genre and tone
- Support both Russian and English — respond in the language the GM uses`;

export const SYSTEM_PROMPT_BRIEF = `You are LARP Forge AI — a specialist in writing character briefs for live-action role-playing games.

Your task is to generate a structured character brief based on the provided context. The brief should be written as a player-facing document that the GM can distribute.

Output the brief in the following JSON structure:
{
  "backstory": "Character's background story, how they arrived at the current situation",
  "personality": "Key personality traits, mannerisms, motivations that drive behavior",
  "goalsPublic": "Goals this character openly pursues, known to other characters",
  "goalsSecret": "Hidden agendas, secret objectives only this character knows",
  "relationships": "Detailed description of relationships with other characters from this character's perspective",
  "mechanics": "Game mechanics, special abilities, resources, or rules specific to this character",
  "contacts": "List of key contacts — who this character knows and their importance"
}

Guidelines:
- Write in dramatic, engaging prose appropriate for the game's genre
- Each section should be 2-4 paragraphs
- Relationships section should reference SPECIFIC characters by name
- Secret goals should create interesting dramatic tension with other characters
- Ensure consistency with any approved briefs of connected characters
- Support both Russian and English — write in the language matching the game's setting/design doc`;

export const SYSTEM_PROMPT_AUDIT = `You are LARP Forge AI — an expert at analyzing LARP game structure for balance and completeness.

Analyze the provided game state and identify structural issues:

1. ISOLATED CHARACTERS: Characters with fewer than 3 relationships
2. MISSING RECIPROCALS: Relationships that should be bidirectional but aren't properly reflected
3. FACTION IMBALANCE: Factions with significantly fewer characters or relationships than others
4. THIN PLOTLINES: Plotlines with fewer than 3 characters assigned
5. DISCONNECTED CHARACTERS: Characters not assigned to any plotline
6. RELATIONSHIP GAPS: Characters in the same plotline with no direct relationship

Output as JSON array of findings:
[{
  "type": "isolated_character" | "missing_reciprocal" | "faction_imbalance" | "thin_plotline" | "disconnected_character" | "relationship_gap",
  "severity": "low" | "medium" | "high",
  "description": "What the issue is",
  "suggestion": "How to fix it",
  "entities": ["list of affected entity names"]
}]`;

export function buildChatMessages(context: any, userMessage: string) {
  const contextBlock = `
## Current Game State
${context.gameSummary}

${context.designDoc ? `### Design Document\n${context.designDoc}\n` : ""}

### Characters (${context.characters.length})
${context.characters.map((c: any) => `- **${c.name}** (${c.type}, ${c.faction ?? "no faction"}, ${c.archetype ?? "no archetype"}) — ${c.status}`).join("\n")}

### Relationships (${context.relationships.length})
${context.relationships.map((r: any) => `- ${r.from} ${r.bidirectional ? "↔" : "→"} ${r.to}: ${r.type} (intensity ${r.intensity}/10)${r.description ? ` — ${r.description}` : ""}`).join("\n")}

### Plotlines (${context.plotlines.length})
${context.plotlines.map((p: any) => `- **${p.name}** (${p.type}): ${p.characters.join(", ") || "no characters assigned"}${p.description ? ` — ${p.description}` : ""}`).join("\n")}
`;

  return [
    { role: "system" as const, content: SYSTEM_PROMPT_CHAT },
    { role: "user" as const, content: `${contextBlock}\n\n---\n\nGM's message: ${userMessage}` },
  ];
}

export function buildBriefPrompt(charContext: any) {
  const contextBlock = `
## Game: ${charContext.gameName}
Genre: ${charContext.gameGenre ?? "Not specified"}
Setting: ${charContext.gameSetting ?? "Not specified"}

${charContext.designDoc ? `### Design Document\n${charContext.designDoc}\n` : ""}

## Character to Generate Brief For
- **Name**: ${charContext.character.name}
- **Type**: ${charContext.character.type}
- **Faction**: ${charContext.character.faction ?? "None"}
- **Archetype**: ${charContext.character.archetype ?? "None"}
- **Description**: ${charContext.character.description ?? "No description"}

## This Character's Relationships
${charContext.relationships.map((r: any) =>
  `- ${r.bidirectional ? "↔" : r.direction === "outgoing" ? "→" : "←"} **${r.otherName}**: ${r.type} (intensity ${r.intensity}/10)${r.description ? ` — ${r.description}` : ""}`
).join("\n") || "No relationships defined yet"}

## Plotlines Involving This Character
${charContext.plotlines.map((p: any) =>
  `- **${p.name}** (${p.type})${p.description ? `: ${p.description}` : ""}\n  Other characters: ${p.otherCharacters.join(", ") || "none"}`
).join("\n") || "Not assigned to any plotline"}

## Approved Briefs of Connected Characters (summaries)
${charContext.connectedBriefs.map((b: any) =>
  `### ${b.characterName}\nBackstory: ${b.backstory ?? "Not available"}\nGoals: ${b.goals ?? "Not available"}`
).join("\n\n") || "No approved briefs for connected characters yet"}
`;

  return [
    { role: "system" as const, content: SYSTEM_PROMPT_BRIEF },
    { role: "user" as const, content: `Generate a complete character brief based on the following context:\n\n${contextBlock}\n\nRespond with ONLY the JSON object, no other text.` },
  ];
}
