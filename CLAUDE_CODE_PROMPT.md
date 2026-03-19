# AI Context Document — Alexandria OS

> **Read this before making any changes.** This document is the authoritative quick-reference for AI assistants working on this codebase. For full details, see `README.md`.

---

## What This App Is

Alexandria OS is a **multi-tenant inventory management system for a Spanish second-hand bookshop** that runs on donated books. Volunteers scan ISBN barcodes, decide whether to accept/donate/recycle each book, catalogue accepted books with a physical location code and condition grade, and list them on Spanish marketplaces (Iberlibro, Todocoleccion, Casa del Libro, eBay.es, Wallapop, Vinted).

The app is hosted on the **Manus platform** (managed Node.js + MySQL + S3 + OAuth). All environment variables are injected automatically — never hardcode credentials.

---

## Current State (as of March 2026)

- **343 tests passing** across 39 test files (`pnpm test`)
- **No TypeScript errors** (`pnpm check`)
- Multi-tenant library system fully operational
- All major features implemented (see `todo.md` for pending items)
- Deployed at: `alexdonate-jsmqwhzf.manus.space`

---

## Tech Stack

| Concern | Choice |
|---|---|
| Frontend | React 19 + Tailwind 4 + shadcn/ui + wouter |
| Backend | Express 4 + tRPC 11 + Superjson |
| ORM | Drizzle ORM (mysql2, camelCase columns) |
| Database | MySQL 8.0 / TiDB Serverless |
| Auth | Manus OAuth (session cookie, JWT-signed) |
| LLM | `invokeLLM` from `server/_core/llm.ts` |
| Storage | `storagePut`/`storageGet` from `server/storage.ts` |
| Tests | Vitest (`singleFork: true`, `restoreMocks: true`) |

---

## Procedure Access Tiers

```
publicProcedure          -> anyone
protectedProcedure       -> authenticated user
adminProcedure           -> platform admin (user.role = 'admin')
libraryProcedure         -> authenticated + library member
libraryAdminProcedure    -> authenticated + library admin or owner
```

`libraryProcedure` and `libraryAdminProcedure` are defined in `server/_core/trpc.ts`. They inject `ctx.library` (includes `ctx.library.id` and `ctx.library.memberRole`). **Always use `ctx.library.id` for tenant isolation** — never trust a user-supplied `libraryId` without verifying membership first.

---

## Critical Rules

1. **Never modify `server/_core/`** — framework plumbing managed by the platform.
2. **All queries must be scoped by `libraryId`** — use `libraryProcedure` for inventory/analytics/export.
3. **No raw SQL strings** — use Drizzle `sql` template tag for complex queries.
4. **No `any` types** without explicit justification.
5. **Write tests for every new procedure** in `server/*.test.ts`.
6. **Mock `updateMemberLastActivity` in ALL `vi.mock('./libraryDb', ...)` blocks:**
   ```typescript
   updateMemberLastActivity: vi.fn(() => Promise.resolve(undefined))
   ```
   This is called by `libraryProcedure` middleware on every request.
7. **Run `pnpm db:push` after schema changes** — never edit migration files manually.
8. **Timestamps are UTC** — display with `new Date(ts).toLocaleString()` on frontend.

---

## File Map

| What | Where |
|---|---|
| All tRPC procedures | `server/routers.ts` |
| Library/member/invitation procedures | `server/routers/libraryRouter.ts` |
| Inventory/catalog/analytics DB helpers | `server/db.ts` |
| Library/member/invitation DB helpers | `server/libraryDb.ts` |
| Database schema | `drizzle/schema.ts` |
| Procedure factories + middleware | `server/_core/trpc.ts` |
| LLM helper | `server/_core/llm.ts` |
| S3 storage helper | `server/storage.ts` |
| Price scraper (AI-powered) | `server/priceScraper.ts` |
| ISBNdb integration | `server/isbndbIntegration.ts` |
| Audit log helper | `server/auditLog.ts` |
| Frontend routes | `client/src/App.tsx` |
| Global theme | `client/src/index.css` |
| tRPC client | `client/src/lib/trpc.ts` |
| Library state hook | `client/src/hooks/useLibrary.ts` |
| Shared constants | `shared/const.ts` |

---

## Common Patterns

### New procedure

```typescript
myFeature: router({
  list: libraryProcedure
    .input(z.object({ /* ... */ }))
    .query(async ({ ctx, input }) => {
      return getMyFeatureItems(ctx.library.id, input);
    }),
  create: libraryAdminProcedure
    .input(z.object({ /* ... */ }))
    .mutation(async ({ ctx, input }) => {
      return createMyFeatureItem(ctx.library.id, ctx.user.id, input);
    }),
}),
```

### Frontend query

```typescript
const { data, isLoading } = trpc.myFeature.list.useQuery({});
const utils = trpc.useUtils();
const create = trpc.myFeature.create.useMutation({
  onSuccess: () => utils.myFeature.list.invalidate(),
});
```

### DB helper

```typescript
export async function getMyFeatureItems(libraryId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(myTable).where(eq(myTable.libraryId, libraryId));
}
```

### libraryDb mock in tests

```typescript
vi.mock("./libraryDb", () => ({
  getActiveLibraryForUser: vi.fn(),
  isLibraryMember: vi.fn(),
  updateMemberLastActivity: vi.fn(() => Promise.resolve(undefined)), // REQUIRED
  // add every function used by the procedures under test
}));
```

---

## Pending Work (from `todo.md`)

- Category inference via LLM (taxonomy exists, inference not wired)
- Autocomplete dropdowns for author and publisher search
- Inline book editing modal (`updateBook` procedure exists, UI not built)
- Table column sorting in inventory view
- Dark/light theme toggle

---

## Recent Checkpoints

| Version | Description |
|---|---|
| `b49709a3` | **CURRENT** — Invitation copy button, member activity log, NoLibraryAccess page |
| `59d81c3` | Role-based UI permissions, manual user addition, 343 tests |
| `26b7076` | Multi-tenant library system, full test suite |

Rollback: `webdev_rollback_checkpoint` with version ID, or Rollback button in Manus Management UI.
