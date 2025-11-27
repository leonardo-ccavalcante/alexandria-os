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
import { DepositoLegalCapture } from '@/components/DepositoLegalCapture';
import { CoverColophonCapture } from '@/components/CoverColophonCapture';
import { Loader2, BookOpen, AlertCircle, CheckCircle, AlertTriangle, XCircle, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { generateSyntheticIsbn } from '@/../../shared/deposito-legal-utils';

export default function Triage() {
  const [, setLocation] = useLocation();
  const [isbn, setIsbn] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
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
                  className={`h-4 w-4 transition-transform ${
                    showPre1970Section ? 'rotate-90' : ''
                  }`}
                />
                Libros sin ISBN (pre-1970)
              </button>
              
              {showPre1970Section && (
                <div className="mt-4 space-y-4">
                  <DepositoLegalCapture
                    onExtracted={(depositoLegal) => {
                      // Generate synthetic ISBN and proceed with triage
                      const syntheticIsbn = generateSyntheticIsbn(depositoLegal);
                      setIsbn(syntheticIsbn);
                      
                      // Create a result object for books with Depósito Legal
                      const bookResult = {
                        found: false,
                        isbn: syntheticIsbn,
                        title: '', // Will be filled in catalog modal
                        author: '',
                        publisher: '',
                        publishedYear: undefined,
                        decision: 'ACCEPT' as const,
                        reason: 'Libro sin ISBN con Depósito Legal: ' + depositoLegal,
                        marketPrice: null,
                        estimatedFees: null,
                        profitEstimate: null
                      };
                      
                      setResult(bookResult);
                      toast.success(`ISBN sintético generado: ${syntheticIsbn}`);
                      
                      // Open quick catalog modal
                      setShowQuickCatalog(true);
                    }}
                  />
                  
                  {/* Alternative: Cover/Colophon capture for books without Depósito Legal */}
                  <CoverColophonCapture
                    onExtracted={(bookData) => {
                      // For books without Depósito Legal, generate ISBN from title
                      // Use a pseudo-deposito-legal based on title hash
                      const titleHash = bookData.title.substring(0, 10).replace(/\s/g, '').toUpperCase();
                      const syntheticIsbn = generateSyntheticIsbn(`BOOK-${titleHash}`);
                      setIsbn(syntheticIsbn);
                      
                      // Create a result object with the extracted book data
                      const bookResult = {
                        found: false,
                        isbn: syntheticIsbn,
                        title: bookData.title,
                        author: bookData.author || '',
                        publisher: bookData.publisher || '',
                        publishedYear: bookData.publicationYear,
                        decision: 'ACCEPT' as const,
                        reason: 'Libro sin ISBN identificado por portada/colofón',
                        marketPrice: null,
                        estimatedFees: null,
                        profitEstimate: null
                      };
                      
                      setResult(bookResult);
                      toast.success(`Libro identificado: ${bookData.title}`);
                      
                      // Open quick catalog modal with the extracted data
                      setShowQuickCatalog(true);
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Result for ISBN-less books (identified by photo) */}
        {result && !result.found && (
          <Card className="border-4 border-blue-500">
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                {/* Icon */}
                <div className="flex justify-center">
                  <BookOpen className="h-16 w-16 text-blue-600" />
                </div>

                {/* Title */}
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2 text-blue-600">
                    📚 Libro Identificado
                  </h2>
                  <p className="text-base md:text-lg text-gray-700">{result.reason}</p>
                </div>

                {/* Book Info */}
                {result.title && (
                  <div className="bg-white rounded-lg p-3 md:p-4 text-left space-y-2 border-2 border-blue-200">
                    <div className="space-y-2">
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
                  </div>
                )}

                {/* Catalog Button */}
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

                {/* Marketplace Price Comparison */}
                {result.marketplacePrices && result.marketplacePrices.length > 0 && (
                  <div className="bg-white rounded-lg p-3 md:p-4 text-left">
                    <h4 className="font-bold text-base md:text-lg mb-3">📊 Comparativa de Precios por Marketplace</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs md:text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">Marketplace</th>
                            <th className="text-right py-2 px-2">Precio</th>
                            <th className="text-center py-2 px-2">Estado</th>
                            <th className="text-center py-2 px-2">Disponible</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.marketplacePrices
                            .filter((p: any) => p.price !== null)
                            .sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))
                            .map((price: any, idx: number) => {
                              const isLowest = idx === 0;
                              const isHighest = idx === result.marketplacePrices.filter((p: any) => p.price !== null).length - 1;
                              return (
                                <tr key={price.marketplace} className={`border-b ${
                                  isLowest ? 'bg-green-50' : isHighest ? 'bg-red-50' : ''
                                }`}>
                                  <td className="py-2 px-2 font-medium">
                                    {price.marketplace}
                                    {isLowest && <span className="ml-1 text-green-600 text-xs">🏆 Más bajo</span>}
                                    {isHighest && <span className="ml-1 text-red-600 text-xs">📈 Más alto</span>}
                                  </td>
                                  <td className="text-right py-2 px-2 font-bold">
                                    €{parseFloat(price.price).toFixed(2)}
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    <span className="text-xs px-2 py-1 rounded bg-gray-100">
                                      {price.condition || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    {price.available === 'YES' ? '✅' : '❌'}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Price Summary */}
                    <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-xs md:text-sm">
                      <div className="text-center">
                        <div className="text-gray-600">Precio Mínimo</div>
                        <div className="font-bold text-green-600">
                          €{Math.min(...result.marketplacePrices.filter((p: any) => p.price !== null).map((p: any) => parseFloat(p.price))).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-600">Precio Promedio</div>
                        <div className="font-bold text-blue-600">
                          €{(result.marketplacePrices.filter((p: any) => p.price !== null).reduce((sum: number, p: any) => sum + parseFloat(p.price), 0) / result.marketplacePrices.filter((p: any) => p.price !== null).length).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-600">Precio Máximo</div>
                        <div className="font-bold text-red-600">
                          €{Math.max(...result.marketplacePrices.filter((p: any) => p.price !== null).map((p: any) => parseFloat(p.price))).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Selling Recommendation */}
                    <div className="mt-3 pt-3 border-t bg-blue-50 rounded p-2">
                      <p className="text-xs md:text-sm">
                        <span className="font-semibold">💡 Recomendación:</span> Vender en{' '}
                        <span className="font-bold">
                          {result.marketplacePrices
                            .filter((p: any) => p.price !== null)
                            .sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price))[0]?.marketplace}
                        </span>{' '}
                        para maximizar beneficio (€
                        {Math.max(...result.marketplacePrices.filter((p: any) => p.price !== null).map((p: any) => parseFloat(p.price))).toFixed(2)}
                        ).
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions - Always show catalog options, let user decide */}
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button 
                    onClick={handleQuickCatalog} 
                    size="lg" 
                    className={result.decision === 'ACCEPT' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}
                  >
                    ⚡ Catalogar Rápido
                  </Button>
                  <Button 
                    onClick={handleCatalog} 
                    size="lg" 
                    variant="outline" 
                    className={result.decision === 'ACCEPT' ? 'border-green-600 text-green-600 hover:bg-green-50' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}
                  >
                    Catalogar (Completo)
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
      {result && (
        <QuickCatalogModal
          open={showQuickCatalog}
          onClose={() => setShowQuickCatalog(false)}
          isbn={result.bookData?.isbn13 || result.isbn}
          bookData={result.bookData || {
            isbn13: result.isbn,
            title: result.title || '',
            author: result.author || '',
            publisher: result.publisher || '',
            publishedYear: result.publishedYear,
            coverImageUrl: undefined
          }}
          suggestedPrice={result.marketPrice}
        />
      )}
    </div>
  );
}
