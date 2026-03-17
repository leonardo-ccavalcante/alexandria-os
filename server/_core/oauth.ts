import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import {
  acceptInvitation,
  createLibrary,
  getActiveLibraryForUser,
  validateInvitation,
} from "../libraryDb";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Provision a library for a user after login.
 * - If an invite code is provided and valid → join that library.
 * - If user already has a library → do nothing.
 * - Otherwise → create a new library named after the user.
 */
async function provisionLibrary(
  userId: number,
  userName: string,
  inviteCode?: string
): Promise<void> {
  try {
    // Case 1: invite code provided
    if (inviteCode) {
      const invitation = await validateInvitation(inviteCode);
      if (invitation) {
        await acceptInvitation(inviteCode, userId);
        console.log(`[Library] User ${userId} joined library ${invitation.libraryId} via invite`);
        return;
      } else {
        console.warn(`[Library] Invalid/expired invite code "${inviteCode}" for user ${userId}`);
        // Fall through to check if user already has a library
      }
    }

    // Case 2: user already belongs to a library
    const existing = await getActiveLibraryForUser(userId);
    if (existing) {
      console.log(`[Library] User ${userId} already in library ${existing.id} ("${existing.name}")`);
      return;
    }

    // Case 3: create a new library
    const libraryName = `Biblioteca de ${userName}`;
    const library = await createLibrary(userId, libraryName);
    console.log(`[Library] Created new library "${library.name}" (id=${library.id}) for user ${userId}`);
  } catch (err) {
    // Library provisioning failure should not block login
    console.error("[Library] Failed to provision library for user", userId, err);
  }
}

export function registerOAuthRoutes(app: Express) {
  /**
   * OAuth callback — handles login and library provisioning.
   *
   * Flow:
   * 1. Exchange code for token and get user info.
   * 2. Upsert user in the users table.
   * 3. Check if an invite code was passed in the `state` parameter
   *    (the frontend encodes it as JSON: { nonce, invite? }).
   * 4a. If invite code present and valid → join that library.
   * 4b. If user already belongs to a library → skip provisioning.
   * 4c. Otherwise → create a new library for the user.
   * 5. Set session cookie and redirect.
   */
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const stateRaw = getQueryParam(req, "state");

    if (!code || !stateRaw) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Parse invite code from state (state may be a JSON string or plain nonce)
    let inviteCode: string | undefined;
    try {
      const parsed = JSON.parse(decodeURIComponent(stateRaw));
      if (parsed && typeof parsed === "object" && typeof parsed.invite === "string") {
        inviteCode = parsed.invite;
      }
    } catch {
      // state is a plain nonce — no invite code
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, stateRaw);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      // Retrieve the user record so we have their numeric id
      const user = await db.getUserByOpenId(userInfo.openId);
      if (user) {
        await provisionLibrary(user.id, userInfo.name || "Mi Biblioteca", inviteCode);
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
