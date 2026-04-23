/**
 * TDD tests for server/_core/posthog.ts
 *
 * Tests verify:
 * 1. serverTrack sends event when analyticsOptOut = false
 * 2. serverTrack no-ops when analyticsOptOut = true
 * 3. serverTrack no-ops when POSTHOG_API_KEY is not configured
 * 4. serverTrack sends empty properties when props omitted
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostHog } from "posthog-node";
import { serverTrack, _resetPostHogClientForTests } from "./_core/posthog";

vi.mock("posthog-node", () => {
  const capture = vi.fn();
  const shutdown = vi.fn().mockResolvedValue(undefined);
  const PostHog = vi.fn(() => ({ capture, shutdown }));
  // Expose spies on the constructor for inspection
  (PostHog as unknown as Record<string, unknown>)._capture = capture;
  return { PostHog };
});

function getCaptureSpy() {
  return (PostHog as unknown as { _capture: ReturnType<typeof vi.fn> })._capture;
}

describe("serverTrack", () => {
  const originalKey = process.env.POSTHOG_API_KEY;
  const originalHost = process.env.POSTHOG_HOST;

  beforeEach(() => {
    getCaptureSpy().mockClear();
    vi.mocked(PostHog).mockClear();
    process.env.POSTHOG_API_KEY = "phc_test_key";
    process.env.POSTHOG_HOST = "https://us.posthog.com";
    _resetPostHogClientForTests();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalKey;
    if (originalHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = originalHost;
    _resetPostHogClientForTests();
  });

  it("sends event when analyticsOptOut is false", async () => {
    await serverTrack("user-openid-123", "test_event", { foo: "bar" }, false);

    expect(getCaptureSpy()).toHaveBeenCalledOnce();
    expect(getCaptureSpy()).toHaveBeenCalledWith({
      distinctId: "user-openid-123",
      event: "test_event",
      properties: { foo: "bar" },
    });
  });

  it("does NOT send event when analyticsOptOut is true", async () => {
    await serverTrack("user-openid-123", "test_event", { foo: "bar" }, true);

    expect(getCaptureSpy()).not.toHaveBeenCalled();
  });

  it("does NOT send event when POSTHOG_API_KEY is not configured", async () => {
    delete process.env.POSTHOG_API_KEY;

    await serverTrack("user-openid-123", "test_event", {}, false);

    expect(getCaptureSpy()).not.toHaveBeenCalled();
  });

  it("sends event with empty properties when props omitted", async () => {
    await serverTrack("user-openid-123", "test_event", undefined, false);

    expect(getCaptureSpy()).toHaveBeenCalledOnce();
    expect(getCaptureSpy()).toHaveBeenCalledWith({
      distinctId: "user-openid-123",
      event: "test_event",
      properties: {},
    });
  });
});
