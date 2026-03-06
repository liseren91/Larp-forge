"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatPage() {
  const { gameId } = useParams() as { gameId: string };
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);

  const messages = trpc.chat.list.useQuery({ gameId, limit: 100 });
  const appendMessage = trpc.chat.append.useMutation({
    onSuccess: () => messages.refetch(),
  });

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data, streamContent]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");

    await appendMessage.mutateAsync({ gameId, role: "USER", content: userMsg });

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

      await appendMessage.mutateAsync({ gameId, role: "ASSISTANT", content: full });
      setStreamContent("");
    } catch (err) {
      console.error("Chat error:", err);
      setStreamContent("");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-zinc-800 px-6 py-3">
        <h2 className="font-semibold">AI Chat</h2>
        <p className="text-xs text-zinc-500">Chat with an AI that understands your entire game</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.data?.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "USER" ? "" : ""}`}
          >
            <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
              msg.role === "USER" ? "bg-zinc-700" : "bg-amber-600"
            }`}>
              {msg.role === "USER" ? <User size={14} /> : <Sparkles size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-500 mb-1">
                {msg.role === "USER" ? "You" : "LARP Forge AI"} · {new Date(msg.createdAt).toLocaleTimeString()}
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-200 [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-zinc-800 [&_pre]:rounded-lg [&_pre]:p-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {streaming && streamContent && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-600">
              <Sparkles size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-500 mb-1">LARP Forge AI · thinking...</div>
              <div className="prose prose-invert prose-sm max-w-none text-zinc-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamContent}</ReactMarkdown>
              </div>
            </div>
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button type="submit" disabled={streaming || !input.trim()} className="self-end">
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
