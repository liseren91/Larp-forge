"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Loader2, Check, X } from "lucide-react";

const AI_ACTIONS = [
  { id: "generate", label: "Generate content" },
  { id: "improve", label: "Improve text" },
  { id: "translate_ru", label: "Translate to Russian" },
  { id: "translate_en", label: "Translate to English" },
  { id: "custom", label: "Custom prompt...", needsPrompt: true },
];

interface AiInputProps extends InputHTMLAttributes<HTMLInputElement> {
  gameId: string;
  fieldName: string;
  onValueChange?: (value: string) => void;
}

export const AiInput = forwardRef<HTMLInputElement, AiInputProps>(
  ({ className, gameId, fieldName, value, onValueChange, onChange, ...props }, ref) => {
    const [showMenu, setShowMenu] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [customPromptMode, setCustomPromptMode] = useState(false);
    const [customPrompt, setCustomPrompt] = useState("");
    const [preEditValue, setPreEditValue] = useState("");
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const customInputRef = useRef<HTMLInputElement>(null);

    const currentValue = typeof value === "string" ? value : "";

    useEffect(() => {
      if (customPromptMode && customInputRef.current) {
        customInputRef.current.focus();
      }
    }, [customPromptMode]);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          buttonRef.current &&
          !buttonRef.current.contains(e.target as Node)
        ) {
          setShowMenu(false);
          setCustomPromptMode(false);
          setCustomPrompt("");
        }
      };
      if (showMenu) document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMenu]);

    const executeAction = async (action: string, prompt?: string) => {
      setShowMenu(false);
      setCustomPromptMode(false);
      setCustomPrompt("");
      setPreEditValue(currentValue);
      setStreaming(true);

      try {
        const res = await fetch("/api/ai/field-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId,
            fieldName,
            currentValue,
            action,
            customPrompt: prompt,
          }),
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  accumulated += parsed.text;
                  onValueChange?.(accumulated);
                }
              } catch {}
            }
          }
        }

        setShowConfirm(true);
      } catch (err) {
        console.error("AI field assist failed:", err);
      } finally {
        setStreaming(false);
      }
    };

    const handleActionClick = (action: typeof AI_ACTIONS[number]) => {
      if (action.needsPrompt) {
        setCustomPromptMode(true);
        return;
      }
      executeAction(action.id);
    };

    const handleCustomSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (customPrompt.trim()) {
        executeAction("custom", customPrompt);
      }
    };

    const acceptResult = () => setShowConfirm(false);
    const discardResult = () => {
      onValueChange?.(preEditValue);
      setShowConfirm(false);
    };

    const getMenuPosition = useCallback(() => {
      if (!buttonRef.current) return { top: 0, left: 0 };
      const rect = buttonRef.current.getBoundingClientRect();
      return { top: rect.bottom + 4, left: rect.left - 160 };
    }, []);

    return (
      <div className="relative">
        <div className="relative">
          <input
            ref={ref}
            value={value}
            onChange={onChange}
            className={cn(
              "flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 pr-8",
              streaming && "opacity-70",
              className
            )}
            disabled={streaming}
            {...props}
          />
          {!streaming && !showConfirm && (
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-amber-400 transition-colors"
              title="AI Assist"
            >
              <Sparkles size={14} />
            </button>
          )}
          {streaming && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Loader2 size={14} className="animate-spin text-amber-400" />
            </div>
          )}
        </div>

        {showConfirm && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-zinc-500">AI generated</span>
            <button type="button" onClick={acceptResult} className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-emerald-400 hover:text-emerald-300 rounded hover:bg-zinc-800">
              <Check size={10} /> Accept
            </button>
            <button type="button" onClick={discardResult} className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800">
              <X size={10} /> Discard
            </button>
          </div>
        )}

        {showMenu && (
          <div
            ref={menuRef}
            className="fixed z-50 w-52 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1"
            style={getMenuPosition()}
          >
            {customPromptMode ? (
              <form onSubmit={handleCustomSubmit} className="p-2">
                <input
                  ref={customInputRef}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Describe what you need..."
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCustomPromptMode(false);
                      setShowMenu(false);
                    }
                  }}
                />
                <div className="flex justify-end mt-1.5">
                  <button type="submit" disabled={!customPrompt.trim()} className="px-2 py-0.5 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50">
                    Generate
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="px-2 py-1 text-[10px] text-zinc-600 uppercase tracking-wider">AI Actions</div>
                {AI_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
                  >
                    <Sparkles size={10} className="text-zinc-600" />
                    {action.label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);
AiInput.displayName = "AiInput";
