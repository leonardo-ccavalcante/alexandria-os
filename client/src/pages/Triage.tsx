import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Loader2, BookOpen, AlertCircle, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function Triage() {
  const [, setLocation] = useLocation();
  const [isbn, setIsbn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-blue-600" />
              Triage & Scan
            </CardTitle>
            <CardDescription>
              Escanea o ingresa el ISBN para determinar si el libro es rentable
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Barcode Scanner */}
            <BarcodeScanner
              onScan={handleScan}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
            />

            {/* Manual ISBN Input */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Ingresa ISBN manualmente (13 dígitos)"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                  disabled={isScanning || isChecking}
                  className="text-lg"
                />
                <Button
                  onClick={() => handleCheck()}
                  disabled={isScanning || isChecking || !isbn}
                  size="lg"
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
                  <h2 className="text-3xl font-bold mb-2">
                    {result.decision === 'ACCEPT' && '✅ ACEPTAR'}
                    {result.decision === 'DONATE' && '⚠️ DONAR'}
                    {result.decision === 'RECYCLE' && '❌ RECICLAR'}
                  </h2>
                  <p className="text-lg text-gray-700">{result.reason}</p>
                </div>

                {/* Book Info */}
                {result.bookData && (
                  <div className="bg-white rounded-lg p-4 text-left space-y-2">
                    <div className="flex gap-4">
                      {result.bookData.coverImageUrl && (
                        <img
                          src={result.bookData.coverImageUrl}
                          alt={result.bookData.title}
                          className="w-24 h-32 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{result.bookData.title}</h3>
                        <p className="text-gray-600">{result.bookData.author}</p>
                        <p className="text-sm text-gray-500">ISBN: {result.bookData.isbn13}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
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
                <div className="flex gap-4 justify-center">
                  {result.decision === 'ACCEPT' && (
                    <Button onClick={handleCatalog} size="lg" className="bg-green-600 hover:bg-green-700">
                      Catalogar Libro
                    </Button>
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
    </div>
  );
}
