"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, User, Play } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessageRenderer } from "@/components/game/chat-message-renderer";
import { ChatThreadSidebar } from "@/components/game/chat-thread-sidebar";
import { parseActions, extractActions } from "@/lib/ai/action-parser";

export default function ChatPage() {
  const { gameId } = useParams() as { gameId: string };
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const initializedRef = useRef(false);

  const threads = trpc.chat.listThreads.useQuery({ gameId });
  const createThread = trpc.chat.createThread.useMutation();

  const messages = trpc.chat.list.useQuery(
    { gameId, threadId: activeThreadId!, limit: 100 },
    { enabled: !!activeThreadId }
  );
  const appendMessage = trpc.chat.append.useMutation();
  const renameThread = trpc.chat.renameThread.useMutation();

  useEffect(() => {
    if (initializedRef.current || !threads.data) return;
    if (threads.data.length > 0 && !activeThreadId) {
      setActiveThreadId(threads.data[0].id);
      initializedRef.current = true;
    } else if (threads.data.length === 0) {
      initializedRef.current = true;
      createThread
        .mutateAsync({ gameId })
        .then((t) => {
          setActiveThreadId(t.id);
          utils.chat.listThreads.invalidate({ gameId });
        });
    }
  }, [threads.data, activeThreadId, gameId, createThread, utils]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data, streamContent]);

  const refetchMessages = useCallback(() => {
    messages.refetch();
  }, [messages.refetch]);

  const handleActionApplied = useCallback(() => {
    refetchMessages();
    utils.character.list.invalidate({ gameId });
    utils.relationship.list.invalidate({ gameId });
    utils.plotline.list.invalidate({ gameId });
    utils.customFields.listDefinitions.invalidate({ gameId });
  }, [gameId, refetchMessages, utils]);

  const handleApplyAll = useCallback(
    async (msgContent: string, msgId: string) => {
      const segments = parseActions(msgContent);
      const actionSegments = segments.filter((s) => s.type === "action");

      for (const seg of actionSegments) {
        if (seg.type !== "action") continue;
        try {
          await fetch("/api/ai/execute-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gameId,
              messageId: msgId,
              actionId: seg.actionId,
              actionType: seg.actionType,
              payload: seg.payload,
            }),
          });
        } catch (err) {
          console.error("Apply all error for action:", seg.actionId, err);
        }
      }

      handleActionApplied();
    },
    [gameId, handleActionApplied]
  );

  const autoNameThread = useCallback(
    async (threadId: string, userMessage: string) => {
      try {
        const res = await fetch("/api/ai/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage }),
        });
        if (res.ok) {
          const { title } = await res.json();
          if (title) {
            await renameThread.mutateAsync({ threadId, title });
            utils.chat.listThreads.invalidate({ gameId });
          }
        }
      } catch {
        // non-critical, ignore
      }
    },
    [renameThread, utils, gameId]
  );

  const handleSend = async () => {
    if (!input.trim() || streaming || !activeThreadId) return;
    const userMsg = input.trim();
    setInput("");

    const isFirstMessage = !messages.data || messages.data.length === 0;

    await appendMessage.mutateAsync({
      gameId,
      threadId: activeThreadId,
      role: "USER",
      content: userMsg,
    });
    refetchMessages();

    setStreaming(true);
    setStreamContent("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, message: userMsg }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          setStreamContent(full);
        }
      }

      const assistantMsg = await appendMessage.mutateAsync({
        gameId,
        threadId: activeThreadId,
        role: "ASSISTANT",
        content: full,
      });

      if (assistantMsg?.id) {
        const actions = extractActions(full);
        if (actions.length > 0) {
          try {
            await fetch("/api/ai/save-actions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: assistantMsg.id,
                actions: actions.map((a) => ({
                  actionId: a.actionId,
                  actionType: a.actionType,
                  payload: a.payload,
                })),
              }),
            });
          } catch (err) {
            console.error("Failed to save actions:", err);
          }
        }
      }

      setStreamContent("");
      refetchMessages();
      utils.chat.listThreads.invalidate({ gameId });

      if (isFirstMessage) {
        autoNameThread(activeThreadId, userMsg);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setStreamContent("");
    } finally {
      setStreaming(false);
    }
  };

  const handleNewThread = useCallback(async () => {
    const thread = await createThread.mutateAsync({ gameId });
    setActiveThreadId(thread.id);
    utils.chat.listThreads.invalidate({ gameId });
  }, [createThread, gameId, utils]);

  const hasActions = useCallback(
    (msg: { content: string; role: string }) => {
      if (msg.role !== "ASSISTANT") return false;
      return msg.content.includes("<action ");
    },
    []
  );

  const hasPendingActions = useCallback((msg: any) => {
    if (!msg.actions || msg.actions.length === 0) {
      return msg.content.includes("<action ");
    }
    return msg.actions.some((a: any) => a.status === "PENDING");
  }, []);

  return (
    <div className="flex h-screen">
      <ChatThreadSidebar
        gameId={gameId}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onNewThread={handleNewThread}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <div className="border-b border-zinc-800 px-6 py-3">
          <h2 className="font-semibold">AI Chat</h2>
          <p className="text-xs text-zinc-500">
            Chat with an AI that understands your entire game
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.data?.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                  msg.role === "USER" ? "bg-zinc-700" : "bg-amber-600"
                }`}
              >
                {msg.role === "USER" ? (
                  <User size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-zinc-500 mb-1">
                  {msg.role === "USER" ? "You" : "LARP Forge AI"} ·{" "}
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </div>

                {msg.role === "ASSISTANT" && hasActions(msg) ? (
                  <>
                    <ChatMessageRenderer
                      content={msg.content}
                      messageId={msg.id}
                      actions={msg.actions}
                      gameId={gameId}
                      onActionApplied={handleActionApplied}
                    />
                    {hasPendingActions(msg) && (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleApplyAll(msg.content, msg.id)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Apply All Actions
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-200 [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-zinc-800 [&_pre]:rounded-lg [&_pre]:p-3">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {streaming && streamContent && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-600">
                <Sparkles size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-zinc-500 mb-1">
                  LARP Forge AI · thinking...
                </div>
                <StreamingContent content={streamContent} />
              </div>
            </div>
          )}

          {!activeThreadId && (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
              Select or create a chat to get started
            </div>
          )}

          <div ref={messagesEnd} />
        </div>

        <div className="border-t border-zinc-800 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your game, brainstorm ideas, or request actions..."
              rows={2}
              className="flex-1 resize-none"
              disabled={!activeThreadId}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              type="submit"
              disabled={streaming || !input.trim() || !activeThreadId}
              className="self-end"
            >
              <Send size={16} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StreamingContent({ content }: { content: string }) {
  const segments = useMemo(() => {
    try {
      return parseActions(content);
    } catch {
      return [{ type: "text" as const, content }];
    }
  }, [content]);

  return (
    <div>
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return (
            <div
              key={i}
              className="prose prose-invert prose-sm max-w-none text-zinc-300"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {segment.content}
              </ReactMarkdown>
            </div>
          );
        }

        if (segment.type === "action") {
          return (
            <div
              key={`stream-action-${i}`}
              className="my-2 rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-500"
            >
              Action: {segment.actionType} — will be available after response
              completes
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
