/**
 * TDD tests for analytics opt-out settings procedures.
 * Written BEFORE implementation (RED phase).
 *
 * Tests verify:
 * 1. settings.getAnalyticsOptOut returns { optOut: false } by default
 * 2. settings.updateAnalyticsOptOut persists true to DB
 * 3. settings.updateAnalyticsOptOut persists false to DB
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Use a unique openId so tests don't collide with other test users
const TEST_OPEN_ID = "posthog-settings-test-user-001";

function createTestContext(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 9991,
    openId: TEST_OPEN_ID,
    email: "posthog-test@example.com",
    name: "PostHog Test User",
    loginMethod: "manus",
    role: "user",
    analyticsOptOut: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("settings.getAnalyticsOptOut", () => {
  it("returns optOut: false for a user with analyticsOptOut = false", async () => {
    const { ctx } = createTestContext({ analyticsOptOut: false });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.getAnalyticsOptOut();

    expect(result).toEqual({ optOut: false });
  });

  it("returns optOut: true for a user with analyticsOptOut = true", async () => {
    const { ctx } = createTestContext({ analyticsOptOut: true });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.getAnalyticsOptOut();

    expect(result).toEqual({ optOut: true });
  });
});

describe("settings.updateAnalyticsOptOut", () => {
  beforeAll(async () => {
    // Ensure test user exists in DB
    const db = await getDb();
    if (!db) return;
    await db.insert(users).values({
      openId: TEST_OPEN_ID,
      name: "PostHog Test User",
      email: "posthog-test@example.com",
      loginMethod: "manus",
      role: "user",
      analyticsOptOut: false,
      lastSignedIn: new Date(),
    }).onDuplicateKeyUpdate({ set: { analyticsOptOut: false } });
  });

  afterAll(async () => {
    // Clean up test user
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.openId, TEST_OPEN_ID));
  });

  it("persists analyticsOptOut = true to the database", async () => {
    const { ctx } = createTestContext({ analyticsOptOut: false });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.updateAnalyticsOptOut({ optOut: true });

    expect(result).toEqual({ success: true });

    // Verify it was written to DB
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ analyticsOptOut: users.analyticsOptOut })
      .from(users)
      .where(eq(users.openId, TEST_OPEN_ID))
      .limit(1);
    expect(row?.analyticsOptOut).toBe(true);
  });

  it("persists analyticsOptOut = false to the database", async () => {
    const { ctx } = createTestContext({ analyticsOptOut: true });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.updateAnalyticsOptOut({ optOut: false });

    expect(result).toEqual({ success: true });

    // Verify it was written to DB
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ analyticsOptOut: users.analyticsOptOut })
      .from(users)
      .where(eq(users.openId, TEST_OPEN_ID))
      .limit(1);
    expect(row?.analyticsOptOut).toBe(false);
  });
});
