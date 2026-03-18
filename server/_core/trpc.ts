import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * libraryProcedure — requires authentication AND active library membership.
 * Injects ctx.library (the active library with memberRole) into the context.
 * Throws FORBIDDEN if the user has no library or is not a member.
 *
 * Use this for all inventory, analytics, export, and import procedures
 * to enforce per-library tenant isolation and access control.
 */
const requireLibraryMember = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { getActiveLibraryForUser } = await import('../libraryDb');
  const library = await getActiveLibraryForUser(ctx.user.id);

  if (!library) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No perteneces a ninguna biblioteca. Solicita una invitación al administrador.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      library,
    },
  });
});

export const libraryProcedure = t.procedure.use(requireLibraryMember);

/**
 * libraryAdminProcedure — requires authentication, active library membership,
 * AND the member must have role 'admin' or 'owner'.
 *
 * Use this for destructive or privileged operations: bulk delete, export all,
 * settings changes, member management, etc.
 */
const requireLibraryAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const { getActiveLibraryForUser } = await import('../libraryDb');
  const library = await getActiveLibraryForUser(ctx.user.id);

  if (!library) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No perteneces a ninguna biblioteca. Solicita una invitación al administrador.",
    });
  }

  if (library.memberRole !== 'admin' && library.memberRole !== 'owner') {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Esta acción requiere permisos de administrador de biblioteca.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      library,
    },
  });
});

export const libraryAdminProcedure = t.procedure.use(requireLibraryAdmin);
