"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Props {
  characterId: string;
  gameId: string;
}

export function CustomFieldsPanel({ characterId, gameId }: Props) {
  const defs = trpc.customFields.listDefinitions.useQuery({ gameId });
  const values = trpc.customFields.getValues.useQuery({ characterId });
  const setValues = trpc.customFields.setValues.useMutation({
    onSuccess: () => values.refetch(),
  });

  const [localValues, setLocalValues] = useState<
    Record<string, {
      textValue?: string | null;
      numberValue?: number | null;
      booleanValue?: boolean | null;
      dateValue?: string | null;
      selectedOptionIds?: string[];
    }>
  >({});

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!values.data || !defs.data) return;
    const map: typeof localValues = {};
    for (const def of defs.data) {
      const val = values.data.find((v) => v.definitionId === def.id);
      map[def.id] = {
        textValue: val?.textValue ?? null,
        numberValue: val?.numberValue ?? null,
        booleanValue: val?.booleanValue ?? null,
        dateValue: val?.dateValue ? new Date(val.dateValue).toISOString().split("T")[0] : null,
        selectedOptionIds: val?.selectedOptions.map((so) => so.optionId) ?? [],
      };
    }
    setLocalValues(map);
  }, [values.data, defs.data]);

  const debouncedSave = useCallback(
    (newValues: typeof localValues) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const entries = Object.entries(newValues).map(([definitionId, v]) => ({
          definitionId,
          textValue: v.textValue,
          numberValue: v.numberValue,
          booleanValue: v.booleanValue,
          dateValue: v.dateValue,
          selectedOptionIds: v.selectedOptionIds,
        }));
        setValues.mutate({ characterId, values: entries });
      }, 500);
    },
    [characterId, setValues]
  );

  const updateField = (defId: string, patch: Partial<typeof localValues[string]>) => {
    setLocalValues((prev) => {
      const updated = { ...prev, [defId]: { ...prev[defId], ...patch } };
      debouncedSave(updated);
      return updated;
    });
  };

  if (!defs.data || defs.data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-zinc-500 text-sm">
        No custom fields defined for this game. Go to Settings to add fields.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {defs.data.map((def) => {
        const val = localValues[def.id] ?? {};
        return (
          <div key={def.id}>
            <label className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
              {def.name}
              {def.isRequired && <span className="text-amber-500">*</span>}
            </label>
            {def.description && (
              <p className="mb-1 text-xs text-zinc-600">{def.description}</p>
            )}

            {def.fieldType === "TEXT" && (
              <Input
                value={val.textValue ?? ""}
                onChange={(e) => updateField(def.id, { textValue: e.target.value })}
                placeholder={def.name}
              />
            )}

            {def.fieldType === "TEXTAREA" && (
              <textarea
                className="flex w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                value={val.textValue ?? ""}
                onChange={(e) => updateField(def.id, { textValue: e.target.value })}
                rows={3}
                placeholder={def.name}
              />
            )}

            {def.fieldType === "NUMBER" && (
              <Input
                type="number"
                value={val.numberValue ?? ""}
                onChange={(e) =>
                  updateField(def.id, {
                    numberValue: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="0"
              />
            )}

            {def.fieldType === "DATE" && (
              <Input
                type="date"
                value={val.dateValue ?? ""}
                onChange={(e) => updateField(def.id, { dateValue: e.target.value || null })}
              />
            )}

            {def.fieldType === "BOOLEAN" && (
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={val.booleanValue ?? false}
                  onChange={(e) => updateField(def.id, { booleanValue: e.target.checked })}
                  className="rounded border-zinc-600"
                />
                {def.name}
              </label>
            )}

            {def.fieldType === "URL" && (
              <div className="flex items-center gap-2">
                <Input
                  type="url"
                  value={val.textValue ?? ""}
                  onChange={(e) => updateField(def.id, { textValue: e.target.value })}
                  placeholder="https://..."
                />
                {val.textValue && (
                  <a
                    href={val.textValue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-500 hover:text-amber-400 text-xs whitespace-nowrap"
                  >
                    Open
                  </a>
                )}
              </div>
            )}

            {def.fieldType === "SELECT" && (
              <Select
                value={val.selectedOptionIds?.[0] ?? ""}
                onChange={(e) =>
                  updateField(def.id, {
                    selectedOptionIds: e.target.value ? [e.target.value] : [],
                  })
                }
              >
                <option value="">— select —</option>
                {def.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}

            {def.fieldType === "MULTI_SELECT" && (
              <div className="flex flex-wrap gap-1.5">
                {def.options.map((o) => {
                  const selected = val.selectedOptionIds?.includes(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        const current = val.selectedOptionIds ?? [];
                        const next = selected
                          ? current.filter((id) => id !== o.id)
                          : [...current, o.id];
                        updateField(def.id, { selectedOptionIds: next });
                      }}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        selected
                          ? "border-transparent text-white"
                          : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                      }`}
                      style={
                        selected
                          ? { backgroundColor: o.color || "#6b7280" }
                          : undefined
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {setValues.isPending && (
        <p className="text-xs text-zinc-500 animate-pulse">Saving...</p>
      )}
    </div>
  );
}
