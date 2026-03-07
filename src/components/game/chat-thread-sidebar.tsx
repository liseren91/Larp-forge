"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X, MessageSquare } from "lucide-react";

interface ChatThreadSidebarProps {
  gameId: string;
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ChatThreadSidebar({
  gameId,
  activeThreadId,
  onSelectThread,
  onNewThread,
}: ChatThreadSidebarProps) {
  const threads = trpc.chat.listThreads.useQuery({ gameId });
  const renameThread = trpc.chat.renameThread.useMutation();
  const deleteThread = trpc.chat.deleteThread.useMutation();
  const utils = trpc.useUtils();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleRename = useCallback(
    async (threadId: string) => {
      const trimmed = editTitle.trim();
      if (!trimmed) {
        setEditingId(null);
        return;
      }
      await renameThread.mutateAsync({ threadId, title: trimmed });
      utils.chat.listThreads.invalidate({ gameId });
      setEditingId(null);
    },
    [editTitle, renameThread, utils, gameId]
  );

  const handleDelete = useCallback(
    async (threadId: string) => {
      await deleteThread.mutateAsync({ threadId });
      utils.chat.listThreads.invalidate({ gameId });
      setConfirmDeleteId(null);
      if (activeThreadId === threadId) {
        const remaining = threads.data?.filter((t) => t.id !== threadId);
        if (remaining && remaining.length > 0) {
          onSelectThread(remaining[0].id);
        } else {
          onNewThread();
        }
      }
    },
    [deleteThread, utils, gameId, activeThreadId, threads.data, onSelectThread, onNewThread]
  );

  return (
    <div className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">Threads</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onNewThread}
          title="New Chat"
        >
          <Plus size={14} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {threads.data?.map((thread) => (
          <div
            key={thread.id}
            className={cn(
              "group relative flex items-center rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer",
              thread.id === activeThreadId
                ? "bg-zinc-800 text-amber-400"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            )}
            onClick={() => {
              if (editingId !== thread.id && confirmDeleteId !== thread.id) {
                onSelectThread(thread.id);
              }
            }}
          >
            {editingId === thread.id ? (
              <div className="flex w-full items-center gap-1">
                <input
                  ref={editInputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(thread.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:border-amber-500"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRename(thread.id);
                  }}
                  className="text-green-400 hover:text-green-300"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={12} />
                </button>
              </div>
            ) : confirmDeleteId === thread.id ? (
              <div className="flex w-full items-center gap-1">
                <span className="flex-1 truncate text-xs text-red-400">Delete?</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(thread.id);
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <MessageSquare size={14} className="mr-2 flex-shrink-0" />
                <span className="flex-1 truncate text-xs">{thread.title}</span>
                <span className="mr-1 text-[10px] text-zinc-600">
                  {thread._count.messages}
                </span>
                <div className="hidden gap-0.5 group-hover:flex">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTitle(thread.title);
                      setEditingId(thread.id);
                      setConfirmDeleteId(null);
                    }}
                    className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                    title="Rename"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(thread.id);
                      setEditingId(null);
                    }}
                    className="rounded p-0.5 text-zinc-500 hover:bg-red-900/50 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {threads.data?.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-zinc-600">
            No chats yet
          </div>
        )}
      </div>
    </div>
  );
}
