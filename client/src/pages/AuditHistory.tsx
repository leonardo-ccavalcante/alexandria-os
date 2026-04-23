/**
 * AuditHistory.tsx
 *
 * Displays completed and abandoned shelf audit sessions for the current library.
 * Shows operator name, location, date/time, and confirmation counts.
 * Accessible at /auditoria/historial — linked from the ShelfAudit page.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  MapPin,
  User,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { Link } from 'wouter';

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1 w-fit">
        <CheckCircle2 className="h-3 w-3" />
        Completada
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-100 text-gray-600 border-gray-200 flex items-center gap-1 w-fit">
      <XCircle className="h-3 w-3" />
      Abandonada
    </Badge>
  );
}

function ConfirmationBar({ confirmed, expected }: { confirmed: number; expected: number }) {
  const pct = expected === 0 ? 0 : Math.round((confirmed / expected) * 100);
  const color = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{confirmed}/{expected} confirmados</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AuditHistory() {
  const [page, setPage] = useState(0);
  const { data: sessions, isLoading, isFetching } = trpc.shelfAudit.getAuditHistory.useQuery(
    { page, pageSize: PAGE_SIZE }
  );

  const hasMore = (sessions?.length ?? 0) === PAGE_SIZE;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/auditoria">
          <Button variant="ghost" size="sm" className="gap-1 text-gray-500">
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Historial de Auditorías
          </h1>
          <p className="text-sm text-gray-500">Sesiones completadas y abandonadas de esta biblioteca</p>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : sessions?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <BookOpen className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-gray-500 font-medium">Sin historial aún</p>
            <p className="text-sm text-gray-400">
              Las auditorías completadas aparecerán aquí.
            </p>
            <Link href="/auditoria">
              <Button variant="outline" size="sm" className="mt-2">
                Iniciar auditoría
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {isFetching && !isLoading && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
          {sessions?.map((session) => (
            <Card key={session.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
                      Ubicación <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">{session.locationCode}</code>
                    </CardTitle>
                    <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {session.operatorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(session.startedAt).toLocaleString()}
                      </span>
                      {session.completedAt && (
                        <span className="text-gray-400">
                          → {new Date(session.completedAt).toLocaleString()}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <StatusBadge status={session.status} />
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <ConfirmationBar confirmed={session.confirmedCount} expected={session.expectedCount} />
                {session.missingCount > 0 && (
                  <p className="text-xs text-red-600">
                    {session.missingCount} libro{session.missingCount !== 1 ? 's' : ''} no encontrado{session.missingCount !== 1 ? 's' : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span className="text-sm text-gray-500">Página {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || isFetching}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
