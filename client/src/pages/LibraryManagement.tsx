/**
 * LibraryManagement.tsx
 *
 * Full library administration page. Accessible to all members, but admin/owner
 * controls are gated by role. Features:
 *  - Library info card with edit (admin/owner)
 *  - Member list with role badges, role change (owner), and remove (admin/owner)
 *  - Manual user addition by searching registered users (admin/owner)
 *  - Invitation link creation and management with one-click copy (admin/owner)
 *  - Member activity audit log showing join method, who added them, last activity (admin/owner)
 *  - Access denied screen for non-members
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Building2,
  Users,
  Mail,
  Copy,
  Check,
  Trash2,
  UserMinus,
  Shield,
  User,
  Crown,
  Plus,
  RefreshCw,
  Link as LinkIcon,
  Clock,
  UserPlus,
  Search,
  Loader2,
  Lock,
  AlertTriangle,
  Activity,
  LogIn,
  HandshakeIcon,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

// ─────────────────────────────────────────────────────────────────────────────
// Role badge helper
// ─────────────────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  if (role === "owner") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
        <Crown className="h-3 w-3" /> Propietario
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1">
        <Shield className="h-3 w-3" /> Admin
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <User className="h-3 w-3" /> Miembro
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Join method badge helper
// ─────────────────────────────────────────────────────────────────────────────
function JoinMethodBadge({ method }: { method: string | null }) {
  if (method === "invitation") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-green-200 text-green-700 bg-green-50">
        <LinkIcon className="h-3 w-3" /> Invitación
      </Badge>
    );
  }
  if (method === "manual") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-blue-200 text-blue-700 bg-blue-50">
        <UserPlus className="h-3 w-3" /> Manual
      </Badge>
    );
  }
  if (method === "auto") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-gray-200 text-gray-600 bg-gray-50">
        <LogIn className="h-3 w-3" /> Auto
      </Badge>
    );
  }
  if (method === "owner") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-amber-200 text-amber-700 bg-amber-50">
        <Crown className="h-3 w-3" /> Fundador
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-gray-400">
      —
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Ahora mismo";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function formatAbsoluteDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy button with visual feedback
// ─────────────────────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Enlace copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={`gap-1.5 transition-colors ${copied ? "border-green-400 text-green-700 bg-green-50" : ""}`}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "¡Copiado!" : label}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function LibraryManagement() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── Library data ──────────────────────────────────────────────────────────
  const { data: library, isLoading: libraryLoading } = trpc.library.me.useQuery();

  // ── Members ───────────────────────────────────────────────────────────────
  const { data: members = [], isLoading: membersLoading } = trpc.library.getMembers.useQuery(
    { libraryId: library?.id ?? 0 },
    { enabled: !!library?.id }
  );

  // ── Invitations ───────────────────────────────────────────────────────────
  const canManage = library?.memberRole === "owner" || library?.memberRole === "admin";
  const isOwner = library?.memberRole === "owner";

  const { data: invitations = [], isLoading: invitationsLoading } = trpc.library.invitations.list.useQuery(
    { libraryId: library?.id ?? 0 },
    { enabled: !!library?.id && canManage }
  );

  // ── Activity log ──────────────────────────────────────────────────────────
  const [showActivityLog, setShowActivityLog] = useState(false);
  const { data: activityLog = [], isLoading: activityLoading } = trpc.library.getMemberActivityLog.useQuery(
    { libraryId: library?.id ?? 0 },
    { enabled: !!library?.id && canManage && showActivityLog }
  );

  // ── User search (for manual add) ──────────────────────────────────────────
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [addUserRole, setAddUserRole] = useState<"admin" | "member">("member");
  const debouncedSearch = useDebounce(userSearchQuery, 400);

  const { data: userSearchResults = [], isFetching: searchFetching } = trpc.library.searchUsers.useQuery(
    { libraryId: library?.id ?? 0, query: debouncedSearch },
    { enabled: !!library?.id && canManage && debouncedSearch.length >= 2 }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMemberDirectlyMutation = trpc.library.addMemberDirectly.useMutation({
    onSuccess: (data) => {
      utils.library.getMembers.invalidate();
      utils.library.getMemberActivityLog.invalidate();
      toast.success(`${data.user.name ?? "Usuario"} añadido como ${data.role === "admin" ? "administrador" : "miembro"}`);
      setAddUserOpen(false);
      setUserSearchQuery("");
    },
    onError: (err) => toast.error(err.message),
  });

  const createInvitationMutation = trpc.library.invitations.create.useMutation({
    onSuccess: (inv) => {
      utils.library.invitations.list.invalidate();
      const url = `${window.location.origin}/join?code=${inv.code}`;
      setCreatedInviteUrl(url);
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeInvitationMutation = trpc.library.invitations.revoke.useMutation({
    onSuccess: () => {
      utils.library.invitations.list.invalidate();
      toast.success("Invitación revocada");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMemberMutation = trpc.library.removeMember.useMutation({
    onSuccess: () => {
      utils.library.getMembers.invalidate();
      utils.library.getMemberActivityLog.invalidate();
      toast.success("Miembro eliminado");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRoleMutation = trpc.library.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.library.getMembers.invalidate();
      toast.success("Rol actualizado");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateLibraryMutation = trpc.library.update.useMutation({
    onSuccess: () => {
      utils.library.me.invalidate();
      toast.success("Biblioteca actualizada");
      setEditDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Local state ───────────────────────────────────────────────────────────
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviteExpiry, setInviteExpiry] = useState(7);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getInviteLink(code: string) {
    return `${window.location.origin}/join?code=${code}`;
  }

  function formatExpiry(date: Date | string) {
    const d = new Date(date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Expirado";
    if (diffDays === 1) return "Expira mañana";
    return `Expira en ${diffDays} días`;
  }

  // ── Loading / no-library states ────────────────────────────────────────────
  if (libraryLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando biblioteca...
        </div>
      </div>
    );
  }

  if (!library) {
    return (
      <div className="container py-16 max-w-lg mx-auto text-center">
        <div className="p-4 bg-amber-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
          <Lock className="h-10 w-10 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Sin acceso a biblioteca</h2>
        <p className="text-gray-500 mb-6">
          No perteneces a ninguna biblioteca. Necesitas una invitación de un administrador para acceder.
        </p>
        <p className="text-sm text-gray-400">
          Si tienes un enlace de invitación, ábrelo para unirte.
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="container py-6 space-y-6 max-w-4xl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            {library.name}
          </h1>
          {library.description && (
            <p className="text-gray-500 mt-1">{library.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <RoleBadge role={library.memberRole} />
            <span className="text-xs text-gray-400">
              {members.length} miembro{members.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {canManage && (
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditName(library.name);
                  setEditDescription(library.description ?? "");
                }}
              >
                Editar biblioteca
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar biblioteca</DialogTitle>
                <DialogDescription>
                  Actualiza el nombre y descripción de tu biblioteca.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nombre de la biblioteca"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Descripción (opcional)</Label>
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Descripción breve"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() =>
                    updateLibraryMutation.mutate({
                      libraryId: library.id,
                      name: editName || undefined,
                      description: editDescription || undefined,
                    })
                  }
                  disabled={updateLibraryMutation.isPending}
                >
                  {updateLibraryMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Access notice for non-admin members ─────────────────────────────── */}
      {!canManage && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-5">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Acceso de solo lectura</p>
              <p className="text-sm text-amber-700 mt-1">
                Eres miembro de esta biblioteca. Solo los administradores y el propietario pueden añadir usuarios, crear invitaciones o modificar la configuración.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Members ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Miembros
            </CardTitle>
            <CardDescription>Personas con acceso a esta biblioteca</CardDescription>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {/* Manual add user button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => { setAddUserOpen(true); setUserSearchQuery(""); }}
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Añadir usuario</span>
              </Button>

              {/* Invite link button */}
              <Dialog
                open={inviteDialogOpen}
                onOpenChange={(o) => {
                  setInviteDialogOpen(o);
                  if (!o) { setCreatedInviteUrl(null); setInviteEmail(""); }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <LinkIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Crear invitación</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear enlace de invitación</DialogTitle>
                    <DialogDescription>
                      Genera un enlace de un solo uso para que alguien se una a esta biblioteca.
                    </DialogDescription>
                  </DialogHeader>

                  {createdInviteUrl ? (
                    <div className="space-y-4 py-2">
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-800 font-medium">Invitación creada con éxito</span>
                      </div>
                      <div className="space-y-2">
                        <Label>Enlace de invitación</Label>
                        <div className="flex gap-2">
                          <Input value={createdInviteUrl} readOnly className="font-mono text-xs" />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(createdInviteUrl);
                              toast.success("Enlace copiado");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">Comparte este enlace por WhatsApp, email o cualquier otro canal.</p>
                      </div>
                      {/* Large copy button for easy sharing */}
                      <CopyButton text={createdInviteUrl} label="Copiar enlace para compartir" />
                      <DialogFooter>
                        <Button onClick={() => { setInviteDialogOpen(false); setCreatedInviteUrl(null); setInviteEmail(""); }}>
                          Cerrar
                        </Button>
                      </DialogFooter>
                    </div>
                  ) : (
                    <div className="space-y-4 py-2">
                      <div className="space-y-1">
                        <Label>Email (opcional)</Label>
                        <Input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="correo@ejemplo.com"
                        />
                        <p className="text-xs text-gray-500">
                          Si especificas un email, solo ese usuario podrá usar el enlace.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label>Rol</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={(v) => setInviteRole(v as "member" | "admin")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Miembro</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Expira en</Label>
                        <Select
                          value={String(inviteExpiry)}
                          onValueChange={(v) => setInviteExpiry(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 día</SelectItem>
                            <SelectItem value="3">3 días</SelectItem>
                            <SelectItem value="7">7 días</SelectItem>
                            <SelectItem value="14">14 días</SelectItem>
                            <SelectItem value="30">30 días</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={() =>
                            createInvitationMutation.mutate({
                              libraryId: library.id,
                              email: inviteEmail || undefined,
                              role: inviteRole,
                              expiresInDays: inviteExpiry,
                            })
                          }
                          disabled={createInvitationMutation.isPending}
                        >
                          {createInvitationMutation.isPending ? "Creando..." : "Crear invitación"}
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
              <RefreshCw className="h-3 w-3 animate-spin" /> Cargando...
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">No hay miembros.</p>
          ) : (
            <div className="divide-y">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {member.userName ?? `Usuario #${member.userId}`}
                      {member.userId === user?.id && (
                        <span className="ml-2 text-xs text-gray-400">(tú)</span>
                      )}
                    </p>
                    {member.userEmail && (
                      <p className="text-xs text-gray-400">{member.userEmail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={member.role} />

                    {/* Role change (owner only, not for owner themselves) */}
                    {isOwner && member.role !== "owner" && member.userId !== user?.id && (
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          updateRoleMutation.mutate({
                            libraryId: library.id,
                            userId: member.userId,
                            role: v as "admin" | "member",
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Miembro</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* Remove member (admin+, not owner, not self) */}
                    {canManage && member.role !== "owner" && member.userId !== user?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700">
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar miembro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {member.userName ?? `Usuario #${member.userId}`} perderá acceso a esta biblioteca.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() =>
                                removeMemberMutation.mutate({
                                  libraryId: library.id,
                                  userId: member.userId,
                                })
                              }
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Invitations ── */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              Invitaciones activas
            </CardTitle>
            <CardDescription>
              Estos enlaces permiten unirse a la biblioteca. Revócalos si ya no son necesarios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitationsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                <RefreshCw className="h-3 w-3 animate-spin" /> Cargando...
              </div>
            ) : invitations.length === 0 ? (
              <p className="text-sm text-gray-400">No hay invitaciones activas.</p>
            ) : (
              <div className="divide-y">
                {invitations.map((inv) => (
                  <div key={inv.id} className="py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <RoleBadge role={inv.role} />
                        {inv.email && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {inv.email}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatExpiry(inv.expiresAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700"
                              title="Revocar invitación"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Revocar invitación?</AlertDialogTitle>
                              <AlertDialogDescription>
                                El enlace dejará de funcionar inmediatamente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() =>
                                  revokeInvitationMutation.mutate({
                                    libraryId: library.id,
                                    invitationId: inv.id,
                                  })
                                }
                              >
                                Revocar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {/* Invitation link row with prominent copy button */}
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 font-mono flex-1 truncate min-w-0">
                        {getInviteLink(inv.code)}
                      </p>
                      <CopyButton text={getInviteLink(inv.code)} label="Copiar" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Member Activity Log ── */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  Registro de actividad
                </CardTitle>
                <CardDescription>
                  Historial de incorporaciones y actividad reciente de los miembros
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowActivityLog(!showActivityLog)}
              >
                {showActivityLog ? "Ocultar" : "Ver registro"}
              </Button>
            </div>
          </CardHeader>

          {showActivityLog && (
            <CardContent>
              {activityLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Cargando registro...
                </div>
              ) : activityLog.length === 0 ? (
                <p className="text-sm text-gray-400">No hay datos de actividad.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left pb-2 pr-4">Miembro</th>
                        <th className="text-left pb-2 pr-4">Rol</th>
                        <th className="text-left pb-2 pr-4">Cómo se unió</th>
                        <th className="text-left pb-2 pr-4">Añadido por</th>
                        <th className="text-left pb-2 pr-4">Fecha de unión</th>
                        <th className="text-left pb-2">Última actividad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {activityLog.map((entry) => (
                        <tr key={entry.userId} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4">
                            <div>
                              <p className="font-medium text-gray-900">
                                {entry.userName ?? `Usuario #${entry.userId}`}
                                {entry.userId === user?.id && (
                                  <span className="ml-1.5 text-xs text-gray-400">(tú)</span>
                                )}
                              </p>
                              {entry.userEmail && (
                                <p className="text-xs text-gray-400">{entry.userEmail}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4">
                            <RoleBadge role={entry.role} />
                          </td>
                          <td className="py-2.5 pr-4">
                            <JoinMethodBadge method={entry.joinedVia} />
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className="text-xs text-gray-600">
                              {entry.addedByName ?? (entry.joinedVia === "invitation" ? "Enlace" : "—")}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4">
                            <span
                              className="text-xs text-gray-500"
                              title={formatAbsoluteDate(entry.joinedAt)}
                            >
                              {formatRelativeDate(entry.joinedAt)}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span
                              className="text-xs text-gray-500"
                              title={formatAbsoluteDate(entry.lastActivityAt)}
                            >
                              {formatRelativeDate(entry.lastActivityAt)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Manual Add User Dialog                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={addUserOpen}
        onOpenChange={(o) => {
          setAddUserOpen(o);
          if (!o) setUserSearchQuery("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Añadir usuario directamente
            </DialogTitle>
            <DialogDescription>
              Busca un usuario registrado en el sistema y añádelo a la biblioteca sin necesidad de invitación. El usuario debe haber iniciado sesión al menos una vez.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Role selector */}
            <div className="space-y-1">
              <Label>Rol a asignar</Label>
              <Select value={addUserRole} onValueChange={(v) => setAddUserRole(v as "admin" | "member")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" /> Miembro
                    </span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Administrador
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search input */}
            <div className="space-y-1">
              <Label>Buscar usuario</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Nombre, email o ID de usuario..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Search results */}
            {debouncedSearch.length >= 2 && (
              <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
                {searchFetching ? (
                  <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Buscando...</span>
                  </div>
                ) : userSearchResults.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400">
                    No se encontraron usuarios disponibles
                  </div>
                ) : (
                  userSearchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left disabled:opacity-50"
                      onClick={() => {
                        if (!library) return;
                        addMemberDirectlyMutation.mutate({
                          libraryId: library.id,
                          userId: u.id,
                          role: addUserRole,
                        });
                      }}
                      disabled={addMemberDirectlyMutation.isPending}
                    >
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.name ?? "Sin nombre"}</p>
                        {u.email && <p className="text-xs text-gray-500 truncate">{u.email}</p>}
                      </div>
                      {addMemberDirectlyMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {debouncedSearch.length > 0 && debouncedSearch.length < 2 && (
              <p className="text-xs text-gray-400 text-center">Escribe al menos 2 caracteres para buscar</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddUserOpen(false); setUserSearchQuery(""); }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
