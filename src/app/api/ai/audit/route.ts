import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGameContext } from "@/lib/ai/context-builder";
import { SYSTEM_PROMPT_AUDIT } from "@/lib/ai/prompts";
import { chatCompletion } from "@/lib/ai/llm-client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId } = await req.json();
  if (!gameId) {
    return Response.json({ error: "Missing gameId" }, { status: 400 });
  }

  try {
    const context = await buildGameContext(gameId);

    // Run rule-based checks first (fast, no LLM needed)
    const findings: any[] = [];

    // Isolated characters
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

    // Characters not in any plotline
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

    // Thin plotlines
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

    // Faction imbalance
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

    // Optionally enhance with LLM analysis for deeper insights
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
      // AI audit is optional; rule-based findings are sufficient
    }

    const allFindings = [...findings, ...aiFindings];
    allFindings.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return (sev[a.severity as keyof typeof sev] ?? 2) - (sev[b.severity as keyof typeof sev] ?? 2);
    });

    return Response.json({ findings: allFindings });
  } catch (err: any) {
    console.error("Audit error:", err);
    return Response.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
