/**
 * ShelfAudit.tsx
 *
 * Shelf Audit wizard — three-step flow:
 *   1. Initiate: enter a location code to start (or resume) an audit session.
 *   2. Scan: scan ISBNs via camera or manual entry; resolve location conflicts inline.
 *   3. Complete: review the summary and finish the session.
 *
 * All tRPC calls go through the shelfAudit sub-router.
 */
import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ClipboardList,
  ClipboardCheck,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  MapPin,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Camera,
  Keyboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/BarcodeScanner';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConflictItem = {
  uuid: string;
  fromLocation: string;
  resolution: 'moved' | 'kept' | 'skipped' | null;
};

type ScanOutcome =
  | { outcome: 'confirmed'; statusWarning: string | null }
  | { outcome: 'conflict'; fromLocation: string | null }
  | { outcome: 'not_found' }
  | { outcome: 'catalog_only' };

type AuditSession = {
  id: string;
  libraryId: number;
  locationCode: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  startedBy: number;
  startedAt: Date;
  completedAt: Date | null;
  expectedItemUuids: string[];
  confirmedItemUuids: string[];
  conflictItems: ConflictItem[];
  photoAnalysisResult: unknown;
};

// ─── Step 1: Initiate ─────────────────────────────────────────────────────────

function InitiateStep({ onStarted }: { onStarted: (session: AuditSession) => void }) {
  const [locationCode, setLocationCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: existing, isLoading: loadingExisting } = trpc.shelfAudit.getActiveAuditSession.useQuery();
  const initiateMutation = trpc.shelfAudit.initiateShelfAudit.useMutation({
    onSuccess: (session) => {
      toast.success(`Auditoría iniciada para ubicación ${session.locationCode}`);
      onStarted(session as AuditSession);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = locationCode.toUpperCase().trim();
    if (!/^[0-9]{2}[A-Z]$/.test(code)) {
      toast.error('Formato inválido. Usa el formato 01A (dos dígitos + una letra).');
      return;
    }
    initiateMutation.mutate({ locationCode: code });
  };

  const handleResume = () => {
    if (existing) onStarted(existing as AuditSession);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-2">
          <ClipboardList className="h-7 w-7 text-blue-600" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Auditoría de Estante</h1>
        <p className="text-gray-500 text-sm">
          Verifica físicamente los libros en una ubicación y detecta discrepancias con el inventario.
        </p>
      </div>

      {/* Resume existing session */}
      {loadingExisting ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : existing ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-800 text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Auditoría activa encontrada
            </CardTitle>
            <CardDescription className="text-amber-700">
              Ubicación <strong>{existing.locationCode}</strong> — iniciada{' '}
              {new Date(existing.startedAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex gap-2">
            <Button size="sm" onClick={handleResume} className="bg-amber-600 hover:bg-amber-700 text-white">
              Continuar auditoría
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Start new session */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva auditoría</CardTitle>
          <CardDescription>
            Ingresa el código de ubicación a auditar (ej. <code className="bg-gray-100 px-1 rounded">01A</code>).
            Si hay una sesión activa para otra ubicación, será abandonada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              placeholder="01A"
              maxLength={3}
              className="font-mono text-lg tracking-widest w-28 text-center"
              disabled={initiateMutation.isPending}
            />
            <Button type="submit" disabled={initiateMutation.isPending || !locationCode}>
              {initiateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Iniciar <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="text-xs text-gray-400 space-y-1">
        <p>• El sistema cargará todos los ítems registrados en esa ubicación como «esperados».</p>
        <p>• Escanea cada libro físico para confirmar su presencia.</p>
        <p>• Los ítems no escaneados quedarán marcados como <strong>MISSING</strong> al completar.</p>
      </div>
    </div>
  );
}

// ─── Conflict resolver inline card ────────────────────────────────────────────

function ConflictCard({
  conflict,
  sessionId,
  sessionLocation,
  onResolved,
}: {
  conflict: ConflictItem;
  sessionId: string;
  sessionLocation: string;
  onResolved: () => void;
}) {
  const [targetLocation, setTargetLocation] = useState('');
  const resolveMutation = trpc.shelfAudit.resolveLocationConflict.useMutation({
    onSuccess: () => {
      toast.success('Conflicto resuelto');
      onResolved();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolve = (resolution: 'moved' | 'kept' | 'skipped', target?: string) => {
    resolveMutation.mutate({
      sessionId,
      itemUuid: conflict.uuid,
      resolution,
      targetLocation: target,
    });
  };

  if (conflict.resolution !== null) {
    const labels: Record<string, string> = { moved: 'Movido', kept: 'Mantenido', skipped: 'Omitido' };
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="font-mono text-xs">{conflict.uuid.slice(0, 8)}…</span>
        <Badge variant="outline" className="text-xs">{labels[conflict.resolution]}</Badge>
      </div>
    );
  }

  return (
    <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-amber-800 font-medium">Conflicto de ubicación</span>
        <span className="text-amber-600 text-xs ml-auto">
          Registrado en <strong>{conflict.fromLocation || '—'}</strong>, escaneado en <strong>{sessionLocation}</strong>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          disabled={resolveMutation.isPending}
          onClick={() => resolve('kept')}
        >
          Mantener en {conflict.fromLocation || '—'}
        </Button>
        <div className="flex gap-1">
          <Input
            placeholder={sessionLocation}
            value={targetLocation}
            onChange={(e) => setTargetLocation(e.target.value.toUpperCase())}
            maxLength={3}
            className="font-mono text-xs w-16 h-8 text-center"
          />
          <Button
            size="sm"
            className="text-xs h-8"
            disabled={resolveMutation.isPending || !targetLocation}
            onClick={() => resolve('moved', targetLocation)}
          >
            Mover
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-gray-500"
          disabled={resolveMutation.isPending}
          onClick={() => resolve('skipped')}
        >
          Omitir
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Scan ─────────────────────────────────────────────────────────────

function ScanStep({
  session,
  onComplete,
  onRefresh,
}: {
  session: AuditSession;
  onComplete: () => void;
  onRefresh: () => void;
}) {
  const [manualIsbn, setManualIsbn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('manual');
  const [lastOutcome, setLastOutcome] = useState<ScanOutcome | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const scanMutation = trpc.shelfAudit.addManualScanResult.useMutation({
    onSuccess: (result) => {
      setLastOutcome(result as ScanOutcome);
      setManualIsbn('');
      onRefresh();
      if (result.outcome === 'confirmed') {
        toast.success('✓ Confirmado');
      } else if (result.outcome === 'conflict') {
        toast.warning('Conflicto de ubicación detectado');
      } else if (result.outcome === 'catalog_only') {
        toast.info('Libro en catálogo pero sin ítem de inventario');
      } else {
        toast.error('ISBN no encontrado en el inventario');
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onError: (err) => {
      toast.error(err.message);
      setManualIsbn('');
    },
  });

  const handleScan = (isbn: string) => {
    if (!isbn.trim()) return;
    scanMutation.mutate({ sessionId: session.id, isbn: isbn.trim() });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualIsbn.trim()) handleScan(manualIsbn.trim());
  };

  const confirmed = session.confirmedItemUuids.length;
  const expected = session.expectedItemUuids.length;
  const conflicts = (session.conflictItems as ConflictItem[]).filter(c => c.resolution === null);
  const progress = expected > 0 ? Math.round((confirmed / expected) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Auditoría — Ubicación <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{session.locationCode}</code>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {confirmed} de {expected} ítems confirmados
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onComplete} className="text-xs">
          <ClipboardCheck className="h-4 w-4 mr-1" />
          Completar
        </Button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-green-700">{confirmed}</div>
          <div className="text-xs text-green-600">Confirmados</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-amber-700">{conflicts.length}</div>
          <div className="text-xs text-amber-600">Conflictos</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-700">{expected - confirmed}</div>
          <div className="text-xs text-gray-600">Pendientes</div>
        </div>
      </div>

      {/* Last scan outcome */}
      {lastOutcome && (
        <div className={`rounded-lg p-3 flex items-center gap-2 text-sm ${
          lastOutcome.outcome === 'confirmed' ? 'bg-green-50 text-green-800' :
          lastOutcome.outcome === 'conflict' ? 'bg-amber-50 text-amber-800' :
          'bg-red-50 text-red-800'
        }`}>
          {lastOutcome.outcome === 'confirmed' ? <CheckCircle2 className="h-4 w-4" /> :
           lastOutcome.outcome === 'conflict' ? <AlertTriangle className="h-4 w-4" /> :
           <XCircle className="h-4 w-4" />}
          {lastOutcome.outcome === 'confirmed' && (
            <span>
              Ítem confirmado en esta ubicación.
              {lastOutcome.statusWarning && (
                <span className="ml-1 text-amber-700">Estado: {lastOutcome.statusWarning}</span>
              )}
            </span>
          )}
          {lastOutcome.outcome === 'conflict' && (
            <span>Ítem registrado en <strong>{(lastOutcome as { outcome: 'conflict'; fromLocation: string | null }).fromLocation || '—'}</strong>. Resuélvelo abajo.</span>
          )}
          {lastOutcome.outcome === 'not_found' && <span>ISBN no encontrado en el inventario.</span>}
          {lastOutcome.outcome === 'catalog_only' && <span>Libro en catálogo pero sin ítem de inventario activo.</span>}
        </div>
      )}

      {/* Scan input */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Escanear ISBN
            </CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={inputMode === 'manual' ? 'default' : 'outline'}
                className="text-xs h-7"
                onClick={() => { setInputMode('manual'); setIsScanning(false); }}
              >
                <Keyboard className="h-3 w-3 mr-1" /> Manual
              </Button>
              <Button
                size="sm"
                variant={inputMode === 'camera' ? 'default' : 'outline'}
                className="text-xs h-7"
                onClick={() => { setInputMode('camera'); }}
              >
                <Camera className="h-3 w-3 mr-1" /> Cámara
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {inputMode === 'manual' ? (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value)}
                placeholder="9780000000000"
                className="font-mono"
                disabled={scanMutation.isPending}
                autoFocus
              />
              <Button type="submit" disabled={scanMutation.isPending || !manualIsbn.trim()}>
                {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Escanear'}
              </Button>
            </form>
          ) : (
            <BarcodeScanner
              onScan={(isbn) => { handleScan(isbn); setIsScanning(false); }}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
            />
          )}
        </CardContent>
      </Card>

      {/* Pending conflicts */}
      {conflicts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-800 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            Conflictos pendientes ({conflicts.length})
          </h3>
          {conflicts.map((c) => (
            <ConflictCard
              key={c.uuid}
              conflict={c}
              sessionId={session.id}
              sessionLocation={session.locationCode}
              onResolved={onRefresh}
            />
          ))}
        </div>
      )}

      {/* Resolved conflicts */}
      {(session.conflictItems as ConflictItem[]).filter(c => c.resolution !== null).length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-gray-500">Conflictos resueltos</h3>
          {(session.conflictItems as ConflictItem[])
            .filter(c => c.resolution !== null)
            .map(c => (
              <ConflictCard
                key={c.uuid}
                conflict={c}
                sessionId={session.id}
                sessionLocation={session.locationCode}
                onResolved={onRefresh}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Complete ─────────────────────────────────────────────────────────

function CompleteStep({
  session,
  onNewAudit,
}: {
  session: AuditSession;
  onNewAudit: () => void;
}) {
  const [summary, setSummary] = useState<{ confirmed: number; missing: number; relocated: number; skipped: number } | null>(null);
  const completeMutation = trpc.shelfAudit.completeShelfAudit.useMutation({
    onSuccess: (result) => {
      setSummary(result);
      toast.success('Auditoría completada');
    },
    onError: (err) => toast.error(err.message),
  });

  const unresolvedConflicts = (session.conflictItems as ConflictItem[]).filter(c => c.resolution === null).length;

  useEffect(() => {
    if (!summary) {
      completeMutation.mutate({ sessionId: session.id });
    }
  }, []);

  if (completeMutation.isPending || !summary) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-gray-500 text-sm">Finalizando auditoría…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-2">
        <ClipboardCheck className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-semibold text-gray-900">Auditoría completada</h2>
      <p className="text-gray-500 text-sm">
        Ubicación <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{session.locationCode}</code>
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-700">{summary.confirmed}</div>
          <div className="text-xs text-green-600 mt-1">Confirmados</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <div className="text-3xl font-bold text-red-700">{summary.missing}</div>
          <div className="text-xs text-red-600 mt-1">Faltantes</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <div className="text-3xl font-bold text-amber-700">{summary.relocated}</div>
          <div className="text-xs text-amber-600 mt-1">Reubicados</div>
        </div>
      </div>

      {summary.missing > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 text-left">
          <strong>{summary.missing}</strong> ítem(s) marcado(s) como <strong>MISSING</strong>.
          Puedes filtrarlos en la página de Inventario para investigar.
        </div>
      )}

      {unresolvedConflicts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 text-left">
          <strong>{unresolvedConflicts}</strong> conflicto(s) quedaron sin resolver (marcados como «omitidos»).
        </div>
      )}

      <Button onClick={onNewAudit} className="w-full">
        <RotateCcw className="h-4 w-4 mr-2" />
        Nueva auditoría
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = 'initiate' | 'scan' | 'complete';

export default function ShelfAudit() {
  const [step, setStep] = useState<Step>('initiate');
  const [session, setSession] = useState<AuditSession | null>(null);

  // Keep session data fresh while scanning
  const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
    enabled: step === 'scan',
    refetchInterval: false,
  });

  // Merge live session data into local state
  const currentSession = (step === 'scan' && liveSession) ? (liveSession as AuditSession) : session;

  const handleStarted = (s: AuditSession) => {
    setSession(s);
    setStep('scan');
  };

  const handleComplete = () => {
    setStep('complete');
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleNewAudit = () => {
    setSession(null);
    setStep('initiate');
  };

  return (
    <div className="container py-6 md:py-10">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8 text-xs text-gray-400">
        {(['initiate', 'scan', 'complete'] as Step[]).map((s, i) => {
          const labels = ['Iniciar', 'Escanear', 'Completar'];
          const icons = [ClipboardList, ScanLine, ClipboardCheck];
          const Icon = icons[i];
          const isActive = step === s;
          const isDone = (
            (s === 'initiate' && (step === 'scan' || step === 'complete')) ||
            (s === 'scan' && step === 'complete')
          );
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-200" />}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${
                isActive ? 'bg-blue-100 text-blue-700' :
                isDone ? 'text-green-600' : 'text-gray-400'
              }`}>
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{labels[i]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 'initiate' && <InitiateStep onStarted={handleStarted} />}
      {step === 'scan' && currentSession && (
        <ScanStep
          session={currentSession}
          onComplete={handleComplete}
          onRefresh={handleRefresh}
        />
      )}
      {step === 'complete' && currentSession && (
        <CompleteStep session={currentSession} onNewAudit={handleNewAudit} />
      )}
    </div>
  );
}
