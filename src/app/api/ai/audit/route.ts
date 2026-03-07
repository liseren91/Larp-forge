import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGameContext, type GameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_AUDIT } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";
import { db } from "@/lib/db";

const MATRIX_AUDIT_PROMPT = `You are an AI assistant for LARP game masters, analyzing the plotline participation matrix.

You are given:
1. Characters with their factions
2. Plotlines with assigned characters
3. Per-character plotline counts and per-plotline character counts
4. Relationship edges between characters

Analyze the following aspects and respond in the user's language:

### Workload Balance
- Characters with < 3 plotlines will be BORED. Suggest specific plotlines to add them to.
- Characters with > 8 plotlines will be OVERLOADED. Suggest which plotlines they can be removed from.
- Compare average workload across factions. Imbalance > 2x is a problem.

### Fragile Plotlines
- Plotlines with <= 2 participants are too fragile. Suggest additional characters.
- Isolated plotlines (no character overlap with other plotlines) prevent organic cross-story play.

### Clustering
- Groups of characters who only share the same plotlines form "closed circles."
- Identify bridge characters connecting clusters. A single bridge is a failure point.

### Faction Balance
- Each faction should have at least 1 internal plotline and 2+ cross-faction plotlines.
- No plotline should involve only one faction (except special cases).

Respond with structured analysis using these sections:
1. CRITICAL issues (bored characters / dead plotlines)
2. RECOMMENDATIONS (imbalance / fragility)
3. STRENGTHS (what is working well)
4. SPECIFIC SUGGESTIONS (with character and plotline names)`;

async function handleMatrixAudit(gameId: string, context: GameContext) {
  const plotlineCounts: Record<string, number> = {};
  context.characters.forEach((c) => { plotlineCounts[c.name] = 0; });
  context.plotlines.forEach((p) => {
    p.characters.forEach((name) => {
      plotlineCounts[name] = (plotlineCounts[name] ?? 0) + 1;
    });
  });

  const matrixStr = `
Characters (${context.characters.length}):
${context.characters.map((c) => `- ${c.name} [${c.faction ?? "no faction"}] — ${plotlineCounts[c.name] ?? 0} plotlines`).join("\n")}

Plotlines (${context.plotlines.length}):
${context.plotlines.map((p) => `- "${p.name}" (${p.type}): ${p.characters.length > 0 ? p.characters.join(", ") : "NO CHARACTERS"}`).join("\n")}

Relationships:
${context.relationships.map((r) => `- ${r.from} ${r.bidirectional ? "↔" : "→"} ${r.to} (${r.type})`).join("\n")}
`;

  try {
    const response = await chatCompletion([
      { role: "system", content: MATRIX_AUDIT_PROMPT },
      { role: "user", content: `Analyze this game's plotline matrix:\n${matrixStr}` },
    ]);
    return Response.json({ summary: response });
  } catch (err: any) {
    return Response.json({ error: err.message ?? "Audit failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId, mode } = await req.json();
  if (!gameId) {
    return Response.json({ error: "Missing gameId" }, { status: 400 });
  }

  try {
    const context = await buildGameContext(gameId);
    const findings: any[] = [];

    if (mode === "plotline_matrix") {
      return await handleMatrixAudit(gameId, context);
    }

    const relCounts = new Map<string, number>();
    context.characters.forEach((c) => relCounts.set(c.name, 0));
    context.relationships.forEach((r) => {
      relCounts.set(r.from, (relCounts.get(r.from) ?? 0) + 1);
      relCounts.set(r.to, (relCounts.get(r.to) ?? 0) + 1);
    });
    for (const [name, count] of relCounts) {
      if (count < 3) {
        findings.push({
          type: "isolated_character",
          severity: count === 0 ? "high" : "medium",
          description: `${name} has only ${count} relationship${count !== 1 ? "s" : ""}`,
          suggestion: `Add at least ${3 - count} more relationships for ${name} to integrate them into the character web`,
          entities: [name],
        });
      }
    }

    const charsInPlotlines = new Set(context.plotlines.flatMap((p) => p.characters));
    context.characters.forEach((c) => {
      if (!charsInPlotlines.has(c.name)) {
        findings.push({
          type: "disconnected_character",
          severity: "medium",
          description: `${c.name} is not assigned to any plotline`,
          suggestion: `Assign ${c.name} to at least one plotline to give them narrative purpose`,
          entities: [c.name],
        });
      }
    });

    context.plotlines.forEach((p) => {
      if (p.characters.length < 3) {
        findings.push({
          type: "thin_plotline",
          severity: p.characters.length === 0 ? "high" : "medium",
          description: `Plotline "${p.name}" has only ${p.characters.length} character${p.characters.length !== 1 ? "s" : ""} assigned`,
          suggestion: `Add more characters to "${p.name}" to create richer interactions`,
          entities: [p.name],
        });
      }
    });

    const factionCounts = new Map<string, number>();
    context.characters.forEach((c) => {
      if (c.faction) factionCounts.set(c.faction, (factionCounts.get(c.faction) ?? 0) + 1);
    });
    if (factionCounts.size > 1) {
      const counts = Array.from(factionCounts.values());
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      if (max > min * 2) {
        const smallest = Array.from(factionCounts.entries()).sort((a, b) => a[1] - b[1])[0];
        const largest = Array.from(factionCounts.entries()).sort((a, b) => b[1] - a[1])[0];
        findings.push({
          type: "faction_imbalance",
          severity: "medium",
          description: `Faction "${largest[0]}" has ${largest[1]} characters while "${smallest[0]}" has only ${smallest[1]}`,
          suggestion: `Consider adding characters to "${smallest[0]}" or redistributing to balance gameplay`,
          entities: [largest[0], smallest[0]],
        });
      }
    }

    let aiFindings: any[] = [];
    try {
      const contextStr = `
Characters: ${context.characters.map((c) => `${c.name} (${c.faction ?? "no faction"})`).join(", ")}
Relationships: ${context.relationships.map((r) => `${r.from} ${r.bidirectional ? "↔" : "→"} ${r.to} (${r.type})`).join(", ")}
Plotlines: ${context.plotlines.map((p) => `${p.name}: ${p.characters.join(", ")}`).join("; ")}
`;
      const response = await chatCompletion([
        { role: "system", content: SYSTEM_PROMPT_AUDIT },
        { role: "user", content: `Analyze this game state and find structural issues beyond what basic rules can detect:\n${contextStr}` },
      ]);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) aiFindings = JSON.parse(jsonMatch[0]);
    } catch {
      // AI audit is optional
    }

    const allFindings = [...findings, ...aiFindings];
    allFindings.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return (sev[a.severity as keyof typeof sev] ?? 2) - (sev[b.severity as keyof typeof sev] ?? 2);
    });

    const auditRun = await db.auditRun.create({
      data: {
        gameId,
        summary: `${allFindings.length} issue${allFindings.length !== 1 ? "s" : ""} found (${allFindings.filter((f) => f.severity === "high").length} high, ${allFindings.filter((f) => f.severity === "medium").length} medium, ${allFindings.filter((f) => f.severity === "low").length} low)`,
        findings: {
          create: allFindings.map((f) => ({
            type: f.type,
            severity: f.severity,
            description: f.description,
            suggestion: f.suggestion,
            entities: f.entities ?? [],
          })),
        },
      },
      include: { findings: true },
    });

    return Response.json({ auditRun });
  } catch (err: any) {
    console.error("Audit error:", err);
    return Response.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
