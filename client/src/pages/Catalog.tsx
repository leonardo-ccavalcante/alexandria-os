import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Package, CheckCircle, Search, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export default function Catalog() {
  const [, setLocation] = useLocation();
  
  // -- FORM STATE --
  const [isbn, setIsbn] = useState('');
  const [condition, setCondition] = useState<'COMO_NUEVO' | 'BUENO' | 'ACEPTABLE'>('BUENO');
  const [conditionNotes, setConditionNotes] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [createdItem, setCreatedItem] = useState<any>(null);

  // -- INITIALIZATION --
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isbnParam = params.get('isbn');
    if (isbnParam) setIsbn(isbnParam);
  }, []);

  // -- DATA FETCHING LOGIC --
  
  // 1. Check Internal Database
  const { data: internalBookData, isLoading: isLoadingInternal } = trpc.triage.getBookByIsbn.useQuery(
    { isbn },
    { enabled: !!isbn && isbn.length >= 10 }
  );

  // 2. External API Mutation (Google Books)
  const fetchExternalData = trpc.triage.fetchBookData.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Información recuperada de Google Books");
      }
    },
    onError: () => {
      toast.warning("No se encontraron datos externos. Por favor ingrese manualmente.");
    }
  });

  // 3. AUTOMATION: Trigger External Fetch if Internal fails
  useEffect(() => {
    // Rules: Valid ISBN + Internal Check Done + Not Found Internally + Not fetching yet
    if (isbn && !isLoadingInternal && internalBookData && !internalBookData.found) {
      if (!fetchExternalData.isPending && !fetchExternalData.data && !fetchExternalData.isError) {
         fetchExternalData.mutate({ isbn });
      }
    }
  }, [isbn, isLoadingInternal, internalBookData, fetchExternalData]);

  // 4. MERGE DATA (Priority: Internal > External)
  const activeBookData = internalBookData?.found 
    ? internalBookData.bookData 
    : (fetchExternalData.data?.success ? fetchExternalData.data.bookData : null);

  const isFetchingMetadata = isLoadingInternal || fetchExternalData.isPending;

  // -- PRICING LOGIC --
  const { data: priceData, isLoading: isPriceLoading } = trpc.catalog.calculatePrice.useQuery(
    { isbn, condition },
    { enabled: !!isbn }
  );

  const createItemMutation = trpc.catalog.createItem.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isbn) { toast.error('ISBN es requerido'); return; }
    if (!locationCode || !/^[0-9]{2}[A-Z]$/.test(locationCode)) {
      toast.error('Código de ubicación inválido. Formato: 02A');
      return;
    }

    const finalPrice = useManualPrice && manualPrice ? manualPrice : priceData?.suggestedPrice.toFixed(2) || '0';

    try {
      const result = await createItemMutation.mutateAsync({
        isbn13: isbn,
        conditionGrade: condition,
        conditionNotes: conditionNotes || undefined,
        locationCode: locationCode.toUpperCase(),
        listingPrice: finalPrice,
      });
      setCreatedItem(result.item);
      toast.success('¡Libro catalogado exitosamente!');
    } catch (error: any) {
      toast.error(error.message || 'Error al catalogar libro');
    }
  };

  const handleReset = () => {
    setIsbn('');
    setCondition('BUENO');
    setConditionNotes('');
    setLocationCode('');
    setManualPrice('');
    setUseManualPrice(false);
    setCreatedItem(null);
    fetchExternalData.reset();
    setLocation('/triage');
  };

  // -- SUCCESS VIEW --
  if (createdItem) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="max-w-2xl mx-auto space-y-6 py-8">
          <Card className="border-4 border-green-500">
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <CheckCircle className="h-24 w-24 text-green-600" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-2 text-green-700">Libro Catalogado</h2>
                  <p className="text-lg text-gray-700">El ítem ha sido añadido al inventario correctamente.</p>
                </div>
                <div className="flex gap-4 justify-center">
                  <Button onClick={handleReset} size="lg">Catalogar Otro</Button>
                  <Button onClick={() => setLocation('/inventory')} variant="outline" size="lg">Ver Inventario</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // -- MAIN FORM VIEW --
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Package className="h-8 w-8 text-purple-600" />
              Catalogar Libro
            </CardTitle>
            <CardDescription>
              {/* METADATA STATUS INDICATOR */}
              {isFetchingMetadata && (
                <div className="mt-4 flex items-center gap-2 text-blue-600 bg-blue-50 p-3 rounded-md animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Buscando metadatos en Google Books...</span>
                </div>
              )}

              {!isFetchingMetadata && activeBookData && (
                <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm flex gap-4">
                  {activeBookData.coverImageUrl ? (
                    <img src={activeBookData.coverImageUrl} alt="Cover" className="w-20 h-28 object-cover rounded shadow-sm" />
                  ) : (
                    <div className="w-20 h-28 bg-gray-100 rounded flex items-center justify-center"><BookOpen className="h-8 w-8 text-gray-300"/></div>
                  )}
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg text-gray-900">{activeBookData.title}</h3>
                    <p className="text-purple-700 font-medium">{activeBookData.author}</p>
                    <div className="text-xs text-gray-500 grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      <span>ISBN: {activeBookData.isbn13}</span>
                      <span>Ed: {activeBookData.publisher}</span>
                      <span>Año: {activeBookData.publicationYear}</span>
                      <span>Pág: {activeBookData.pages}</span>
                    </div>
                  </div>
                </div>
              )}

              {!isFetchingMetadata && !activeBookData && isbn && (
                <div className="mt-4 bg-yellow-50 text-yellow-800 p-3 rounded-md border border-yellow-200 text-sm">
                  ⚠️ No se encontraron datos automáticos. Por favor ingrese los detalles manualmente.
                </div>
              )}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ISBN */}
              <div className="space-y-2">
                <Label>ISBN</Label>
                <div className="relative">
                  <Input value={isbn} readOnly className="bg-gray-100 font-mono pl-9" />
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                </div>
              </div>

              {/* CONDITION SELECTION */}
              <div className="space-y-3">
                <Label>Condición del Libro</Label>
                <RadioGroup value={condition} onValueChange={(value: any) => setCondition(value)}>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <RadioGroupItem value="COMO_NUEVO" id="cn" />
                    <Label htmlFor="cn" className="flex-1 cursor-pointer font-semibold">Como Nuevo <span className="font-normal text-gray-500 block text-xs">Sin defectos visibles</span></Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <RadioGroupItem value="BUENO" id="bn" />
                    <Label htmlFor="bn" className="flex-1 cursor-pointer font-semibold">Bueno <span className="font-normal text-gray-500 block text-xs">Desgaste ligero</span></Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <RadioGroupItem value="ACEPTABLE" id="ac" />
                    <Label htmlFor="ac" className="flex-1 cursor-pointer font-semibold">Aceptable <span className="font-normal text-gray-500 block text-xs">Desgaste notable</span></Label>
                  </div>
                </RadioGroup>
              </div>

              {/* NOTES & LOCATION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Notas (Opcional)</Label>
                  <Textarea 
                    placeholder="Ej: Subrayado en pág 10..." 
                    value={conditionNotes} 
                    onChange={(e) => setConditionNotes(e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ubicación</Label>
                  <Input 
                    placeholder="02A" 
                    value={locationCode} 
                    onChange={(e) => setLocationCode(e.target.value.toUpperCase())} 
                    maxLength={3} 
                    className="text-lg font-mono"
                  />
                  <p className="text-xs text-gray-500">Formato: 2 números + 1 letra</p>
                </div>
              </div>

              {/* PRICING */}
              <div className="space-y-3 pt-2 border-t">
                <Label>Precio de Venta (€)</Label>
                {isPriceLoading ? (
                   <div className="text-sm text-gray-500 flex gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Calculando...</div>
                ) : priceData ? (
                  <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <span className="text-sm text-blue-800">Sugerido:</span>
                    <span className="text-xl font-bold text-blue-700">€{priceData.suggestedPrice.toFixed(2)}</span>
                  </div>
                ) : null}

                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="checkbox" 
                    id="manual" 
                    checked={useManualPrice} 
                    onChange={(e) => setUseManualPrice(e.target.checked)} 
                  />
                  <Label htmlFor="manual">Precio Manual</Label>
                </div>
                
                {useManualPrice && (
                  <Input type="number" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
                )}
              </div>

              {/* ACTIONS */}
              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={createItemMutation.isPending} size="lg" className="flex-1">
                  {createItemMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Guardando...</> : 'Catalogar'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation('/triage')} size="lg">Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
