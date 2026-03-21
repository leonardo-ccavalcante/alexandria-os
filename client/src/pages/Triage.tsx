import { useState } from 'react';
import { QuickCatalogModal } from '@/components/QuickCatalogModal';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { IsbnImageUpload } from '@/components/IsbnImageUpload';
import { CoverColophonCapture } from '@/components/CoverColophonCapture';
import {
  Loader2, BookOpen, AlertCircle, CheckCircle2, AlertTriangle,
  XCircle, ChevronRight, SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateSyntheticIsbn } from '@/../../shared/deposito-legal-utils';

// Discriminated union for the three possible result states
type TriageResult =
  | { kind: 'found'; data: any }
  | { kind: 'not_found'; isbn: string }
  | { kind: 'pre1970'; isbn: string; title: string; author?: string; publisher?: string; publishedYear?: string; reason: string };

export default function Triage() {
  const [isbn, setIsbn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [showQuickCatalog, setShowQuickCatalog] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [showPre1970Section, setShowPre1970Section] = useState(false);

  const checkIsbnMutation = trpc.triage.checkIsbn.useMutation();
  const fetchBookDataMutation = trpc.triage.fetchBookData.useMutation();

  const handleScan = (scannedIsbn: string) => {
    setIsbn(scannedIsbn);
    handleCheck(scannedIsbn);
  };

  const handleCheck = async (isbnToCheck?: string) => {
    const targetIsbn = isbnToCheck || isbn;
    if (!targetIsbn) {
      toast.error('Por favor ingresa un ISBN');
      return;
    }

    setIsChecking(true);
    setResult(null);

    try {
      // Step 1: check if the book already exists in our catalog
      const checkResult = await checkIsbnMutation.mutateAsync({ isbn: targetIsbn });

      if (checkResult.found) {
        // Book already in catalog — show it immediately
        setResult({ kind: 'found', data: checkResult });
        playSound(checkResult.decision ?? 'ACCEPT');
        return;
      }

      // Step 2: book not in catalog — try to fetch metadata from external sources
      toast.info('Buscando libro en bases de datos externas…');
      let fetchResult: { success: boolean } | null = null;
      try {
        fetchResult = await fetchBookDataMutation.mutateAsync({ isbn: targetIsbn });
      } catch {
        // fetch failed — treat as not found
      }

      if (fetchResult?.success) {
        // Metadata fetched and saved — re-check so we get the full bookData object
        const recheckResult = await checkIsbnMutation.mutateAsync({ isbn: targetIsbn });
        if (recheckResult.found) {
          setResult({ kind: 'found', data: recheckResult });
          playSound(recheckResult.decision ?? 'ACCEPT');
        } else {
          // Extremely unlikely: fetch succeeded but re-check still says not found
          setResult({ kind: 'not_found', isbn: targetIsbn });
          playSound('RECYCLE');
        }
      } else {
        // External lookup also failed — book genuinely not found anywhere
        setResult({ kind: 'not_found', isbn: targetIsbn });
        playSound('RECYCLE');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al verificar ISBN');
      // Still show a not-found state so the user isn't left with a blank screen
      setResult({ kind: 'not_found', isbn: targetIsbn });
    } finally {
      setIsChecking(false);
    }
  };

  const playSound = (decision: string) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      if (decision === 'ACCEPT') {
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.3;
        oscillator.start();
        setTimeout(() => oscillator.stop(), 200);
      } else if (decision === 'DONATE') {
        oscillator.frequency.value = 600;
        gainNode.gain.value = 0.3;
        oscillator.start();
        setTimeout(() => oscillator.stop(), 300);
      } else {
        oscillator.frequency.value = 400;
        gainNode.gain.value = 0.3;
        oscillator.start();
        setTimeout(() => oscillator.stop(), 400);
      }
    } catch {
      // AudioContext not available (e.g. in test environments) — silently ignore
    }
  };

  const handleReset = () => {
    setIsbn('');
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 md:p-4">
      <div className="max-w-2xl mx-auto space-y-4 md:space-y-6 py-4 md:py-8">

        {/* ── Input card ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl flex items-center gap-2">
              <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
              Triage &amp; Scan
            </CardTitle>
            <CardDescription className="text-sm md:text-base">
              Escanea o ingresa el ISBN para determinar si el libro es rentable
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            {/* Barcode Scanner */}
            <BarcodeScanner
              onScan={handleScan}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
            />

            {/* AI Image Upload */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">O sube una foto del libro:</p>
              <IsbnImageUpload
                onIsbnExtracted={handleScan}
                disabled={isScanning || isChecking}
              />
            </div>

            {/* Manual ISBN Input */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">O ingresa el ISBN manualmente:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="text"
                  placeholder="ISBN-10 o ISBN-13"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                  disabled={isScanning || isChecking}
                  className="text-base md:text-lg"
                />
                <Button
                  onClick={() => handleCheck()}
                  disabled={isScanning || isChecking || !isbn}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {isChecking ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" />Buscando…</>
                  ) : (
                    'Verificar'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Acepta ISBN-10 (10 dígitos) o ISBN-13 (13 dígitos)
              </p>
            </div>

            {/* Collapsible Depósito Legal for pre-1970 books */}
            <div className="border-t pt-4">
              <button
                onClick={() => setShowPre1970Section(!showPre1970Section)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${showPre1970Section ? 'rotate-90' : ''}`}
                />
                Libros sin ISBN (pre-1970)
              </button>

              {showPre1970Section && (
                <div className="mt-4 space-y-4">
                  <CoverColophonCapture
                    onExtracted={(bookData) => {
                      const titleHash = bookData.title.substring(0, 10).replace(/\s/g, '').toUpperCase();
                      const syntheticIsbn = generateSyntheticIsbn(`BOOK-${titleHash}`);
                      setIsbn(syntheticIsbn);
                      setResult({
                        kind: 'pre1970',
                        isbn: syntheticIsbn,
                        title: bookData.title,
                        author: bookData.author,
                        publisher: bookData.publisher,
                        publishedYear: bookData.publicationYear != null ? String(bookData.publicationYear) : undefined,
                        reason: 'Libro sin ISBN identificado por portada/colofón',
                      });
                      toast.success(`Libro identificado: ${bookData.title}`);
                      setShowQuickCatalog(true);
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Loading indicator ──────────────────────────────────────── */}
        {isChecking && (
          <Card className="border-2 border-blue-300">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center gap-3 text-blue-700">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="text-base font-medium">Buscando información del libro…</p>
                <p className="text-sm text-muted-foreground">Consultando Google Books, ISBNdb y catálogo local</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── NOT FOUND result ───────────────────────────────────────── */}
        {result?.kind === 'not_found' && (
          <Card className="border-2 border-red-400">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <SearchX className="h-16 w-16 text-red-500" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-red-700 mb-1">
                    Libro no encontrado
                  </h2>
                  <p className="text-sm text-gray-600">
                    No se encontró información para el ISBN{' '}
                    <span className="font-mono font-semibold">{result.isbn}</span>{' '}
                    en Google Books, ISBNdb ni en el catálogo local.
                  </p>
                </div>

                <Alert className="bg-amber-50 border-amber-300 text-left">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <AlertTitle className="text-amber-900">¿Qué puedes hacer?</AlertTitle>
                  <AlertDescription className="text-amber-800 space-y-1 text-sm">
                    <p>• Verifica que el ISBN esté bien escrito (13 dígitos).</p>
                    <p>• Si el libro es anterior a 1970, usa la sección <strong>Libros sin ISBN</strong> de arriba.</p>
                    <p>• Puedes catalogarlo manualmente ingresando título y autor en el modal.</p>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    onClick={() => {
                      setResult(null);
                      setShowQuickCatalog(true);
                    }}
                    size="lg"
                    variant="outline"
                    className="border-blue-400 text-blue-700 hover:bg-blue-50"
                  >
                    📝 Catalogar Manualmente
                  </Button>
                  <Button onClick={handleReset} variant="outline" size="lg">
                    Escanear Otro
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PRE-1970 result ────────────────────────────────────────── */}
        {result?.kind === 'pre1970' && (
          <Card className="border-4 border-blue-500">
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <BookOpen className="h-16 w-16 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2 text-blue-600">
                    📚 Libro Identificado
                  </h2>
                  <p className="text-base md:text-lg text-gray-700">{result.reason}</p>
                </div>

                <div className="bg-white rounded-lg p-3 md:p-4 text-left space-y-2 border-2 border-blue-200">
                  <div>
                    <span className="font-semibold text-gray-700">Título:</span>
                    <p className="text-lg font-bold text-blue-900">{result.title}</p>
                  </div>
                  {result.author && (
                    <div>
                      <span className="font-semibold text-gray-700">Autor:</span>
                      <p className="text-base text-gray-800">{result.author}</p>
                    </div>
                  )}
                  {result.publisher && (
                    <div>
                      <span className="font-semibold text-gray-700">Editorial:</span>
                      <p className="text-base text-gray-800">{result.publisher}</p>
                    </div>
                  )}
                  {result.publishedYear && (
                    <div>
                      <span className="font-semibold text-gray-700">Año:</span>
                      <p className="text-base text-gray-800">{result.publishedYear}</p>
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <span className="font-semibold text-gray-700">ISBN Sintético:</span>
                    <p className="text-sm font-mono text-blue-600">{result.isbn}</p>
                  </div>
                </div>

                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    onClick={() => setShowQuickCatalog(true)}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg"
                  >
                    📝 Catalogar Ahora
                  </Button>
                  <Button onClick={handleReset} variant="outline" size="lg">
                    Escanear Otro
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── FOUND result ───────────────────────────────────────────── */}
        {result?.kind === 'found' && (
          <Card className="border-2 border-teal-500">
            <CardContent className="pt-6">
              <div className="space-y-6">

                {/* Decision badge */}
                {result.data.decision && (
                  <div className={`flex items-center gap-3 rounded-lg p-3 border-2 ${
                    result.data.decision === 'ACCEPT'
                      ? 'bg-green-50 border-green-400'
                      : result.data.decision === 'DONATE'
                      ? 'bg-yellow-50 border-yellow-400'
                      : 'bg-red-50 border-red-400'
                  }`}>
                    {result.data.decision === 'ACCEPT' && <CheckCircle2 className="h-7 w-7 text-green-600 shrink-0" />}
                    {result.data.decision === 'DONATE' && <AlertTriangle className="h-7 w-7 text-yellow-600 shrink-0" />}
                    {result.data.decision === 'RECYCLE' && <XCircle className="h-7 w-7 text-red-600 shrink-0" />}
                    <div>
                      <p className={`font-bold text-lg ${
                        result.data.decision === 'ACCEPT' ? 'text-green-800'
                        : result.data.decision === 'DONATE' ? 'text-yellow-800'
                        : 'text-red-800'
                      }`}>
                        {result.data.decision === 'ACCEPT' ? '✅ ACEPTAR' : result.data.decision === 'DONATE' ? '🤝 DONAR' : '♻️ RECICLAR'}
                      </p>
                      {result.data.reason && (
                        <p className="text-sm text-gray-600">{result.data.reason}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Book info */}
                {result.data.bookData ? (
                  <div className="bg-white rounded-lg p-4 text-left space-y-4 border border-gray-200">
                    <div className="flex flex-col sm:flex-row gap-4">
                      {result.data.bookData.coverImageUrl && (
                        <img
                          src={result.data.bookData.coverImageUrl}
                          alt={result.data.bookData.title}
                          className="w-24 h-32 sm:w-28 sm:h-40 object-cover rounded mx-auto sm:mx-0 shadow-md"
                        />
                      )}
                      <div className="flex-1 text-center sm:text-left">
                        <h3 className="font-bold text-xl mb-1">{result.data.bookData.title}</h3>
                        {result.data.bookData.author && (
                          <p className="text-base text-gray-700 mb-1">{result.data.bookData.author}</p>
                        )}
                        <p className="text-sm text-gray-400 font-mono mb-2">ISBN: {result.data.bookData.isbn13}</p>
                        {result.data.bookData.publisher && (
                          <p className="text-sm text-gray-600">Editorial: {result.data.bookData.publisher}</p>
                        )}
                        {result.data.bookData.publicationYear && (
                          <p className="text-sm text-gray-600">Año: {result.data.bookData.publicationYear}</p>
                        )}
                        {result.data.bookData.synopsis && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-3">{result.data.bookData.synopsis}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Fallback: book found but no bookData object (edge case) */
                  <Alert className="bg-blue-50 border-blue-300">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                    <AlertTitle className="text-blue-900">Libro en catálogo</AlertTitle>
                    <AlertDescription className="text-blue-800 font-mono text-sm">
                      ISBN: {result.data.isbn || isbn}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Duplicate warning */}
                {result.data.inventorySummary && result.data.inventorySummary.totalCount > 0 && (
                  <Alert className="bg-amber-50 border-amber-400 border-2">
                    <AlertCircle className="h-6 w-6 text-amber-600" />
                    <AlertTitle className="text-lg font-bold text-amber-900">📦 Ya está en el inventario</AlertTitle>
                    <AlertDescription className="text-base text-amber-800 space-y-2">
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div><span className="font-semibold">Total:</span> {result.data.inventorySummary.totalCount}</div>
                        <div><span className="font-semibold">Disponibles:</span> {result.data.inventorySummary.availableCount}</div>
                      </div>
                      {result.data.inventorySummary.mostCommonAllocation && (
                        <div className="mt-2">
                          <span className="font-semibold">Ubicación habitual:</span>{' '}
                          <span className="text-lg font-bold">{result.data.inventorySummary.mostCommonAllocation}</span>
                        </div>
                      )}
                      <p className="mt-2 text-sm">Al catalogar se añadirá una nueva unidad.</p>
                    </AlertDescription>
                  </Alert>
                )}

                {/* New book notice */}
                {(!result.data.inventorySummary || result.data.inventorySummary.totalCount === 0) && (
                  <Alert className="bg-green-50 border-green-400 border-2">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <AlertTitle className="text-lg font-bold text-green-900">✨ Libro nuevo en el sistema</AlertTitle>
                    <AlertDescription className="text-base text-green-800">
                      Este libro no está en el inventario. Será catalogado como un nuevo título.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Actions */}
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    onClick={() => setShowQuickCatalog(true)}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                  >
                    ⚡ Catalogar Rápido
                  </Button>
                  <Button onClick={handleReset} variant="outline" size="lg">
                    Escanear Otro
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Catalog Modal */}
      {(result || !result) && (
        <QuickCatalogModal
          key={
            result?.kind === 'found' ? (result.data.bookData?.isbn13 || isbn)
            : result?.kind === 'pre1970' ? result.isbn
            : isbn
          }
          open={showQuickCatalog}
          onClose={() => setShowQuickCatalog(false)}
          onCatalogComplete={handleReset}
          isbn={
            result?.kind === 'found' ? (result.data.bookData?.isbn13 || isbn)
            : result?.kind === 'pre1970' ? result.isbn
            : isbn
          }
          bookData={
            result?.kind === 'found'
              ? result.data.bookData || { isbn13: isbn, title: '', author: '', publisher: '' }
              : result?.kind === 'pre1970'
              ? { isbn13: result.isbn, title: result.title, author: result.author || '', publisher: result.publisher || '', publishedYear: result.publishedYear }
              : { isbn13: isbn, title: '', author: '', publisher: '' }
          }
          suggestedPrice={result?.kind === 'found' ? result.data.marketPrice : undefined}
          isDuplicate={result?.kind === 'found' && result.data.inventorySummary && result.data.inventorySummary.totalCount > 0}
          suggestedAllocation={result?.kind === 'found' ? result.data.inventorySummary?.mostCommonAllocation : undefined}
          existingCount={result?.kind === 'found' ? result.data.inventorySummary?.totalCount : undefined}
        />
      )}
    </div>
  );
}
