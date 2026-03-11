import type { ActionType, MessageSegment, ActionSegment, TextSegment } from "./action-types";

const ACTION_OPEN_RE = /<action\s+type="([^"]+)"\s+id="([^"]+)">/g;
const ACTION_CLOSE = "</action>";

/**
 * Parse a complete AI response into text and action segments.
 * Handles multiple action blocks interleaved with markdown text.
 */
export function parseActions(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  const openRegex = new RegExp(ACTION_OPEN_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = openRegex.exec(text)) !== null) {
    const actionType = match[1] as ActionType;
    const actionId = match[2];
    const openTagEnd = match.index + match[0].length;

    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim();
      if (textContent) {
        segments.push({ type: "text", content: textContent });
      }
    }

    const closeIndex = text.indexOf(ACTION_CLOSE, openTagEnd);
    if (closeIndex === -1) {
      // Unclosed tag — treat rest as raw text
      segments.push({ type: "text", content: text.slice(match.index).trim() });
      lastIndex = text.length;
      break;
    }

    const jsonStr = text.slice(openTagEnd, closeIndex).trim();
    const raw = text.slice(match.index, closeIndex + ACTION_CLOSE.length);
    lastIndex = closeIndex + ACTION_CLOSE.length;

    try {
      const payload = JSON.parse(jsonStr);
      segments.push({
        type: "action",
        actionType,
        actionId,
        payload,
        raw,
      } as ActionSegment);
    } catch {
      segments.push({ type: "text", content: raw });
    }
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      segments.push({ type: "text", content: remaining });
    }
  }

  return segments;
}

/**
 * Extract only action segments from parsed message.
 */
export function extractActions(text: string): ActionSegment[] {
  return parseActions(text).filter((s): s is ActionSegment => s.type === "action");
}

// --- Streaming parser ---

interface StreamingParserState {
  buffer: string;
  inAction: boolean;
  actionOpenTag: string;
}

export interface StreamingActionParser {
  /** Feed a chunk of streamed text. Returns segments that are ready to render. */
  addChunk(chunk: string): MessageSegment[];
  /** Call when the stream ends to flush any remaining buffered content. */
  flush(): MessageSegment[];
}

/**
 * Create a stateful streaming parser that buffers text while inside an action
 * block and emits segments as they complete.
 */
export function createStreamingActionParser(): StreamingActionParser {
  const state: StreamingParserState = {
    buffer: "",
    inAction: false,
    actionOpenTag: "",
  };

  function tryEmitSegments(): MessageSegment[] {
    const segments: MessageSegment[] = [];

    while (true) {
      if (!state.inAction) {
        // Look for the start of an action tag
        const openMatch = state.buffer.match(/<action\s+type="([^"]+)"\s+id="([^"]+)">/);
        if (!openMatch || openMatch.index === undefined) {
          // Check if we might be in the middle of an opening tag
          const partialTagIdx = state.buffer.lastIndexOf("<action");
          if (partialTagIdx !== -1 && partialTagIdx > state.buffer.length - 80) {
            // Potentially incomplete tag — emit text before it, keep rest in buffer
            if (partialTagIdx > 0) {
              const textBefore = state.buffer.slice(0, partialTagIdx).trim();
              if (textBefore) {
                segments.push({ type: "text", content: textBefore });
              }
              state.buffer = state.buffer.slice(partialTagIdx);
            }
            break;
          }
          // No action tag in sight — emit all buffered text
          break;
        }

        // Emit text before the action tag
        if (openMatch.index > 0) {
          const textBefore = state.buffer.slice(0, openMatch.index).trim();
          if (textBefore) {
            segments.push({ type: "text", content: textBefore });
          }
        }

        state.inAction = true;
        state.actionOpenTag = openMatch[0];
        state.buffer = state.buffer.slice(openMatch.index!);
      }

      if (state.inAction) {
        const closeIdx = state.buffer.indexOf(ACTION_CLOSE);
        if (closeIdx === -1) {
          break; // Still accumulating action content
        }

        const fullBlock = state.buffer.slice(0, closeIdx + ACTION_CLOSE.length);
        state.buffer = state.buffer.slice(closeIdx + ACTION_CLOSE.length);
        state.inAction = false;
        state.actionOpenTag = "";

        // Parse the complete action block
        const parsed = parseActions(fullBlock);
        segments.push(...parsed);
      }
    }

    return segments;
  }

  return {
    addChunk(chunk: string): MessageSegment[] {
      state.buffer += chunk;
      return tryEmitSegments();
    },

    flush(): MessageSegment[] {
      const segments = tryEmitSegments();

      // Emit any remaining buffer as text
      const remaining = state.buffer.trim();
      if (remaining) {
        segments.push({ type: "text", content: remaining });
      }
      state.buffer = "";
      state.inAction = false;

      return segments;
    },
  };
}
