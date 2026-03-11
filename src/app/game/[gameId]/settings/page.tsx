"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Settings,
  Layers,
  ListChecks,
  GripVertical,
  Palette,
  Users,
  LogOut,
  Crown,
  UserMinus,
} from "lucide-react";

const FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Long Text" },
  { value: "NUMBER", label: "Number" },
  { value: "SELECT", label: "Select" },
  { value: "MULTI_SELECT", label: "Multi-Select" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes/No" },
  { value: "URL", label: "URL" },
] as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");
}

export default function SettingsPage() {
  const { gameId } = useParams() as { gameId: string };
  const [activeSection, setActiveSection] = useState<"fields" | "subroles" | "pipeline" | "members">("fields");

  const sections = [
    { id: "fields" as const, label: "Custom Fields", icon: <Settings size={14} /> },
    { id: "subroles" as const, label: "Sub-Roles", icon: <Layers size={14} /> },
    { id: "pipeline" as const, label: "Pipeline Stages", icon: <ListChecks size={14} /> },
    { id: "members" as const, label: "Members", icon: <Users size={14} /> },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-xl font-bold">Game Settings</h1>

      <div className="mb-6 flex gap-1 border-b border-zinc-800">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeSection === s.id
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === "fields" && <CustomFieldsSection gameId={gameId} />}
      {activeSection === "subroles" && <SubRolesSection gameId={gameId} />}
      {activeSection === "pipeline" && <PipelineSection gameId={gameId} />}
      {activeSection === "members" && <MembersSection gameId={gameId} />}
    </div>
  );
}

function CustomFieldsSection({ gameId }: { gameId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    fieldType: "TEXT" as string,
    description: "",
    isRequired: false,
    entityCategory: "",
    options: [] as { label: string; color: string }[],
  });

  const defs = trpc.customFields.listDefinitions.useQuery({ gameId });
  const createDef = trpc.customFields.createDefinition.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setForm({ name: "", fieldType: "TEXT", description: "", isRequired: false, entityCategory: "", options: [] });
      defs.refetch();
    },
  });
  const deleteDef = trpc.customFields.deleteDefinition.useMutation({
    onSuccess: () => defs.refetch(),
  });

  const needsOptions = form.fieldType === "SELECT" || form.fieldType === "MULTI_SELECT";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Define custom attributes for characters in this game.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} className="mr-1" /> Add Field
        </Button>
      </div>

      {defs.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
          No custom fields defined yet. Add fields to track game-specific character attributes.
        </div>
      )}

      <div className="space-y-2">
        {defs.data?.map((def) => (
          <div
            key={def.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div className="flex items-center gap-3">
              <GripVertical size={14} className="text-zinc-600" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{def.name}</span>
                  <Badge color="zinc">{def.fieldType.toLowerCase().replace("_", "-")}</Badge>
                  {def.isRequired && <Badge color="amber">required</Badge>}
                  {def.entityCategory && <Badge color="blue">{def.entityCategory}</Badge>}
                </div>
                {def.description && (
                  <p className="text-xs text-zinc-500 mt-0.5">{def.description}</p>
                )}
                {def.options.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {def.options.map((o) => (
                      <span
                        key={o.id}
                        className="inline-block rounded px-1.5 py-0.5 text-[10px]"
                        style={{
                          backgroundColor: o.color ? `${o.color}20` : undefined,
                          color: o.color || undefined,
                          border: `1px solid ${o.color || "#52525b"}`,
                        }}
                      >
                        {o.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete field "${def.name}"?`)) deleteDef.mutate({ id: def.id });
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Custom Field">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createDef.mutate({
              gameId,
              name: form.name,
              slug: slugify(form.name),
              fieldType: form.fieldType as any,
              description: form.description || undefined,
              isRequired: form.isRequired,
              entityCategory: form.entityCategory || undefined,
              options: needsOptions ? form.options : undefined,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Field Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder='e.g. "Diagnosis", "Clan", "Generation"'
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Type</label>
              <Select
                value={form.fieldType}
                onChange={(e) => setForm((p) => ({ ...p, fieldType: e.target.value }))}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Category (optional)</label>
              <Input
                value={form.entityCategory}
                onChange={(e) => setForm((p) => ({ ...p, entityCategory: e.target.value }))}
                placeholder='e.g. "doctor", "patient"'
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Hint for game masters and AI"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.isRequired}
              onChange={(e) => setForm((p) => ({ ...p, isRequired: e.target.checked }))}
              className="rounded border-zinc-600"
            />
            Required field
          </label>

          {needsOptions && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Options</label>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={opt.color || "#6b7280"}
                      onChange={(e) => {
                        const updated = [...form.options];
                        updated[i] = { ...updated[i], color: e.target.value };
                        setForm((p) => ({ ...p, options: updated }));
                      }}
                      className="h-8 w-8 rounded border border-zinc-700 bg-transparent"
                    />
                    <Input
                      value={opt.label}
                      onChange={(e) => {
                        const updated = [...form.options];
                        updated[i] = { ...updated[i], label: e.target.value };
                        setForm((p) => ({ ...p, options: updated }));
                      }}
                      placeholder="Option label"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm((p) => ({
                          ...p,
                          options: p.options.filter((_, j) => j !== i),
                        }));
                      }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      options: [...p.options, { label: "", color: "#6b7280" }],
                    }))
                  }
                >
                  <Plus size={12} className="mr-1" /> Add Option
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDef.isPending}>
              {createDef.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SubRolesSection({ gameId }: { gameId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");

  const defs = trpc.subRoles.listDefinitions.useQuery({ gameId });
  const createDef = trpc.subRoles.createDefinition.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setName("");
      defs.refetch();
    },
  });
  const deleteDef = trpc.subRoles.deleteDefinition.useMutation({
    onSuccess: () => defs.refetch(),
  });
  const initPreset = trpc.subRoles.initPreset.useMutation({
    onSuccess: () => defs.refetch(),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Define sub-role structure for characters (e.g., Ego/Alter-Ego).
        </p>
        <div className="flex gap-2">
          <Select
            className="w-auto"
            onChange={(e) => {
              if (e.target.value) {
                initPreset.mutate({ gameId, preset: e.target.value as any });
                e.target.value = "";
              }
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Load Preset...
            </option>
            <option value="ego_alter">Ego / Alter-Ego</option>
            <option value="human_beast">Human / Beast</option>
            <option value="public_secret">Public / Secret</option>
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      {defs.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
          No sub-roles defined. Load a preset or add manually.
        </div>
      )}

      <div className="space-y-2">
        {defs.data?.map((def) => (
          <div
            key={def.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div className="flex items-center gap-3">
              <GripVertical size={14} className="text-zinc-600" />
              <span className="font-medium text-sm">{def.name}</span>
              <span className="text-xs text-zinc-500">{def.slug}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete sub-role "${def.name}"?`)) deleteDef.mutate({ id: def.id });
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Sub-Role">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createDef.mutate({ gameId, name, slug: slugify(name) });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Ego", "Alter-Ego"'
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDef.isPending}>
              {createDef.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function PipelineSection({ gameId }: { gameId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    color: "#6b7280",
    stageType: "KANBAN_COLUMN" as "KANBAN_COLUMN" | "CHECKBOX",
    isFinal: false,
  });

  const stages = trpc.briefPipeline.listStages.useQuery({ gameId });
  const createStage = trpc.briefPipeline.createStage.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setForm({ name: "", color: "#6b7280", stageType: "KANBAN_COLUMN", isFinal: false });
      stages.refetch();
    },
  });
  const deleteStage = trpc.briefPipeline.deleteStage.useMutation({
    onSuccess: () => stages.refetch(),
  });
  const initPreset = trpc.briefPipeline.initPreset.useMutation({
    onSuccess: () => stages.refetch(),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Define workflow stages for brief preparation tracking.
        </p>
        <div className="flex gap-2">
          <Select
            className="w-auto"
            onChange={(e) => {
              if (e.target.value) {
                initPreset.mutate({ gameId, preset: e.target.value as any });
                e.target.value = "";
              }
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Load Preset...
            </option>
            <option value="default">Default Kanban</option>
            <option value="bedlam">Bedlam-style Checkboxes</option>
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1" /> Add Stage
          </Button>
        </div>
      </div>

      {stages.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
          No pipeline stages defined. Load a preset or add manually.
        </div>
      )}

      <div className="space-y-2">
        {stages.data?.map((stage) => (
          <div
            key={stage.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div className="flex items-center gap-3">
              <GripVertical size={14} className="text-zinc-600" />
              <div
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="font-medium text-sm">{stage.name}</span>
              <Badge color="zinc">
                {stage.stageType === "CHECKBOX" ? "checkbox" : "column"}
              </Badge>
              {stage.isFinal && <Badge color="green">final</Badge>}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete stage "${stage.name}"?`)) deleteStage.mutate({ id: stage.id });
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Pipeline Stage">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createStage.mutate({
              gameId,
              name: form.name,
              slug: slugify(form.name),
              color: form.color,
              stageType: form.stageType,
              isFinal: form.isFinal,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder='e.g. "Editing", "Review"'
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Type</label>
              <Select
                value={form.stageType}
                onChange={(e) => setForm((p) => ({ ...p, stageType: e.target.value as any }))}
              >
                <option value="KANBAN_COLUMN">Kanban Column</option>
                <option value="CHECKBOX">Checkbox</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="h-10 w-10 rounded border border-zinc-700 bg-transparent"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.isFinal}
              onChange={(e) => setForm((p) => ({ ...p, isFinal: e.target.checked }))}
              className="rounded border-zinc-600"
            />
            Final stage (marks brief as complete)
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createStage.isPending}>
              {createStage.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MembersSection({ gameId }: { gameId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const membersQuery = trpc.gameMembers.list.useQuery({ gameId });
  const invite = trpc.gameMembers.invite.useMutation({
    onSuccess: () => {
      setEmail("");
      setError("");
      membersQuery.refetch();
    },
    onError: (err) => setError(err.message),
  });
  const remove = trpc.gameMembers.remove.useMutation({
    onSuccess: () => membersQuery.refetch(),
  });
  const leave = trpc.gameMembers.leave.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  const isOwner = membersQuery.data?.ownerId === session?.user?.id;

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">
        Manage who has access to this game.
      </p>

      {isOwner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            invite.mutate({ gameId, email });
          }}
          className="mb-6 flex gap-2"
        >
          <Input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="user@example.com"
            type="email"
            required
            className="flex-1"
          />
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Inviting..." : "Invite"}
          </Button>
        </form>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-400">{error}</p>
      )}

      <div className="space-y-2">
        {membersQuery.data && (
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center gap-3">
              <Crown size={14} className="text-amber-400" />
              <span className="text-sm font-medium">Owner</span>
              <span className="text-xs text-zinc-500">
                {session?.user?.id === membersQuery.data.ownerId ? "You" : ""}
              </span>
            </div>
            <Badge color="amber">owner</Badge>
          </div>
        )}

        {membersQuery.data?.members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <div className="flex items-center gap-3">
              {member.user.image ? (
                <img src={member.user.image} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-300">
                  {(member.user.name ?? member.user.email ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <span className="text-sm font-medium">
                  {member.user.name ?? member.user.email}
                </span>
                {member.user.name && member.user.email && (
                  <span className="ml-2 text-xs text-zinc-500">{member.user.email}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color="green">{member.role.toLowerCase()}</Badge>
              {isOwner && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Remove ${member.user.name ?? member.user.email}?`)) {
                      remove.mutate({ gameId, userId: member.userId });
                    }
                  }}
                >
                  <UserMinus size={14} />
                </Button>
              )}
              {!isOwner && member.userId === session?.user?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Leave this project?")) {
                      leave.mutate({ gameId });
                    }
                  }}
                >
                  <LogOut size={14} />
                </Button>
              )}
            </div>
          </div>
        ))}

        {membersQuery.data?.members.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
            No team members yet. Invite collaborators by email above.
          </div>
        )}
      </div>

      {!isOwner && (
        <div className="mt-6 border-t border-zinc-800 pt-4">
          <Button
            variant="ghost"
            className="text-red-400 hover:text-red-300"
            onClick={() => {
              if (confirm("Leave this project? You will lose access.")) {
                leave.mutate({ gameId });
              }
            }}
          >
            <LogOut size={14} className="mr-2" />
            Leave Project
          </Button>
        </div>
      )}
    </div>
  );
}
