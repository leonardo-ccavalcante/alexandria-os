/**
 * NoLibraryAccess.tsx
 *
 * Landing page shown to authenticated users who do not belong to any library.
 * Provides:
 *  - Clear explanation of the situation
 *  - Input field to paste an invitation code or full link
 *  - Button to join via code
 *  - Contact/help text
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  BookOpen,
  Link as LinkIcon,
  LogOut,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract a UUID from a full invite URL or return the raw string if it looks like a UUID already. */
function extractCode(input: string): string {
  const trimmed = input.trim();
  // Try to extract from URL query param ?code=<uuid>
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (code) return code.trim();
  } catch {
    // Not a valid URL — treat as raw code
  }
  return trimmed;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function NoLibraryAccess() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [codeInput, setCodeInput] = useState("");
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const code = extractCode(codeInput);
  const isValidCode = UUID_REGEX.test(code);

  // Validate invite code (shows library name before joining)
  const { data: validation, isLoading: validating } = trpc.library.invitations.validate.useQuery(
    { code },
    { enabled: isValidCode }
  );

  // Accept invitation mutation
  const acceptMutation = trpc.library.invitations.accept.useMutation({
    onSuccess: (data) => {
      setJoined(true);
      utils.library.me.invalidate();
      utils.library.list.invalidate();
      toast.success(`¡Bienvenido a "${data.library.name}"!`);
      // Navigate to home after a short delay
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (err) => {
      setJoinError(err.message);
    },
  });

  function handleJoin() {
    if (!isValidCode) return;
    setJoinError(null);
    acceptMutation.mutate({ code });
  }

  // ── Joined successfully ────────────────────────────────────────────────────
  if (joined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-green-700">¡Bienvenido!</CardTitle>
            <CardDescription>
              Te has unido a <strong>{validation?.library?.name}</strong> correctamente.
              Redirigiendo al inicio...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <BookOpen className="h-8 w-8 text-blue-600" />
          <span className="text-2xl font-bold text-blue-700">Alexandria OS</span>
        </div>
        <p className="text-gray-500 text-sm">Sistema de gestión de inventario para librerías</p>
      </div>

      <div className="w-full max-w-md space-y-4">
        {/* Main card */}
        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4">
            <div className="mx-auto w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-3">
              <Building2 className="h-7 w-7 text-amber-600" />
            </div>
            <CardTitle className="text-center text-gray-900">Sin acceso a biblioteca</CardTitle>
            <CardDescription className="text-center">
              Hola, <strong>{user?.name ?? "usuario"}</strong>. Tu cuenta está activa pero aún no
              perteneces a ninguna biblioteca.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Para acceder al inventario necesitas unirte a una biblioteca. Pide al administrador
                que te envíe un enlace de invitación.
              </p>
            </div>

            {/* Code input */}
            <div className="space-y-2">
              <Label htmlFor="invite-code" className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" />
                Código o enlace de invitación
              </Label>
              <Input
                id="invite-code"
                placeholder="Pega aquí el enlace o código de invitación..."
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setJoinError(null);
                }}
                className={
                  codeInput.length > 0 && !isValidCode
                    ? "border-red-300 focus-visible:ring-red-400"
                    : isValidCode && validation?.valid
                    ? "border-green-300 focus-visible:ring-green-400"
                    : ""
                }
              />

              {/* Validation feedback */}
              {codeInput.length > 0 && !isValidCode && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Código no válido. Asegúrate de pegar el enlace completo.
                </p>
              )}

              {isValidCode && validating && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Verificando invitación...
                </p>
              )}

              {isValidCode && !validating && validation?.valid && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Invitación válida para{" "}
                    <strong>{validation.library?.name ?? "una biblioteca"}</strong>
                    {validation.role && ` — rol: ${validation.role === "admin" ? "administrador" : "miembro"}`}
                  </span>
                </div>
              )}

              {isValidCode && !validating && validation && !validation.valid && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Esta invitación ha expirado o ya fue utilizada.
                </p>
              )}

              {joinError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {joinError}
                </p>
              )}
            </div>

            {/* Join button */}
            <Button
              className="w-full"
              disabled={!isValidCode || !validation?.valid || acceptMutation.isPending}
              onClick={handleJoin}
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Uniéndome...
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 mr-2" />
                  Unirme a la biblioteca
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Help card */}
        <Card className="border-dashed border-gray-200 bg-white/60">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 text-center">
              ¿No tienes un enlace de invitación? Contacta al administrador de tu biblioteca y
              pídele que genere uno desde la sección{" "}
              <span className="font-medium text-gray-700">Biblioteca → Crear invitación</span>.
            </p>
          </CardContent>
        </Card>

        {/* Logout option */}
        <div className="text-center">
          <button
            onClick={() => logout()}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mx-auto transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Cerrar sesión ({user?.email ?? user?.name})
          </button>
        </div>
      </div>
    </div>
  );
}
