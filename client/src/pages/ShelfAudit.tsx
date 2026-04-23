/**
 * ShelfAudit.tsx
 *
 * Shelf Audit wizard — four-step flow:
 *   1. Initiate:    enter a location code to start (or resume) an audit session.
 *   2. Photo:       photograph the shelf; AI batch-recognises books and auto-advances.
 *   3. Scan:        scan ISBNs via camera or manual entry; resolve location conflicts inline.
 *   4. Complete:    review the summary and finish the session.
 *
 * All tRPC calls go through the shelfAudit sub-router.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ClipboardList,
  ClipboardCheck,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  MapPin,
  ArrowRight,
  RotateCcw,
  Camera,
  Keyboard,
  ImagePlus,
  SkipForward,
  HelpCircle,
  ListChecks,
  BookPlus,
  MoveRight,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocation, Link } from 'wouter';
import type { ShelfPhotoResult, ExpectedItemDetail } from '../../../shared/auditTypes';

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
  photoAnalysisResult: ShelfPhotoResult[] | null;
  photoReconciled: boolean;
  expectedItemDetails: ExpectedItemDetail[];
  coSessions?: Array<{ sessionId: string; userName: string; confirmedCount: number }>;
};

// ─── Step 2: Photo ────────────────────────────────────────────────────────────

function PhotoStep({
  session,
  onAnalyzed,
  onSkip,
}: {
  session: AuditSession;
  onAnalyzed: (results: ShelfPhotoResult[]) => void;
  onSkip: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const analyzeMutation = trpc.shelfAudit.analyzeShelfPhoto.useMutation({
    onSuccess: (results) => {
      const matched = results.filter(r => r.matchedItemUuid !== null).length;
      toast.success(`Análisis completo: ${matched} de ${results.length} libros reconocidos.`);
      onAnalyzed(results);
    },
    onError: (err) => {
      toast.error(err.message);
      setAnalyzing(false);
    },
  });

  // analyzeMutation is a new object each render; use a ref to keep the callback stable
  const analyzeMutationRef = useRef(analyzeMutation);
  analyzeMutationRef.current = analyzeMutation;

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error('La imagen supera el límite de 5 MB. Elige una foto más pequeña.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Send the full data URL (data:<mime>;base64,<payload>) so the server can
      // detect the correct MIME type for S3 upload. iOS can produce WebP or HEIC
      // images — hardcoding 'image/jpeg' causes wrong Content-Type on S3.
      if (!dataUrl) return;
      setPreview(dataUrl);
      setAnalyzing(true);
      analyzeMutationRef.current.mutate({ sessionId: session.id, imageBase64: dataUrl });
    };
    reader.readAsDataURL(file);
  // session.id is stable for the lifetime of this step; analyzeMutation via ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-50 mb-2">
          <ImagePlus className="h-7 w-7 text-indigo-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Fotografiar el estante</h2>
        <p className="text-gray-500 text-sm">
          Toma una foto del estante <strong>{session.locationCode}</strong>. La IA identificará los
          lomos de los libros y los comparará con el inventario registrado.
        </p>
      </div>

      {/* Photo upload area */}
      <Card
        className={`border-2 border-dashed cursor-pointer transition-colors ${
          analyzing ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30'
        }`}
        onClick={() => !analyzing && fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          {analyzing ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
              <p className="text-sm text-indigo-700 font-medium">Analizando estantería…</p>
              <p className="text-xs text-indigo-500">Esto puede tardar 10–20 segundos.</p>
            </>
          ) : preview ? (
            <>
              <img src={preview} alt="Vista previa del estante" className="max-h-48 rounded-lg object-contain shadow" />
              <p className="text-xs text-gray-400">Haz clic para cambiar la foto</p>
            </>
          ) : (
            <>
              <Camera className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-600 font-medium">Haz clic para seleccionar una foto</p>
              <p className="text-xs text-gray-400">JPG, PNG o WEBP · máx. 5 MB</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* No capture attribute: allows iOS users to choose between camera and photo
          library. capture="environment" forces camera-only on iOS Safari and also
          prevents HEIC→JPEG conversion, breaking the AI analysis pipeline. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={analyzing}
      />

      <div className="text-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-gray-600 text-xs"
          onClick={onSkip}
          disabled={analyzing}
        >
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Saltar foto y escanear manualmente
        </Button>
      </div>
    </div>
  );
}

// ─── Reconciliation tabs ──────────────────────────────────────────────────────

function ReconcileTab({
  session,
  photoResults,
  onRefresh,
}: {
  session: AuditSession;
  photoResults: ShelfPhotoResult[];
  onRefresh: () => void;
}) {
  const confirmed = session.confirmedItemUuids;
  const pendingConflicts = (session.conflictItems as ConflictItem[]).filter(c => c.resolution === null);
  const expected = session.expectedItemUuids;
  const unrecognized = photoResults.filter(r => r.matchedItemUuid === null && r.confidence >= 0.5);
  const conflictUuids = new Set((session.conflictItems as ConflictItem[]).map(c => c.uuid));
  const notFound = expected.filter(uuid => !confirmed.includes(uuid) && !conflictUuids.has(uuid));

  return (
    <Tabs defaultValue="confirmed" className="w-full">
      <TabsList className="grid w-full grid-cols-4 text-xs h-auto">
        <TabsTrigger value="confirmed" className="text-xs py-1.5">
          ✅ {confirmed.length}
        </TabsTrigger>
        <TabsTrigger value="conflicts" className="text-xs py-1.5">
          ⚠️ {pendingConflicts.length}
        </TabsTrigger>
        <TabsTrigger value="unrecognized" className="text-xs py-1.5">
          ❓ {unrecognized.length}
        </TabsTrigger>
        <TabsTrigger value="notfound" className="text-xs py-1.5">
          ❌ {notFound.length}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="confirmed">
        {confirmed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
            <HelpCircle className="h-5 w-5" />
            <p className="text-xs">Ningún ítem confirmado aún.</p>
          </div>
        ) : (
          <ul className="space-y-1 mt-2">
            {confirmed.map(uuid => (
              <li key={uuid} className="flex items-center gap-2 text-xs text-green-800 bg-green-50 rounded px-3 py-1.5">
                <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                <code className="font-mono">{uuid.slice(0, 8)}…</code>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="conflicts">
        {pendingConflicts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
            <HelpCircle className="h-5 w-5" />
            <p className="text-xs">Sin conflictos pendientes.</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {pendingConflicts.map(c => (
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
      </TabsContent>

      <TabsContent value="unrecognized">
        {unrecognized.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
            <HelpCircle className="h-5 w-5" />
            <p className="text-xs">Todos los libros detectados fueron reconocidos.</p>
          </div>
        ) : (
          <ul className="space-y-2 mt-2">
            {unrecognized.map((r, i) => (
              <li key={i} className="bg-amber-50 rounded-lg px-3 py-2 text-sm">
                <div className="font-medium text-amber-900">{r.title}</div>
                <div className="text-xs text-amber-700">{r.author}</div>
                <div className="text-xs text-amber-500 mt-0.5">
                  Confianza: {Math.round(r.confidence * 100)}%
                  {r.isbn && <span className="ml-2">ISBN: {r.isbn}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="notfound">
        {notFound.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
            <HelpCircle className="h-5 w-5" />
            <p className="text-xs">Todos los ítems esperados han sido confirmados o están en conflicto.</p>
          </div>
        ) : (
          <ul className="space-y-1 mt-2">
            {notFound.map(uuid => (
              <li key={uuid} className="flex items-center gap-2 text-xs text-red-800 bg-red-50 rounded px-3 py-1.5">
                <XCircle className="h-3 w-3 flex-shrink-0" />
                <code className="font-mono">{uuid.slice(0, 8)}…</code>
                <Badge variant="destructive" className="text-xs ml-auto">MISSING</Badge>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ─── Step 1: Initiate ─────────────────────────────────────────────────────────

function InitiateStep({ onStarted }: { onStarted: (session: AuditSession) => void }) {
  const [locationCode, setLocationCode] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [showBusyWarning, setShowBusyWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: existing, isLoading: loadingExisting } = trpc.shelfAudit.getActiveAuditSession.useQuery();
  const { data: busySessions, isFetching: checkingBusy } = trpc.shelfAudit.getActiveSessionsForLocation.useQuery(
    { locationCode: pendingCode ?? '' },
    { enabled: !!pendingCode && !showBusyWarning }
  );
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

  // When busy-check resolves, either show warning or proceed directly
  useEffect(() => {
    if (!pendingCode || busySessions === undefined || showBusyWarning) return;
    if (busySessions.length > 0) {
      setShowBusyWarning(true);
    } else {
      initiateMutation.mutate({ locationCode: pendingCode });
      setPendingCode(null);
    }
  }, [busySessions, pendingCode, showBusyWarning]);

  // When the user edits the location code after a busy warning, reset the warning
  const handleLocationChange = (v: string) => {
    setLocationCode(v);
    if (showBusyWarning) {
      setShowBusyWarning(false);
      setPendingCode(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = locationCode.toUpperCase().trim();
    if (!/^[0-9]{2}[A-Z]$/.test(code)) {
      toast.error('Formato inválido. Usa el formato 01A (dos dígitos + una letra).');
      return;
    }
    setPendingCode(code);
  };

  const handleConfirmBusy = () => {
    if (!pendingCode) return;
    initiateMutation.mutate({ locationCode: pendingCode });
    setPendingCode(null);
    setShowBusyWarning(false);
  };

  const handleCancelBusy = () => {
    setPendingCode(null);
    setShowBusyWarning(false);
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

      {/* Location busy warning — shown before confirming initiation */}
      {showBusyWarning && busySessions && busySessions.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-orange-800 text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Ubicación en uso
            </CardTitle>
            <CardDescription className="text-orange-700">
              {busySessions.map((s) => (
                <span key={s.sessionId}>
                  <strong>{s.userName}</strong> ya está auditando <strong>{pendingCode}</strong>
                  {s.confirmedCount > 0 && ` (${s.confirmedCount} libro${s.confirmedCount !== 1 ? 's' : ''} confirmado${s.confirmedCount !== 1 ? 's' : ''})`}.
                </span>
              ))}
              {' '}¿Deseas iniciar de todas formas?
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirmBusy}
              disabled={initiateMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {initiateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Iniciar de todas formas'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancelBusy}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

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
              onChange={(e) => handleLocationChange(e.target.value.toUpperCase())}
              placeholder="01A"
              maxLength={3}
              className="font-mono text-lg tracking-widest w-28 text-center"
              disabled={initiateMutation.isPending || !!pendingCode}
            />
            <Button type="submit" disabled={initiateMutation.isPending || !locationCode || !!pendingCode}>
              {initiateMutation.isPending || checkingBusy ? (
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

  const photoResults: ShelfPhotoResult[] = Array.isArray(session.photoAnalysisResult)
    ? (session.photoAnalysisResult as ShelfPhotoResult[])
    : [];

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

      {/* Co-auditor banner — only shown when another user is auditing the same location */}
      {session.coSessions && session.coSessions.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 flex items-start gap-2 text-sm text-blue-800">
          <Users className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div>
            {session.coSessions.map(cs => (
              <span key={cs.sessionId}>
                <strong>{cs.userName}</strong> también está auditando esta ubicación — {cs.confirmedCount} libro{cs.confirmedCount !== 1 ? 's' : ''} confirmado{cs.confirmedCount !== 1 ? 's' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

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

       {/* Reconciliation tabs (photo flow) or plain conflict list (manual-only flow) */}
      {photoResults.length > 0 || session.conflictItems.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Resumen de reconciliación</h3>
          <ReconcileTab session={session} photoResults={photoResults} onRefresh={onRefresh} />
        </div>
      ) : null}

      {/* Note: when photoResults is empty but conflicts exist, ReconcileTab above
           already shows the conflicts tab — no duplicate list needed. */}
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
    // Intentionally fire once on mount; completeMutation and session.id are stable here
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

// ─── Main page ────────────────────────────────────────────────────────────// ─── Step 3: Reconcile ───────────────────────────────────────────────────────

function ReconcileStep({
  session,
  onReconciled,
  onSkip,
}: {
  session: AuditSession;
  onReconciled: () => void;
  onSkip: () => void;
}) {
  const [, navigate] = useLocation();
  const photoResults: ShelfPhotoResult[] = Array.isArray(session.photoAnalysisResult)
    ? (session.photoAnalysisResult as ShelfPhotoResult[])
    : [];
  const confirmedSet = new Set(session.confirmedItemUuids);

  // Section 1: photo-detected books matched to an item at a DIFFERENT location
  const moveItems = photoResults.filter(
    r => r.matchedItemUuid !== null &&
         r.matchedLocationCode !== session.locationCode &&
         r.confidence >= 0.5,
  );
  // Section 2: photo-detected books with NO inventory match
  const newBooks = photoResults.filter(
    r => r.matchedItemUuid === null && r.confidence >= 0.5,
  );
  // Section 3: expected items not yet confirmed
  const clearItems = (session.expectedItemDetails ?? []).filter(
    d => !confirmedSet.has(d.uuid),
  );

  // Checkbox state
  const [moveChecked, setMoveChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(moveItems.map(r => [r.matchedItemUuid!, true])),
  );
  const [newChecked, setNewChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(newBooks.map((_, i) => [i, true])),
  );
  const [clearChecked, setClearChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(clearItems.map(d => [d.uuid, true])),
  );

  // Expanded rows
  const [expandedMove, setExpandedMove] = useState<Record<string, boolean>>({});
  const [expandedNew, setExpandedNew] = useState<Record<number, boolean>>({});
  const [expandedClear, setExpandedClear] = useState<Record<string, boolean>>({});

  const applyMutation = trpc.shelfAudit.applyPhotoReconciliation.useMutation({
    onSuccess: (result) => {
      toast.success(`Reconciliación aplicada: ${result.moved} movidos, ${result.cleared} ubicaciones limpiadas.`);
      onReconciled();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalChanges =
    Object.values(moveChecked).filter(Boolean).length +
    Object.values(newChecked).filter(Boolean).length +
    Object.values(clearChecked).filter(Boolean).length;

  const handleConfirm = () => {
    const moves = moveItems
      .filter(r => moveChecked[r.matchedItemUuid!])
      .map(r => r.matchedItemUuid!);
    const clears = clearItems
      .filter(d => clearChecked[d.uuid])
      .map(d => d.uuid);
    const hasNewBooks = newBooks.some((_, i) => newChecked[i]);

    applyMutation.mutate(
      { sessionId: session.id, moves, clearLocations: clears },
      {
        onSuccess: () => {
          if (hasNewBooks) {
            navigate(`/triage?locationCode=${encodeURIComponent(session.locationCode)}`);
          }
        },
      },
    );
  };

  const isEmpty = moveItems.length === 0 && newBooks.length === 0 && clearItems.length === 0;

  if (session.photoReconciled) {
    return (
      <div className="max-w-lg mx-auto space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-50 mb-2">
          <CheckCircle2 className="h-7 w-7 text-violet-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Estante ya reconciliado</h2>
        <p className="text-gray-500 text-sm">Esta sesión ya fue reconciliada anteriormente.</p>
        <Button onClick={onSkip} className="w-full">Continuar al escaneo</Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ minHeight: 'calc(100dvh - 11rem)' }}>
      <div className="text-center space-y-2 mb-5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-50 mb-2">
          <ListChecks className="h-7 w-7 text-violet-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Reconciliar estante</h2>
        <p className="text-gray-500 text-sm">
          Revisa los cambios detectados para el estante{' '}
          <strong>{session.locationCode}</strong>. Desmarca los que no quieras aplicar.
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-10 text-gray-400">
          <CheckCircle2 className="h-10 w-10 text-green-400" />
          <p className="text-sm font-medium text-green-700">No hay cambios pendientes</p>
          <p className="text-xs text-gray-400">Todos los libros detectados ya están en esta ubicación.</p>
          <Button onClick={onSkip} className="mt-2">Continuar al escaneo</Button>
        </div>
      ) : (
        <>
          {/* Scrollable list — flex-1 min-h-0 required for flex children to shrink and scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2">
            <div className="space-y-5 pr-1">

              {/* Section 1: Move existing items to this location */}
              {moveItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <MoveRight className="h-4 w-4" />
                      Mover a esta ubicación ({moveItems.length})
                    </div>
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        const allChecked = moveItems.every(r => moveChecked[r.matchedItemUuid!]);
                        setMoveChecked(Object.fromEntries(moveItems.map(r => [r.matchedItemUuid!, !allChecked])));
                      }}
                    >
                      {moveItems.every(r => moveChecked[r.matchedItemUuid!]) ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {moveItems.map((r) => (
                      <li key={r.matchedItemUuid} className="bg-blue-50 rounded-lg px-3 py-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`move-${r.matchedItemUuid}`}
                            checked={!!moveChecked[r.matchedItemUuid!]}
                            onCheckedChange={(v) => setMoveChecked(prev => ({ ...prev, [r.matchedItemUuid!]: !!v }))}
                            className="mt-0.5"
                          />
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => setExpandedMove(prev => ({ ...prev, [r.matchedItemUuid!]: !prev[r.matchedItemUuid!] }))}
                          >
                            <div className="text-sm font-medium text-blue-900">{r.title}</div>
                            <div className="text-xs text-blue-700">{r.author}</div>
                            {expandedMove[r.matchedItemUuid!] && (
                              <div className="mt-1.5 space-y-0.5 text-xs text-blue-600">
                                <div>Confianza: {Math.round(r.confidence * 100)}%</div>
                                {r.isbn && <div>ISBN: {r.isbn}</div>}
                                <div className="flex items-center gap-1">
                                  Ubicación actual:
                                  <Badge variant="outline" className="text-xs">{r.matchedLocationCode ?? '—'}</Badge>
                                  <ArrowRight className="h-3 w-3" />
                                  <Badge className="text-xs bg-blue-600">{session.locationCode}</Badge>
                                </div>
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">{r.matchedLocationCode ?? '—'}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Section 2: New books (not in inventory) */}
              {newBooks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <BookPlus className="h-4 w-4" />
                      Nuevo libro ({newBooks.length})
                    </div>
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        const allChecked = newBooks.every((_, i) => newChecked[i]);
                        setNewChecked(Object.fromEntries(newBooks.map((_, i) => [i, !allChecked])));
                      }}
                    >
                      {newBooks.every((_, i) => newChecked[i]) ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {newBooks.map((r, i) => (
                      <li key={i} className="bg-emerald-50 rounded-lg px-3 py-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`new-${i}`}
                            checked={!!newChecked[i]}
                            onCheckedChange={(v) => setNewChecked(prev => ({ ...prev, [i]: !!v }))}
                            className="mt-0.5"
                          />
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => setExpandedNew(prev => ({ ...prev, [i]: !prev[i] }))}
                          >
                            <div className="text-sm font-medium text-emerald-900">{r.title}</div>
                            <div className="text-xs text-emerald-700">{r.author}</div>
                            {expandedNew[i] && (
                              <div className="mt-1.5 space-y-0.5 text-xs text-emerald-600">
                                <div>Confianza: {Math.round(r.confidence * 100)}%</div>
                                {r.isbn && <div>ISBN: {r.isbn}</div>}
                                <div className="text-emerald-500">Se abrirá el flujo de triage con ubicación pre-rellenada.</div>
                              </div>
                            )}
                          </div>
                          <Badge className="text-xs bg-emerald-600 shrink-0">NUEVO</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Section 3: Clear location for unconfirmed expected items */}
              {clearItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                      <Trash2 className="h-4 w-4" />
                      Limpiar ubicación ({clearItems.length})
                    </div>
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        const allChecked = clearItems.every(d => clearChecked[d.uuid]);
                        setClearChecked(Object.fromEntries(clearItems.map(d => [d.uuid, !allChecked])));
                      }}
                    >
                      {clearItems.every(d => clearChecked[d.uuid]) ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Estos libros estaban registrados en este estante pero no aparecen en la foto.
                    Su ubicación se limpiará (el estado DISPONIBLE no cambia).
                  </p>
                  <ul className="space-y-1.5">
                    {clearItems.map((d) => (
                      <li key={d.uuid} className="bg-red-50 rounded-lg px-3 py-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`clear-${d.uuid}`}
                            checked={!!clearChecked[d.uuid]}
                            onCheckedChange={(v) => setClearChecked(prev => ({ ...prev, [d.uuid]: !!v }))}
                            className="mt-0.5"
                          />
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => setExpandedClear(prev => ({ ...prev, [d.uuid]: !prev[d.uuid] }))}
                          >
                            <div className="text-sm font-medium text-red-900">{d.title ?? 'Título desconocido'}</div>
                            <div className="text-xs text-red-700">{d.author ?? ''}</div>
                            {expandedClear[d.uuid] && (
                              <div className="mt-1.5 space-y-0.5 text-xs text-red-600">
                                <div>ISBN: {d.isbn13}</div>
                                <div>UUID: <code className="font-mono">{d.uuid.slice(0, 8)}…</code></div>
                              </div>
                            )}
                          </div>
                          <Badge variant="destructive" className="text-xs shrink-0">LIMPIAR</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </div>{/* end scrollable list */}

          {/* Footer — safe-area-inset-bottom clears Android Chrome bottom bar */}
          <div
            className="bg-white pt-3 border-t border-gray-100 mt-2"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onSkip}
              disabled={applyMutation.isPending}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Saltar
            </Button>
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-700"
              onClick={handleConfirm}
              disabled={applyMutation.isPending || totalChanges === 0}
            >
              {applyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Confirmar ({totalChanges} cambios)
            </Button>
          </div>
          </div>{/* end sticky footer */}
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = 'initiate' | 'photo' | 'reconcile' | 'scan' | 'complete';
const STEP_META: { id: Step; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'initiate',   label: 'Iniciar',      Icon: ClipboardList },
  { id: 'photo',      label: 'Fotografiar',  Icon: ImagePlus },
  { id: 'reconcile',  label: 'Reconciliar',  Icon: ListChecks },
  { id: 'scan',       label: 'Escanear',     Icon: ScanLine },
  { id: 'complete',   label: 'Completar',    Icon: ClipboardCheck },
];

export default function ShelfAudit() {
  const [step, setStep] = useState<Step>('initiate');
  const [session, setSession] = useState<AuditSession | null>(null);

  // Keep session data fresh while scanning
  const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
    enabled: step === 'scan',
    // Auto-poll every 5s during scan so the co-auditor banner updates automatically
    refetchInterval: step === 'scan' ? 5000 : false,
    refetchIntervalInBackground: false,
  });

  // Merge live session data into local state
  const currentSession = (step === 'scan' && liveSession) ? (liveSession as AuditSession) : session;

  const handleStarted = (s: AuditSession) => {
    setSession(s);
    setStep('photo');
  };

  const handlePhotoAnalyzed = (results: ShelfPhotoResult[]) => {
    setSession(prev => prev ? { ...prev, photoAnalysisResult: results } : prev);
    setStep('reconcile');
  };

  const handleSkipPhoto = () => setStep('reconcile');

  const handleReconciled = () => setStep('scan');
  const handleSkipReconcile = () => setStep('scan');

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
      {/* History link — only visible on initiate step */}
      {step === 'initiate' && (
        <div className="flex justify-end mb-2">
          <Link href="/auditoria/historial">
            <Button variant="ghost" size="sm" className="text-gray-500 gap-1 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              Ver historial
            </Button>
          </Link>
        </div>
      )}
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 mb-8 text-xs text-gray-400">
        {STEP_META.map(({ id, label, Icon }, i) => {
          const stepIndex = STEP_META.findIndex(s => s.id === step);
          const isActive = step === id;
          const isDone = i < stepIndex;
          return (
            <div key={id} className="flex items-center gap-1">
              {i > 0 && <div className="w-6 h-px bg-gray-200" />}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${
                isActive ? 'bg-blue-100 text-blue-700' :
                isDone   ? 'text-green-600' :
                           'text-gray-400'
              }`}>
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 'initiate' && <InitiateStep onStarted={handleStarted} />}

      {step === 'photo' && currentSession && (
        <PhotoStep
          session={currentSession}
          onAnalyzed={handlePhotoAnalyzed}
          onSkip={handleSkipPhoto}
        />
      )}

      {step === 'reconcile' && currentSession && (
        <ReconcileStep
          session={currentSession}
          onReconciled={handleReconciled}
          onSkip={handleSkipReconcile}
        />
      )}

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
