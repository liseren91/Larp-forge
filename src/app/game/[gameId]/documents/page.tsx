"use client";

import { useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FileText,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
} from "lucide-react";

const categoryLabels: Record<string, string> = {
  DESIGN_DOC: "Design Doc",
  RULESET: "Ruleset",
  REFERENCE: "Reference",
  EXPORT: "Export",
};

const categoryColors: Record<string, string> = {
  DESIGN_DOC: "amber",
  RULESET: "blue",
  REFERENCE: "zinc",
  EXPORT: "purple",
};

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { gameId } = useParams() as { gameId: string };
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("REFERENCE");
  const [uploadDescription, setUploadDescription] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [editDescValue, setEditDescValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = trpc.file.list.useQuery({ gameId });
  const updateFile = trpc.file.update.useMutation({
    onSuccess: () => files.refetch(),
  });
  const deleteFile = trpc.file.delete.useMutation({
    onSuccess: () => files.refetch(),
  });

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);

      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("gameId", gameId);
        formData.append("category", uploadCategory);
        if (uploadDescription) formData.append("description", uploadDescription);

        try {
          await fetch("/api/files/upload", { method: "POST", body: formData });
        } catch (err) {
          console.error("Upload failed:", err);
        }
      }

      setUploading(false);
      setShowUpload(false);
      setUploadCategory("REFERENCE");
      setUploadDescription("");
      files.refetch();
    },
    [gameId, uploadCategory, uploadDescription, files]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const startEditDesc = (id: string, current: string | null) => {
    setEditingDescId(id);
    setEditDescValue(current ?? "");
  };

  const saveDesc = (id: string) => {
    updateFile.mutate({ id, description: editDescValue });
    setEditingDescId(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Upload design docs, rulesets and references. Add descriptions to guide AI when to use each document.
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload size={14} className="mr-1" /> Upload
        </Button>
      </div>

      <div
        className={`mb-6 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-amber-500 bg-amber-500/5"
            : "border-zinc-700 bg-zinc-900/30"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <FileText size={32} className="mx-auto mb-2 text-zinc-500" />
        <p className="text-sm text-zinc-400">
          Drag & drop files here, or{" "}
          <button
            className="text-amber-400 hover:underline"
            onClick={() => setShowUpload(true)}
          >
            click to upload
          </button>
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Supports PDF, DOCX, TXT, MD
        </p>
      </div>

      {files.data?.length === 0 && (
        <EmptyState
          icon={<FileText size={48} />}
          title="No documents yet"
          description="Upload your design documents, rulesets and reference materials to give AI better context."
        />
      )}

      <div className="space-y-3">
        {files.data?.map((file) => (
          <div
            key={file.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <FileText size={20} className="mt-0.5 text-zinc-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{file.name}</span>
                    <Badge color={(categoryColors[file.category] as any) ?? "zinc"}>
                      {categoryLabels[file.category] ?? file.category}
                    </Badge>
                    <span className="text-xs text-zinc-600">
                      {formatSize(file.size)}
                    </span>
                  </div>

                  {editingDescId === file.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={editDescValue}
                        onChange={(e) => setEditDescValue(e.target.value)}
                        placeholder="When should AI use this document..."
                        className="h-8 text-xs"
                      />
                      <button onClick={() => saveDesc(file.id)} className="text-emerald-400 hover:text-emerald-300">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingDescId(null)} className="text-zinc-500 hover:text-zinc-300">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-1">
                      <p className="text-xs text-zinc-500 italic">
                        {file.description || "No agent description — click to add"}
                      </p>
                      <button
                        onClick={() => startEditDesc(file.id, file.description)}
                        className="text-zinc-600 hover:text-zinc-400"
                      >
                        <Pencil size={10} />
                      </button>
                    </div>
                  )}

                  {file.extractedText && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedId(expandedId === file.id ? null : file.id)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        {expandedId === file.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        Preview extracted text
                      </button>
                      {expandedId === file.id && (
                        <pre className="mt-2 max-h-60 overflow-y-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400 whitespace-pre-wrap">
                          {file.extractedText.slice(0, 3000)}
                          {file.extractedText.length > 3000 && "\n\n... (truncated)"}
                        </pre>
                      )}
                    </div>
                  )}

                  <div className="mt-1 text-[10px] text-zinc-600">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (confirm("Delete this document?")) deleteFile.mutate({ id: file.id });
                }}
                className="ml-2 text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Category</label>
            <Select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
            >
              <option value="DESIGN_DOC">Design Document</option>
              <option value="RULESET">Ruleset</option>
              <option value="REFERENCE">Reference Material</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Agent Description
            </label>
            <Textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="When should AI refer to this document? e.g. 'Use for world lore and faction details'"
              rows={2}
            />
            <p className="mt-1 text-xs text-zinc-600">
              This tells the AI when to pull information from this document.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              multiple
              className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:text-zinc-300 hover:file:bg-zinc-700"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
            <Button
              disabled={uploading}
              onClick={() => handleUpload(fileInputRef.current?.files ?? null)}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
