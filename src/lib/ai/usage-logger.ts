import { db } from "@/lib/db";

interface AIUsageLog {
  userId: string;
  gameId: string;
  action: "chat" | "brief_generation" | "section_regeneration" | "audit";
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  model: string;
  durationMs: number;
}

export async function logAIUsage(log: AIUsageLog) {
  try {
    // For MVP: log to console. In production, this would go to a dedicated
    // analytics table or external service for cost tracking and fine-tuning dataset collection.
    if (process.env.NODE_ENV === "development") {
      console.log("[ai-usage]", JSON.stringify(log));
    }
  } catch {
    // Non-critical: don't let logging failures affect the user
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
