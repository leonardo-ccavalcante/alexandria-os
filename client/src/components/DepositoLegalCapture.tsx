import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Camera, Upload, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface DepositoLegalCaptureProps {
  onExtracted: (depositoLegal: string) => void;
}

export function DepositoLegalCapture({ onExtracted }: DepositoLegalCaptureProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const extractDepositoLegalMutation = trpc.triage.extractDepositoLegal.useMutation();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExtract = async () => {
    if (!imageFile) {
      toast.error('Por favor selecciona una imagen');
      return;
    }

    setIsExtracting(true);

    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result as string;
        
        try {
          const result = await extractDepositoLegalMutation.mutateAsync({
            imageBase64: base64Image,
          });

          if (result.depositoLegal) {
            toast.success(`Depósito Legal extraído: ${result.depositoLegal}`);
            onExtracted(result.depositoLegal);
          } else {
            toast.error('No se pudo extraer el Depósito Legal de la imagen');
          }
        } catch (error: any) {
          toast.error(error.message || 'Error al extraer Depósito Legal');
        } finally {
          setIsExtracting(false);
        }
      };
      reader.readAsDataURL(imageFile);
    } catch (error) {
      toast.error('Error al procesar la imagen');
      setIsExtracting(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) {
      toast.error('Por favor ingresa un Depósito Legal');
      return;
    }
    onExtracted(manualInput.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Libros sin ISBN (pre-1970)
        </CardTitle>
        <CardDescription>
          Para libros publicados antes de 1970, captura el número de Depósito Legal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Photo Upload */}
        <div className="space-y-2">
          <Label>Tomar foto del Depósito Legal</Label>
          <div className="flex gap-2">
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="flex-1"
            />
            <Button
              onClick={handleExtract}
              disabled={!imageFile || isExtracting}
              variant="default"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extrayendo...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Extraer
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div className="border rounded-lg p-2">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-48 mx-auto rounded"
            />
          </div>
        )}

        {/* Manual Input */}
        <div className="space-y-2">
          <Label>O ingresa manualmente</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Ej: M-1234-1965"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              variant="outline"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Usar
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          El sistema generará un ISBN sintético (00000XXXXXXXX) para este libro
        </p>
      </CardContent>
    </Card>
  );
}
