/**
 * Server-side PostHog analytics wrapper.
 *
 * Usage:
 *   await serverTrack(ctx.user.openId, 'book_cataloged', { isbn, libraryId }, ctx.user.analyticsOptOut);
 *
 * No-ops when:
 *   - POSTHOG_API_KEY is not set
 *   - optOut is true
 */
import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://us.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

export async function serverTrack(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
  optOut?: boolean,
): Promise<void> {
  if (optOut) return;
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId,
    event,
    properties: properties ?? {},
  });
}

export async function shutdownPostHog(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = null;
  }
}

/** Reset singleton — only for use in tests */
export function _resetPostHogClientForTests(): void {
  _client = null;
}
