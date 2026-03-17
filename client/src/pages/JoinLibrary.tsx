/**
 * JoinLibrary.tsx
 * Page that handles invitation links: /join?code=<uuid>
 * - If the user is not logged in, shows the library info and prompts login.
 * - If the user is logged in, accepts the invitation automatically.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle, XCircle, Loader2, LogIn } from "lucide-react";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

export default function JoinLibrary() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();

  // Extract invite code from query string
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") ?? "";

  // Validate the invite (public — works before login)
  const { data: validation, isLoading: validating } = trpc.library.invitations.validate.useQuery(
    { code },
    { enabled: !!code }
  );

  // Accept mutation (requires auth)
  const utils = trpc.useUtils();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = trpc.library.invitations.accept.useMutation({
    onSuccess: (data) => {
      setAccepted(true);
      utils.library.me.invalidate();
      utils.library.list.invalidate();
      toast.success(`Te has unido a "${data.library.name}"`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Auto-accept once we know the user is logged in and the invite is valid
  useEffect(() => {
    if (!authLoading && isAuthenticated && validation?.valid && !accepted && !acceptMutation.isPending && !error) {
      acceptMutation.mutate({ code });
    }
  }, [authLoading, isAuthenticated, validation?.valid, accepted, acceptMutation.isPending, error]);

  // ── No code provided ──────────────────────────────────────────────────────
  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Enlace inválido
            </CardTitle>
            <CardDescription>
              Este enlace de invitación no contiene un código válido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Ir al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (validating || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verificando invitación...
        </div>
      </div>
    );
  }

  // ── Invalid / expired invite ──────────────────────────────────────────────
  if (!validation?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Invitación no válida
            </CardTitle>
            <CardDescription>
              Este enlace de invitación ha expirado o ya ha sido utilizado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Ir al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Accepted ──────────────────────────────────────────────────────────────
  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              ¡Bienvenido!
            </CardTitle>
            <CardDescription>
              Te has unido a <strong>{validation.library?.name}</strong> correctamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/")}>
              Ir al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error accepting ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Error al unirse
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Ir al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Not logged in — show library preview + login prompt ───────────────────
  if (!isAuthenticated) {
    const loginUrl = getLoginUrl();
    // Append redirect back to this page after login
    const redirectUrl = `${loginUrl}&redirect=${encodeURIComponent(window.location.href)}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Invitación a biblioteca
            </CardTitle>
            <CardDescription>
              Has sido invitado a unirte a{" "}
              <strong>{validation.library?.name ?? "una biblioteca"}</strong>.
              {validation.library?.description && (
                <span className="block mt-1 text-gray-500">{validation.library.description}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
              Inicia sesión para aceptar la invitación y acceder a la biblioteca.
            </div>
            <Button className="w-full gap-2" asChild>
              <a href={redirectUrl}>
                <LogIn className="h-4 w-4" />
                Iniciar sesión
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Logged in, processing ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Uniéndote a la biblioteca...
      </div>
    </div>
  );
}
