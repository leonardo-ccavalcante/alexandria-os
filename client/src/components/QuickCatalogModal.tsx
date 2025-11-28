import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Textarea } from './ui/textarea';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface QuickCatalogModalProps {
  open: boolean;
  onClose: () => void;
  onCatalogComplete?: () => void;
  isbn: string;
  bookData: any;
  suggestedPrice?: number;
  isDuplicate?: boolean;
  suggestedAllocation?: string | null;
  existingCount?: number;
}

export function QuickCatalogModal({ open, onClose, onCatalogComplete, isbn, bookData, suggestedPrice, isDuplicate, suggestedAllocation, existingCount }: QuickCatalogModalProps) {
  const [condition, setCondition] = useState<'COMO_NUEVO' | 'BUENO' | 'ACEPTABLE'>('BUENO');
  const [conditionNotes, setConditionNotes] = useState('');
  const [locationCode, setLocationCode] = useState(suggestedAllocation || '');
  const [listingPrice, setListingPrice] = useState(suggestedPrice?.toFixed(2) || '');
  const [success, setSuccess] = useState(false);
  const [createdItem, setCreatedItem] = useState<any>(null);

  const createItemMutation = trpc.catalog.createItem.useMutation();

  // Fetch suggested price based on condition
  const { data: priceData } = trpc.catalog.calculatePrice.useQuery(
    { isbn, condition },
    { enabled: !!isbn }
  );

  // Update listing price when condition changes
  useState(() => {
    if (priceData?.suggestedPrice) {
      setListingPrice(priceData.suggestedPrice.toFixed(2));
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!locationCode || !/^[0-9]{2}[A-Z]$/.test(locationCode)) {
      toast.error('Código de ubicación inválido. Formato: 02A');
      return;
    }

    try {
      const result = await createItemMutation.mutateAsync({
        isbn13: isbn,
        conditionGrade: condition,
        conditionNotes: conditionNotes || undefined,
        locationCode: locationCode.toUpperCase(),
        listingPrice: listingPrice,
      });

      setCreatedItem(result.item);
      setSuccess(true);
      toast.success('¡Libro catalogado exitosamente!');
    } catch (error: any) {
      toast.error(error.message || 'Error al catalogar libro');
    }
  };

  const handleClose = () => {
    const wasSuccess = success;
    setSuccess(false);
    setCreatedItem(null);
    setCondition('BUENO');
    setConditionNotes('');
    setLocationCode('');
    setListingPrice(suggestedPrice?.toFixed(2) || '');
    onClose();
    // If closing after successful catalog, trigger complete reset
    if (wasSuccess && onCatalogComplete) {
      onCatalogComplete();
    }
  };

  if (success && createdItem) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl text-green-600">
              ✅ Libro Catalogado
            </DialogTitle>
            <DialogDescription className="text-center">
              El libro ha sido añadido al inventario
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="text-center">
                <div className="text-xs text-gray-500">UUID para Etiqueta</div>
                <div className="text-lg font-mono font-bold text-blue-600">
                  {createdItem.uuid}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                <div>
                  <span className="font-semibold">Condición:</span> {createdItem.conditionGrade}
                </div>
                <div>
                  <span className="font-semibold">Ubicación:</span> {createdItem.locationCode}
                </div>
                <div className="col-span-2">
                  <span className="font-semibold">Precio:</span> €{parseFloat(createdItem.listingPrice).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleClose} className="flex-1">
                Catalogar Otro
              </Button>
              <Button 
                onClick={() => window.location.href = '/inventario'} 
                variant="outline" 
                className="flex-1"
              >
                Ver Inventario
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catalogar Libro Rápidamente</DialogTitle>
          <DialogDescription>
            {isDuplicate && (
              <div className="mt-2 bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3">
                <p className="text-sm font-semibold text-yellow-900">
                  ⚠️ Libro Duplicado - Ya existen {existingCount} unidad(es) en inventario
                </p>
                <p className="text-xs text-yellow-800 mt-1">
                  Se agregará una nueva unidad con la ubicación sugerida. Puedes cambiarla si lo deseas.
                </p>
              </div>
            )}
            {bookData && (
              <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex gap-3">
                  {bookData.coverImageUrl && (
                    <img
                      src={bookData.coverImageUrl}
                      alt={bookData.title}
                      className="w-16 h-20 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gray-900 truncate">{bookData.title}</h3>
                    <p className="text-xs text-gray-600 truncate">{bookData.author}</p>
                    <p className="text-xs text-gray-500">ISBN: {bookData.isbn13}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Condition */}
          <div className="space-y-2">
            <Label>Condición del Libro</Label>
            <RadioGroup value={condition} onValueChange={(v) => setCondition(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="COMO_NUEVO" id="como-nuevo" />
                <Label htmlFor="como-nuevo" className="cursor-pointer">Como Nuevo</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="BUENO" id="bueno" />
                <Label htmlFor="bueno" className="cursor-pointer">Bueno</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ACEPTABLE" id="aceptable" />
                <Label htmlFor="aceptable" className="cursor-pointer">Aceptable</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Condition Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas de Condición (Opcional)</Label>
            <Textarea
              id="notes"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              placeholder="Ej: Lomo desgastado, páginas amarillentas..."
              rows={2}
            />
          </div>

          {/* Location Code */}
          <div className="space-y-2">
            <Label htmlFor="location">Código de Ubicación *</Label>
            <Input
              id="location"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              placeholder="Ej: 02A"
              maxLength={3}
              required
            />
            <p className="text-xs text-gray-500">Formato: 02A (2 dígitos + 1 letra)</p>
          </div>

          {/* Listing Price */}
          <div className="space-y-2">
            <Label htmlFor="price">Precio de Venta (€) *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              placeholder="0.00"
              required
            />
            {priceData && (
              <p className="text-xs text-gray-500">
                Precio sugerido: €{priceData.suggestedPrice.toFixed(2)}
              </p>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={createItemMutation.isPending} className="flex-1">
              {createItemMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Catalogando...
                </>
              ) : (
                'Catalogar'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
