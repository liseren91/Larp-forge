"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Play,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Undo2,
  Users,
  Link2,
  BookOpen,
  Tag,
  Loader2,
  Layers,
  UserPlus,
  Swords,
} from "lucide-react";
import type { ActionType, ExecutionResult } from "@/lib/ai/action-types";

type ActionStatus = "PENDING" | "APPLIED" | "FAILED" | "UNDONE";

interface ChatActionCardProps {
  actionType: ActionType;
  actionId: string;
  payload: Record<string, any>;
  status: ActionStatus;
  result?: ExecutionResult | null;
  onApply: () => Promise<ExecutionResult | void>;
  onUndo?: () => Promise<void>;
}

const ACTION_LABELS: Record<string, string> = {
  "character.create": "Create Character",
  "character.update": "Update Character",
  "character.bulk_create": "Create Characters",
  "relationship.create": "Create Relationship",
  "relationship.bulk_create": "Create Relationships",
  "plotline.create": "Create Plotline",
  "plotline.assign_characters": "Assign to Plotline",
  "plotline.bulk_create": "Create Plotlines",
  "custom_field.set": "Set Custom Field",
  "custom_field.bulk_set": "Set Custom Fields",
  "custom_field.add_option": "Add Field Option",
  "custom_field.create": "Create Custom Field",
  "timeline.create_event": "Create Event",
  "npc.create": "Create NPC",
  "brief.update_section": "Update Brief",
  "composite.group_characters": "Group Characters",
  "composite.plotline_matrix": "Create Plotline Matrix",
};

const ACTION_ICONS: Record<string, typeof Users> = {
  "character.create": UserPlus,
  "character.update": Users,
  "character.bulk_create": Users,
  "relationship.create": Link2,
  "relationship.bulk_create": Link2,
  "plotline.create": BookOpen,
  "plotline.assign_characters": BookOpen,
  "plotline.bulk_create": BookOpen,
  "custom_field.set": Tag,
  "custom_field.bulk_set": Tag,
  "custom_field.add_option": Tag,
  "custom_field.create": Tag,
  "timeline.create_event": Layers,
  "npc.create": Swords,
  "brief.update_section": BookOpen,
  "composite.group_characters": Users,
  "composite.plotline_matrix": Layers,
};

function StatusBadge({ status }: { status: ActionStatus }) {
  switch (status) {
    case "PENDING":
      return <Badge color="amber">Pending</Badge>;
    case "APPLIED":
      return <Badge color="green">Applied</Badge>;
    case "FAILED":
      return <Badge color="red">Failed</Badge>;
    case "UNDONE":
      return <Badge color="zinc">Undone</Badge>;
  }
}

function CharacterCreatePreview({ payload }: { payload: any }) {
  return (
    <div className="text-sm text-zinc-300">
      <span className="font-medium">{payload.name}</span>
      {payload.type && <span className="text-zinc-500"> ({payload.type})</span>}
      {payload.faction && <span className="text-zinc-500"> — {payload.faction}</span>}
      {payload.customFields && typeof payload.customFields === "object" && !Array.isArray(payload.customFields) && (
        <div className="mt-1 text-xs text-zinc-500">
          {Object.entries(payload.customFields).map(([k, v]) => (
            <span key={k} className="mr-2">{k}: {String(v)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkCreatePreview({ payload }: { payload: any }) {
  const rawItems = payload.characters ?? payload.relationships ?? payload.plotlines;
  const items = Array.isArray(rawItems) ? rawItems : [];
  const label = payload.characters ? "characters" : payload.relationships ? "relationships" : "plotlines";
  return (
    <div className="text-sm text-zinc-300">
      <span className="text-zinc-400">{items.length} {label}:</span>
      <div className="mt-1 space-y-0.5">
        {items.slice(0, 5).map((item: any, i: number) => (
          <div key={i} className="text-xs text-zinc-400">
            {item.name || `${item.fromCharacter} → ${item.toCharacter}` || "—"}
            {item.type && <span className="text-zinc-600"> ({item.type})</span>}
          </div>
        ))}
        {items.length > 5 && (
          <div className="text-xs text-zinc-600">...and {items.length - 5} more</div>
        )}
      </div>
    </div>
  );
}

function RelationshipPreview({ payload }: { payload: any }) {
  return (
    <div className="text-sm text-zinc-300">
      <span className="font-medium">{payload.fromCharacter}</span>
      <span className="text-zinc-500"> {payload.bidirectional ? "↔" : "→"} </span>
      <span className="font-medium">{payload.toCharacter}</span>
      {payload.type && <span className="text-zinc-500"> ({payload.type})</span>}
      {payload.description && (
        <div className="mt-1 text-xs text-zinc-500 line-clamp-2">{payload.description}</div>
      )}
    </div>
  );
}

function PlotlinePreview({ payload }: { payload: any }) {
  return (
    <div className="text-sm text-zinc-300">
      <span className="font-medium">{payload.name}</span>
      {payload.type && <span className="text-zinc-500"> ({payload.type})</span>}
      {Array.isArray(payload.characters) && payload.characters.length > 0 && (
        <div className="mt-1 text-xs text-zinc-500">
          Characters: {payload.characters.join(", ")}
        </div>
      )}
    </div>
  );
}

function GroupCharactersPreview({ payload }: { payload: any }) {
  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  return (
    <div className="text-sm text-zinc-300">
      <div className="text-zinc-400 mb-1">
        Field: <span className="font-medium">{payload.fieldSlug}</span>
        {payload.createFieldIfMissing && (
          <span className="ml-2 text-amber-400 text-xs">
            <AlertTriangle className="inline h-3 w-3 mr-0.5" />
            will be created
          </span>
        )}
      </div>
      <div className="space-y-1">
        {groups.slice(0, 6).map((group: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            {group.optionColor && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.optionColor }}
              />
            )}
            <span className="text-xs font-medium">{group.optionLabel}</span>
            <span className="text-xs text-zinc-600">
              ({group.members?.length ?? 0})
            </span>
          </div>
        ))}
        {groups.length > 6 && (
          <div className="text-xs text-zinc-600">
            ...and {groups.length - 6} more groups
          </div>
        )}
      </div>
    </div>
  );
}

function CustomFieldPreview({ payload }: { payload: any }) {
  if (payload.assignments) {
    return (
      <div className="text-sm text-zinc-300">
        <span className="text-zinc-400">Field: </span>
        <span className="font-medium">{payload.fieldSlug}</span>
        <span className="text-zinc-500"> — {Array.isArray(payload.assignments) ? payload.assignments.length : 0} assignments</span>
      </div>
    );
  }
  if (payload.characterName) {
    return (
      <div className="text-sm text-zinc-300">
        <span className="font-medium">{payload.characterName}</span>
        <span className="text-zinc-500"> → {payload.fieldSlug} = {String(payload.value)}</span>
      </div>
    );
  }
  if (payload.name && payload.slug) {
    return (
      <div className="text-sm text-zinc-300">
        <span className="font-medium">{payload.name}</span>
        <span className="text-zinc-500"> (slug: {payload.slug}, type: {payload.fieldType})</span>
        {Array.isArray(payload.options) && payload.options.length > 0 && (
          <div className="mt-1 text-xs text-zinc-500">
            Options: {payload.options.map((o: any) => o.label).join(", ")}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="text-sm text-zinc-300">
      <span className="font-medium">{payload.fieldSlug}</span>
      {payload.label && <span className="text-zinc-500"> + "{payload.label}"</span>}
    </div>
  );
}

function ActionPreview({ actionType, payload }: { actionType: ActionType; payload: any }) {
  switch (actionType) {
    case "character.create":
    case "npc.create":
      return <CharacterCreatePreview payload={payload} />;
    case "character.bulk_create":
    case "relationship.bulk_create":
    case "plotline.bulk_create":
      return <BulkCreatePreview payload={payload} />;
    case "character.update":
      return (
        <div className="text-sm text-zinc-300">
          Update <span className="font-medium">{payload.characterName}</span>
        </div>
      );
    case "relationship.create":
      return <RelationshipPreview payload={payload} />;
    case "plotline.create":
      return <PlotlinePreview payload={payload} />;
    case "plotline.assign_characters":
      return (
        <div className="text-sm text-zinc-300">
          <span className="font-medium">{payload.plotlineName}</span>
          <span className="text-zinc-500"> ← {Array.isArray(payload.characters) ? payload.characters.join(", ") : ""}</span>
        </div>
      );
    case "composite.group_characters":
      return <GroupCharactersPreview payload={payload} />;
    case "composite.plotline_matrix":
      return <BulkCreatePreview payload={{ plotlines: payload.plotlines }} />;
    case "custom_field.set":
    case "custom_field.bulk_set":
    case "custom_field.add_option":
    case "custom_field.create":
      return <CustomFieldPreview payload={payload} />;
    default:
      return (
        <div className="text-xs text-zinc-500 font-mono truncate">
          {JSON.stringify(payload).slice(0, 120)}
        </div>
      );
  }
}

export function ChatActionCard({
  actionType,
  actionId,
  payload,
  status: externalStatus,
  result: externalResult,
  onApply,
  onUndo,
}: ChatActionCardProps) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localStatus, setLocalStatus] = useState<ActionStatus | null>(null);
  const [localResult, setLocalResult] = useState<ExecutionResult | null>(null);

  const status = localStatus ?? externalStatus;
  const result = localResult ?? externalResult;

  const Icon = ACTION_ICONS[actionType] ?? Layers;
  const label = ACTION_LABELS[actionType] ?? actionType;

  const handleApply = async () => {
    setLoading(true);
    try {
      const res = await onApply();
      if (res) {
        setLocalStatus(res.success ? "APPLIED" : "FAILED");
        setLocalResult(res);
      }
    } catch {
      setLocalStatus("FAILED");
      setLocalResult({ success: false, createdEntities: [], errors: [{ field: "_internal", message: "Network error" }] });
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!onUndo) return;
    setLoading(true);
    try {
      await onUndo();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-zinc-700/80 bg-zinc-800/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50">
        <Icon className="h-4 w-4 text-amber-400 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-200 flex-1">{label}</span>
        <StatusBadge status={status} />
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <ActionPreview actionType={actionType} payload={payload} />

        {/* Error display */}
        {status === "FAILED" && Array.isArray(result?.errors) && result.errors.length > 0 && (
          <div className="mt-2 rounded bg-red-900/30 border border-red-800/50 px-2 py-1.5">
            {result.errors.map((e: any, i: number) => (
              <div key={i} className="text-xs text-red-300">
                <span className="font-medium text-red-400">{e.field === "_internal" ? "Error" : e.field}:</span>{" "}
                {e.message}
              </div>
            ))}
          </div>
        )}
        {status === "FAILED" && (!Array.isArray(result?.errors) || result.errors.length === 0) && (
          <div className="mt-2 rounded bg-red-900/30 border border-red-800/50 px-2 py-1.5">
            <div className="text-xs text-red-300">Action failed. Click &quot;Details&quot; to see the payload.</div>
          </div>
        )}

        {/* Expandable details */}
        {expanded && (
          <pre className="mt-2 rounded bg-zinc-900 p-2 text-xs text-zinc-400 overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-zinc-700/50 bg-zinc-800/40">
        {status === "PENDING" && (
          <Button size="sm" onClick={handleApply} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1" />
            )}
            Apply
          </Button>
        )}

        {status === "FAILED" && (
          <Button size="sm" variant="danger" onClick={handleApply} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1" />
            )}
            Retry
          </Button>
        )}

        {status === "APPLIED" && onUndo && (
          <Button size="sm" variant="ghost" onClick={handleUndo} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Undo2 className="h-3.5 w-3.5 mr-1" />
            )}
            Undo
          </Button>
        )}

        {status === "APPLIED" && (
          <span className="flex items-center text-xs text-emerald-400 ml-1">
            <Check className="h-3.5 w-3.5 mr-0.5" />
            Done
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Details
            </>
          )}
        </button>
      </div>
    </div>
  );
}
