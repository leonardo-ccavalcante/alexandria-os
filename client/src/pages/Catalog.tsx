import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Package, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function Catalog() {
  const [, setLocation] = useLocation();
  const [isbn, setIsbn] = useState('');
  const [condition, setCondition] = useState<'COMO_NUEVO' | 'BUENO' | 'ACEPTABLE'>('BUENO');
  const [conditionNotes, setConditionNotes] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [createdItem, setCreatedItem] = useState<any>(null);

  // Get ISBN from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isbnParam = params.get('isbn');
    if (isbnParam) {
      setIsbn(isbnParam);
    }
  }, []);

  // Fetch suggested price
  const { data: priceData, isLoading: isPriceLoading } = trpc.catalog.calculatePrice.useQuery(
    { isbn, condition },
    { enabled: !!isbn }
  );

  const createItemMutation = trpc.catalog.createItem.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isbn) {
      toast.error('ISBN es requerido');
      return;
    }

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
    setLocation('/triage');
  };

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
                  <h2 className="text-3xl font-bold mb-2 text-green-700">
                    ✅ Libro Catalogado
                  </h2>
                  <p className="text-lg text-gray-700">
                    El libro ha sido añadido al inventario
                  </p>
                </div>

                <div className="bg-white rounded-lg p-6 text-left space-y-3">
                  <div className="text-center mb-4">
                    <div className="text-sm text-gray-500">UUID para Etiqueta</div>
                    <div className="text-2xl font-mono font-bold text-blue-600">
                      {createdItem.uuid}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                    <div>
                      <span className="font-semibold">ISBN:</span> {createdItem.isbn13}
                    </div>
                    <div>
                      <span className="font-semibold">Condición:</span> {createdItem.conditionGrade}
                    </div>
                    <div>
                      <span className="font-semibold">Ubicación:</span> {createdItem.locationCode}
                    </div>
                    <div>
                      <span className="font-semibold">Precio:</span> €{parseFloat(createdItem.listingPrice).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 justify-center">
                  <Button onClick={handleReset} size="lg">
                    Catalogar Otro Libro
                  </Button>
                  <Button onClick={() => setLocation('/inventory')} variant="outline" size="lg">
                    Ver Inventario
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
              Asigna condición, ubicación y precio al libro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ISBN (readonly) */}
              <div className="space-y-2">
                <Label>ISBN</Label>
                <Input
                  type="text"
                  value={isbn}
                  readOnly
                  className="bg-gray-100 font-mono"
                />
              </div>

              {/* Condition */}
              <div className="space-y-3">
                <Label>Condición del Libro</Label>
                <RadioGroup value={condition} onValueChange={(value: any) => setCondition(value)}>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                    <RadioGroupItem value="COMO_NUEVO" id="como_nuevo" />
                    <Label htmlFor="como_nuevo" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Como Nuevo</div>
                      <div className="text-sm text-gray-500">95-100% - Sin defectos visibles</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                    <RadioGroupItem value="BUENO" id="bueno" />
                    <Label htmlFor="bueno" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Bueno</div>
                      <div className="text-sm text-gray-500">70-94% - Desgaste leve</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                    <RadioGroupItem value="ACEPTABLE" id="aceptable" />
                    <Label htmlFor="aceptable" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Aceptable</div>
                      <div className="text-sm text-gray-500">50-69% - Desgaste notable</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Condition Notes */}
              <div className="space-y-2">
                <Label>Notas de Condición (Opcional)</Label>
                <Textarea
                  placeholder="Ej: Página 45 doblada, subrayado en página 120"
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Location Code */}
              <div className="space-y-2">
                <Label>Código de Ubicación</Label>
                <Input
                  type="text"
                  placeholder="Ej: 02A, 15C"
                  value={locationCode}
                  onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
                  maxLength={3}
                  className="font-mono text-lg"
                />
                <p className="text-sm text-gray-500">
                  Formato: 2 dígitos + 1 letra (Ej: 02A)
                </p>
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <Label>Precio de Venta</Label>
                
                {isPriceLoading ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculando precio sugerido...
                  </div>
                ) : priceData ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Precio Sugerido:</span>
                      <span className="text-2xl font-bold text-blue-600">
                        €{priceData.suggestedPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Precio base: €{priceData.basePrice.toFixed(2)}</div>
                      <div>Modificador ({condition}): {(priceData.modifier * 100).toFixed(0)}%</div>
                      <div>Margen adicional: €{priceData.padding.toFixed(2)}</div>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="manual-price"
                    checked={useManualPrice}
                    onChange={(e) => setUseManualPrice(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="manual-price" className="cursor-pointer">
                    Usar precio manual
                  </Label>
                </div>

                {useManualPrice && (
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Precio manual"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                  />
                )}
              </div>

              {/* Submit */}
              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={createItemMutation.isPending}
                  size="lg"
                  className="flex-1"
                >
                  {createItemMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Catalogar Libro'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation('/triage')}
                  size="lg"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
