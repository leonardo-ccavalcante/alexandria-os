import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { QuickCatalogModal } from '@/components/QuickCatalogModal';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { IsbnImageUpload } from '@/components/IsbnImageUpload';
import { Loader2, BookOpen, AlertCircle, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function Triage() {
  const [, setLocation] = useLocation();
  const [isbn, setIsbn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showQuickCatalog, setShowQuickCatalog] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

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
      // First, check if book exists in catalog
      const checkResult = await checkIsbnMutation.mutateAsync({ isbn: targetIsbn });

      if (!checkResult.found) {
        // Book not in catalog, fetch from Google Books
        toast.info('Buscando libro en Google Books...');
        const fetchResult = await fetchBookDataMutation.mutateAsync({ isbn: targetIsbn });
        
        if (fetchResult.success) {
          // Now check again with the newly added book
          const recheckResult = await checkIsbnMutation.mutateAsync({ isbn: targetIsbn });
          setResult(recheckResult);
        }
      } else {
        setResult(checkResult);
      }

      // Play sound based on decision
      if (checkResult.decision === 'ACCEPT') {
        playSound('success');
      } else if (checkResult.decision === 'DONATE') {
        playSound('warning');
      } else {
        playSound('error');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al verificar ISBN');
    } finally {
      setIsChecking(false);
    }
  };

  const playSound = (type: 'success' | 'warning' | 'error') => {
    // Create audio context for sound feedback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
      oscillator.frequency.value = 800;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => oscillator.stop(), 200);
    } else if (type === 'warning') {
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
  };

  const handleCatalog = () => {
    if (result?.bookData) {
      setLocation(`/catalog?isbn=${result.bookData.isbn13}`);
    }
  };

  const handleQuickCatalog = () => {
    setShowQuickCatalog(true);
  };

  const handleReset = () => {
    setIsbn('');
    setResult(null);
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'ACCEPT':
        return <CheckCircle className="h-16 w-16 text-green-600" />;
      case 'DONATE':
        return <AlertTriangle className="h-16 w-16 text-yellow-600" />;
      case 'RECYCLE':
        return <XCircle className="h-16 w-16 text-red-600" />;
      default:
        return <AlertCircle className="h-16 w-16 text-gray-600" />;
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'ACCEPT':
        return 'bg-green-50 border-green-500';
      case 'DONATE':
        return 'bg-yellow-50 border-yellow-500';
      case 'RECYCLE':
        return 'bg-red-50 border-red-500';
      default:
        return 'bg-gray-50 border-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-3 md:p-4">
      <div className="max-w-2xl mx-auto space-y-4 md:space-y-6 py-4 md:py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl flex items-center gap-2">
              <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
              Triage & Scan
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
                  placeholder="Ingresa ISBN manualmente (13 dígitos)"
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
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Verificar'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Decision Result */}
        {result && result.found && (
          <Card className={`border-4 ${getDecisionColor(result.decision)}`}>
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                {/* Icon */}
                <div className="flex justify-center">
                  {getDecisionIcon(result.decision)}
                </div>

                {/* Decision */}
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2">
                    {result.decision === 'ACCEPT' && '✅ ACEPTAR'}
                    {result.decision === 'DONATE' && '⚠️ DONAR'}
                    {result.decision === 'RECYCLE' && '❌ RECICLAR'}
                  </h2>
                  <p className="text-base md:text-lg text-gray-700">{result.reason}</p>
                </div>

                {/* Book Info */}
                {result.bookData && (
                  <div className="bg-white rounded-lg p-3 md:p-4 text-left space-y-2">
                    <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                      {result.bookData.coverImageUrl && (
                        <img
                          src={result.bookData.coverImageUrl}
                          alt={result.bookData.title}
                          className="w-20 h-28 sm:w-24 sm:h-32 object-cover rounded mx-auto sm:mx-0"
                        />
                      )}
                      <div className="flex-1 text-center sm:text-left">
                        <h3 className="font-bold text-base md:text-lg">{result.bookData.title}</h3>
                        <p className="text-sm md:text-base text-gray-600">{result.bookData.author}</p>
                        <p className="text-xs md:text-sm text-gray-500">ISBN: {result.bookData.isbn13}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs md:text-sm pt-2 border-t">
                      <div>
                        <span className="font-semibold">Precio Mercado:</span> €{result.marketPrice.toFixed(2)}
                      </div>
                      <div>
                        <span className="font-semibold">Gastos Estimados:</span> €{result.estimatedFees.toFixed(2)}
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold">Beneficio Proyectado:</span>{' '}
                        <span className={result.projectedProfit > 0 ? 'text-green-600' : 'text-red-600'}>
                          €{result.projectedProfit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 justify-center flex-wrap">
                  {result.decision === 'ACCEPT' && (
                    <>
                      <Button onClick={handleQuickCatalog} size="lg" className="bg-green-600 hover:bg-green-700">
                        ⚡ Catalogar Rápido
                      </Button>
                      <Button onClick={handleCatalog} size="lg" variant="outline" className="border-green-600 text-green-600 hover:bg-green-50">
                        Catalogar (Completo)
                      </Button>
                    </>
                  )}
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
      {result?.bookData && (
        <QuickCatalogModal
          open={showQuickCatalog}
          onClose={() => setShowQuickCatalog(false)}
          isbn={result.bookData.isbn13}
          bookData={result.bookData}
          suggestedPrice={result.marketPrice}
        />
      )}
    </div>
  );
}
