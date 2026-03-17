/**
 * LibraryManagement.tsx
 * Page for managing the current library: view info, manage members, and create/revoke invitations.
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Building2,
  Users,
  Mail,
  Copy,
  Trash2,
  UserMinus,
  Shield,
  User,
  Crown,
  Plus,
  RefreshCw,
  Link as LinkIcon,
  Clock,
} from "lucide-react";

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
  const { data: invitations = [], isLoading: invitationsLoading } = trpc.library.invitations.list.useQuery(
    { libraryId: library?.id ?? 0 },
    { enabled: !!library?.id && (library?.memberRole === "owner" || library?.memberRole === "admin") }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createInvitationMutation = trpc.library.invitations.create.useMutation({
    onSuccess: () => {
      utils.library.invitations.list.invalidate();
      toast.success("Invitación creada");
      setInviteDialogOpen(false);
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

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const myMembership = members.find((m) => m.userId === user?.id);
  const canManage = myMembership?.role === "owner" || myMembership?.role === "admin";
  const isOwner = myMembership?.role === "owner";

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getInviteLink(code: string) {
    return `${window.location.origin}/join?code=${code}`;
  }

  function copyInviteLink(code: string) {
    navigator.clipboard.writeText(getInviteLink(code));
    toast.success("Enlace copiado al portapapeles");
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

  // ── Render ────────────────────────────────────────────────────────────────
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
      <div className="container py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Sin biblioteca
            </CardTitle>
            <CardDescription>
              No perteneces a ninguna biblioteca todavía. Crea una nueva para empezar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateLibraryCard />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
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
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Invitar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear invitación</DialogTitle>
                  <DialogDescription>
                    Genera un enlace de invitación para que alguien se una a esta biblioteca.
                  </DialogDescription>
                </DialogHeader>
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
                      Si especificas un email, la invitación quedará asociada a esa persona.
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
                        <SelectItem value="admin">Admin</SelectItem>
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
              </DialogContent>
            </Dialog>
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
                        <SelectTrigger className="h-7 w-24 text-xs">
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
                  <div key={inv.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0 flex-1">
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
                      <p className="text-xs text-gray-400 font-mono mt-1 truncate">
                        {getInviteLink(inv.code)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => copyInviteLink(inv.code)}
                        title="Copiar enlace"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: create a new library
// ─────────────────────────────────────────────────────────────────────────────
function CreateLibraryCard() {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = trpc.library.create.useMutation({
    onSuccess: () => {
      utils.library.me.invalidate();
      utils.library.list.invalidate();
      toast.success("Biblioteca creada");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Nombre de la biblioteca</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mi Biblioteca"
        />
      </div>
      <div className="space-y-1">
        <Label>Descripción (opcional)</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción breve"
        />
      </div>
      <Button
        className="w-full"
        onClick={() => createMutation.mutate({ name, description: description || undefined })}
        disabled={!name.trim() || createMutation.isPending}
      >
        {createMutation.isPending ? "Creando..." : "Crear biblioteca"}
      </Button>
    </div>
  );
}
