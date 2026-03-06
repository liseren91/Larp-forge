"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, AlertCircle, Info, RefreshCw } from "lucide-react";

interface AuditFinding {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  suggestion: string;
  entities: string[];
}

interface Props {
  gameId: string;
}

const typeLabels: Record<string, string> = {
  isolated_character: "Isolated Character",
  missing_reciprocal: "Missing Reciprocal",
  faction_imbalance: "Faction Imbalance",
  thin_plotline: "Thin Plotline",
  disconnected_character: "Disconnected Character",
  relationship_gap: "Relationship Gap",
};

const severityConfig = {
  high: { color: "red" as const, icon: AlertCircle },
  medium: { color: "amber" as const, icon: AlertTriangle },
  low: { color: "blue" as const, icon: Info },
};

export function AuditPanel({ gameId }: Props) {
  const [findings, setFindings] = useState<AuditFinding[] | null>(null);
  const [loading, setLoading] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      setFindings(data.findings ?? []);
    } catch (err) {
      console.error("Audit failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-zinc-400" />
          <h3 className="font-semibold text-zinc-300">Game Audit</h3>
        </div>
        <Button size="sm" variant="secondary" onClick={runAudit} disabled={loading}>
          <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analyzing..." : findings ? "Re-run Audit" : "Run Audit"}
        </Button>
      </div>

      {!findings && !loading && (
        <p className="text-sm text-zinc-500">
          Run an audit to check for structural issues in your game design.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          Analyzing game structure...
        </div>
      )}

      {findings && findings.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <ShieldCheck size={16} />
          No issues found. Your game structure looks good!
        </div>
      )}

      {findings && findings.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2 text-xs text-zinc-500">
            <span>{findings.filter((f) => f.severity === "high").length} high</span>
            <span>{findings.filter((f) => f.severity === "medium").length} medium</span>
            <span>{findings.filter((f) => f.severity === "low").length} low</span>
          </div>
          {findings.map((finding, i) => {
            const config = severityConfig[finding.severity];
            const Icon = config.icon;
            return (
              <div key={i} className="rounded-lg border border-zinc-800 p-3">
                <div className="flex items-start gap-2">
                  <Icon size={16} className={`mt-0.5 flex-shrink-0 text-${config.color}-400`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color={config.color}>{finding.severity}</Badge>
                      <span className="text-xs text-zinc-500">
                        {typeLabels[finding.type] ?? finding.type}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300">{finding.description}</p>
                    <p className="mt-1 text-xs text-zinc-500">{finding.suggestion}</p>
                    {finding.entities.length > 0 && (
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {finding.entities.map((e) => (
                          <Badge key={e} color="zinc" className="text-[10px]">{e}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
