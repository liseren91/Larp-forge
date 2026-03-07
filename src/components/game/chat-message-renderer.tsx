"use client";

import { useMemo, Component, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseActions } from "@/lib/ai/action-parser";
import { ChatActionCard } from "./chat-action-card";
import type { ActionType, ExecutionResult } from "@/lib/ai/action-types";

interface ActionRecord {
  id: string;
  actionId: string;
  actionType: string;
  payload: any;
  status: "PENDING" | "APPLIED" | "FAILED" | "UNDONE";
  result?: any;
}

interface ChatMessageRendererProps {
  content: string;
  messageId: string;
  actions?: ActionRecord[];
  gameId: string;
  onActionApplied?: () => void;
}

class ActionErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function ChatMessageRenderer({
  content,
  messageId,
  actions,
  gameId,
  onActionApplied,
}: ChatMessageRendererProps) {
  const segments = useMemo(() => {
    try {
      return parseActions(content);
    } catch {
      return [{ type: "text" as const, content }];
    }
  }, [content]);

  const actionStatusMap = useMemo(() => {
    const map = new Map<string, ActionRecord>();
    if (actions) {
      for (const a of actions) {
        map.set(a.actionId, a);
      }
    }
    return map;
  }, [actions]);

  const handleApply = async (
    actionType: ActionType,
    actionId: string,
    payload: any,
  ): Promise<ExecutionResult | void> => {
    try {
      const res = await fetch("/api/ai/execute-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          messageId,
          actionId,
          actionType,
          payload,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Action API error:", res.status, errText);
        return { success: false, createdEntities: [], errors: [{ field: "_http", message: `Server error ${res.status}: ${errText}` }] };
      }

      const result: ExecutionResult = await res.json();

      onActionApplied?.();
      return result;
    } catch (err: any) {
      console.error("Action execution error:", err);
      return { success: false, createdEntities: [], errors: [{ field: "_network", message: err.message ?? "Network error" }] };
    }
  };

  const handleUndo = async (actionId: string) => {
    const record = actionStatusMap.get(actionId);
    if (!record) return;

    try {
      const res = await fetch("/api/ai/undo-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatActionId: record.id }),
      });

      if (res.ok) {
        onActionApplied?.();
      }
    } catch (err) {
      console.error("Undo error:", err);
    }
  };

  return (
    <ActionErrorBoundary
      fallback={
        <div className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-200 [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-zinc-800 [&_pre]:rounded-lg [&_pre]:p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      }
    >
      <div>
        {segments.map((segment, i) => {
          if (segment.type === "text") {
            return (
              <div
                key={i}
                className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-200 [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-zinc-800 [&_pre]:rounded-lg [&_pre]:p-3"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {segment.content}
                </ReactMarkdown>
              </div>
            );
          }

          if (segment.type === "action") {
            const dbRecord = actionStatusMap.get(segment.actionId);
            const status = dbRecord?.status ?? "PENDING";

            return (
              <ChatActionCard
                key={`action-${segment.actionId}-${i}`}
                actionType={segment.actionType}
                actionId={segment.actionId}
                payload={segment.payload as Record<string, any>}
                status={status}
                result={dbRecord?.result}
                onApply={() =>
                  handleApply(
                    segment.actionType,
                    segment.actionId,
                    segment.payload,
                  )
                }
                onUndo={
                  status === "APPLIED"
                    ? () => handleUndo(segment.actionId)
                    : undefined
                }
              />
            );
          }

          return null;
        })}
      </div>
    </ActionErrorBoundary>
  );
}
