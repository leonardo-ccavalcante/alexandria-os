/**
 * Client-side PostHog analytics wrapper.
 *
 * Usage:
 *   initPostHog(user);           // call once on app load
 *   trackEvent('page_view', { path: '/triage' });
 *   setOptOut(true);             // disable tracking for this user
 */
import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.posthog.com";
const OPT_OUT_KEY = "ph_opt_out";

let _initialized = false;

function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Initialize PostHog and identify the current user.
 * Call once when auth state resolves.
 */
export function initPostHog(user: { openId: string; name?: string | null; email?: string | null; analyticsOptOut?: boolean } | null): void {
  if (!POSTHOG_KEY) return;

  const optedOut = user?.analyticsOptOut ?? isOptedOut();

  if (!_initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,       // We track manually for full control
      capture_pageview: false,  // We track page views manually
      persistence: "localStorage",
      loaded: (ph) => {
        if (optedOut) ph.opt_out_capturing();
      },
    });
    _initialized = true;
  }

  if (user) {
    if (optedOut) {
      posthog.opt_out_capturing();
    } else {
      posthog.opt_in_capturing();
      posthog.identify(user.openId, {
        name: user.name ?? undefined,
        email: user.email ?? undefined,
      });
    }
  } else {
    // Logged out — reset identity
    posthog.reset();
  }
}

/**
 * Track a named event with optional properties.
 * No-ops if user has opted out or PostHog is not configured.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY || !_initialized) return;
  if (isOptedOut() || posthog.has_opted_out_capturing()) return;
  posthog.capture(name, properties);
}

/**
 * Update the user's opt-out preference.
 * Persists to localStorage immediately; DB sync happens via tRPC mutation.
 */
export function setOptOut(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(OPT_OUT_KEY, "true");
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch {
    // localStorage unavailable (e.g. private browsing) — ignore
  }

  if (!_initialized) return;
  if (value) {
    posthog.opt_out_capturing();
  } else {
    posthog.opt_in_capturing();
  }
}
