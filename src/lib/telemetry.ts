type EventName =
  | "game_created"
  | "character_created"
  | "relationship_created"
  | "plotline_created"
  | "brief_generated"
  | "brief_approved"
  | "brief_exported"
  | "chat_message_sent"
  | "audit_run"
  | "onboarding_started"
  | "onboarding_completed";

interface EventProps {
  gameId?: string;
  entityId?: string;
  [key: string]: string | number | boolean | undefined;
}

export function trackEvent(event: EventName, props?: EventProps) {
  if (typeof window === "undefined") return;

  // PostHog integration (add NEXT_PUBLIC_POSTHOG_KEY to enable)
  const posthog = (window as any).posthog;
  if (posthog) {
    posthog.capture(event, props);
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[telemetry] ${event}`, props);
  }
}

export function identifyUser(userId: string, traits?: Record<string, string>) {
  if (typeof window === "undefined") return;

  const posthog = (window as any).posthog;
  if (posthog) {
    posthog.identify(userId, traits);
  }
}
