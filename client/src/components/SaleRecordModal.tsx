import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DollarSign } from "lucide-react";

interface SaleRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: {
    isbn13: string;
    title: string;
    author: string | null;
    listingPrice: number | null;
  };
  availableChannels: string[];
  onConfirm: (data: { channel: string; salePrice: number }) => Promise<void>;
}

export function SaleRecordModal({
  open,
  onOpenChange,
  book,
  availableChannels,
  onConfirm,
}: SaleRecordModalProps) {
  const [channel, setChannel] = useState<string>("");
  const [salePrice, setSalePrice] = useState<string>(book.listingPrice?.toString() || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!channel || !salePrice) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        channel,
        salePrice: parseFloat(salePrice),
      });
      onOpenChange(false);
      // Reset form
      setChannel("");
      setSalePrice("");
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Registrar Venta
          </DialogTitle>
          <DialogDescription>
            Registra la venta de "{book.title}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Book Info */}
          <div className="p-3 bg-accent/50 rounded-lg space-y-1">
            <p className="font-medium text-sm">{book.title}</p>
            {book.author && (
              <p className="text-sm text-muted-foreground">{book.author}</p>
            )}
            <p className="text-xs text-muted-foreground">ISBN: {book.isbn13}</p>
          </div>

          {/* Channel Selection */}
          <div className="space-y-2">
            <Label htmlFor="channel">Canal de Venta *</Label>
            {availableChannels.length === 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  ⚠️ No hay canales configurados. Ve a Configuración para seleccionar tus canales de venta.
                </p>
              </div>
            ) : (
              <Select value={channel} onValueChange={setChannel} required>
                <SelectTrigger id="channel">
                  <SelectValue placeholder="Selecciona un canal" />
                </SelectTrigger>
                <SelectContent>
                  {availableChannels.map(ch => (
                    <SelectItem key={ch} value={ch}>
                      {ch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Sale Price */}
          <div className="space-y-2">
            <Label htmlFor="salePrice">Precio de Venta (€) *</Label>
            <Input
              id="salePrice"
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
              required
            />
            {book.listingPrice && parseFloat(salePrice) !== book.listingPrice && (
              <p className="text-xs text-muted-foreground">
                Precio de lista: €{book.listingPrice.toFixed(2)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !channel || !salePrice || availableChannels.length === 0}
              className="shadow-elegant hover:scale-105 transition-transform"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Venta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
