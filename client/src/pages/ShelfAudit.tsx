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
} from 'lucide-react';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import type { ShelfPhotoResult } from '../../../shared/auditTypes';

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
      const base64 = dataUrl.split(',')[1];
      if (!base64) return;
      setPreview(dataUrl);
      setAnalyzing(true);
      analyzeMutationRef.current.mutate({ sessionId: session.id, imageBase64: base64 });
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
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

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = 'initiate' | 'photo' | 'scan' | 'complete';

const STEP_META: { id: Step; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'initiate', label: 'Iniciar',      Icon: ClipboardList },
  { id: 'photo',    label: 'Fotografiar',  Icon: ImagePlus },
  { id: 'scan',     label: 'Escanear',     Icon: ScanLine },
  { id: 'complete', label: 'Completar',    Icon: ClipboardCheck },
];

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
    setStep('photo');
  };

  const handlePhotoAnalyzed = (results: ShelfPhotoResult[]) => {
    setSession(prev => prev ? { ...prev, photoAnalysisResult: results } : prev);
    setStep('scan');
  };

  const handleSkipPhoto = () => setStep('scan');

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
