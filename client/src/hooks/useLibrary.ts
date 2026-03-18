/**
 * useLibrary — hook for accessing the current user's active library and role.
 *
 * Usage:
 *   const { library, isAdmin, isOwner, isMember, isLoading, hasLibrary } = useLibrary();
 *
 * - `library`   : the active library object (null if not a member of any library)
 * - `isAdmin`   : true if the user has admin or owner role in the library
 * - `isOwner`   : true if the user is the library owner
 * - `isMember`  : true if the user is any kind of member (member, admin, or owner)
 * - `isLoading` : true while the library data is being fetched
 * - `hasLibrary`: true once the library data has loaded and a library exists
 */
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

export function useLibrary() {
  const { data: library, isLoading, error } = trpc.library.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const derived = useMemo(() => {
    const role = library?.memberRole ?? null;
    return {
      library: library ?? null,
      isLoading,
      error,
      hasLibrary: !isLoading && !!library,
      isMember: !!role,
      isAdmin: role === "admin" || role === "owner",
      isOwner: role === "owner",
      memberRole: role,
    };
  }, [library, isLoading, error]);

  return derived;
}
