"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Undo2,
  History,
} from "lucide-react";

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

function getActionForFinding(finding: { type: string; entities: string[] }, gameId: string) {
  switch (finding.type) {
    case "isolated_character":
    case "disconnected_character":
      return {
        label: "Go to Characters",
        href: `/game/${gameId}/characters`,
      };
    case "thin_plotline":
      return {
        label: "Go to Plotlines",
        href: `/game/${gameId}/plotlines`,
      };
    case "faction_imbalance":
      return {
        label: "View Characters",
        href: `/game/${gameId}/characters`,
      };
    case "relationship_gap":
    case "missing_reciprocal":
      return {
        label: "View Graph",
        href: `/game/${gameId}/graph`,
      };
    default:
      return null;
  }
}

export function AuditPanel({ gameId }: Props) {
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const audits = trpc.audit.list.useQuery({ gameId });
  const resolve = trpc.audit.resolve.useMutation({
    onSuccess: () => audits.refetch(),
  });

  const latestRun = audits.data?.[0] ?? null;
  const olderRuns = audits.data?.slice(1) ?? [];

  const runAudit = async () => {
    setLoading(true);
    try {
      await fetch("/api/ai/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      audits.refetch();
    } catch (err) {
      console.error("Audit failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderFindings = (findings: any[], isLatest: boolean) => {
    const active = findings.filter((f) => !f.resolved);
    const resolved = findings.filter((f) => f.resolved);

    return (
      <div className="space-y-3">
        <div className="flex gap-2 text-xs text-zinc-500">
          <span>{findings.filter((f) => f.severity === "high" && !f.resolved).length} high</span>
          <span>{findings.filter((f) => f.severity === "medium" && !f.resolved).length} medium</span>
          <span>{findings.filter((f) => f.severity === "low" && !f.resolved).length} low</span>
          {resolved.length > 0 && (
            <span className="text-emerald-600">{resolved.length} resolved</span>
          )}
        </div>

        {active.map((finding) => {
          const config = severityConfig[finding.severity as keyof typeof severityConfig] ?? severityConfig.low;
          const Icon = config.icon;
          const action = getActionForFinding(finding, gameId);

          return (
            <div key={finding.id} className="rounded-lg border border-zinc-800 p-3">
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
                      {finding.entities.map((e: string) => (
                        <Badge key={e} color="zinc" className="text-[10px]">{e}</Badge>
                      ))}
                    </div>
                  )}

                  {isLatest && (
                    <div className="mt-2 flex items-center gap-2">
                      {action && (
                        <Link href={action.href}>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2">
                            <ExternalLink size={10} className="mr-1" />
                            {action.label}
                          </Button>
                        </Link>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2 text-emerald-500 hover:text-emerald-400"
                        onClick={() => resolve.mutate({ id: finding.id, resolved: true })}
                      >
                        <CheckCircle2 size={10} className="mr-1" />
                        Resolve
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {resolved.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-zinc-600 mb-2">{resolved.length} resolved issue{resolved.length !== 1 ? "s" : ""}</p>
            {resolved.map((finding) => (
              <div key={finding.id} className="rounded-lg border border-zinc-800/50 p-2 mb-1 opacity-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span className="text-xs text-zinc-500 line-through">{finding.description}</span>
                  </div>
                  {isLatest && (
                    <button
                      onClick={() => resolve.mutate({ id: finding.id, resolved: false })}
                      className="text-zinc-600 hover:text-zinc-400"
                    >
                      <Undo2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-zinc-400" />
          <h3 className="font-semibold text-zinc-300">Game Audit</h3>
          {latestRun && (
            <span className="text-xs text-zinc-600">
              {new Date(latestRun.createdAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {olderRuns.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History size={14} className="mr-1" />
              History ({olderRuns.length})
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={runAudit} disabled={loading}>
            <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analyzing..." : latestRun ? "Re-run Audit" : "Run Audit"}
          </Button>
        </div>
      </div>

      {!latestRun && !loading && (
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

      {latestRun && latestRun.findings.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <ShieldCheck size={16} />
          No issues found. Your game structure looks good!
        </div>
      )}

      {latestRun && latestRun.findings.length > 0 && renderFindings(latestRun.findings, true)}

      {showHistory && olderRuns.length > 0 && (
        <div className="mt-6 border-t border-zinc-800 pt-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Previous Audits</h4>
          {olderRuns.map((run) => (
            <div key={run.id} className="mb-4">
              <HistoryRun run={run} gameId={gameId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRun({ run, gameId }: { run: any; gameId: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-800/50 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-xs text-zinc-400">
          {new Date(run.createdAt).toLocaleString()}
        </span>
        <span className="text-xs text-zinc-600">{run.summary}</span>
      </button>
      {expanded && (
        <div className="mt-3 pl-5 opacity-75">
          {run.findings.map((f: any) => {
            const config = severityConfig[f.severity as keyof typeof severityConfig] ?? severityConfig.low;
            return (
              <div key={f.id} className="flex items-center gap-2 py-1 text-xs text-zinc-500">
                <Badge color={config.color} className="text-[9px]">{f.severity}</Badge>
                <span className={f.resolved ? "line-through" : ""}>{f.description}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
