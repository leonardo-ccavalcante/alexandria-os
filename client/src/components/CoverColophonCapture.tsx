import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { BookOpen, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface CoverColophonCaptureProps {
  onExtracted: (bookData: {
    title: string;
    author?: string;
    publisher?: string;
    publicationYear?: number;
  }) => void;
}

export function CoverColophonCapture({ onExtracted }: CoverColophonCaptureProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const extractBookMetadataMutation = trpc.triage.extractBookMetadata.useMutation();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        // Auto-extract when image is loaded
        extractMetadata(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const extractMetadata = async (base64Image: string) => {
    setIsExtracting(true);

    try {
      const result = await extractBookMetadataMutation.mutateAsync({
        imageBase64: base64Image,
      });

      if (result.title) {
        toast.success(`Libro identificado: ${result.title}`);
        onExtracted({
          title: result.title,
          author: result.author,
          publisher: result.publisher,
          publicationYear: result.publicationYear,
        });
      } else {
        toast.error('No se pudo extraer información del libro');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al extraer metadata');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Libros sin ISBN
        </CardTitle>
        <CardDescription>
          Para libros muy antiguos (pre-1900) o sin ISBN, captura la portada o colofón
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Photo Upload */}
        <div className="space-y-2">
          <Label>Tomar foto de la portada o colofón</Label>
          <div className="relative">
            <input
              id="cover-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              disabled={isExtracting}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isExtracting}
              onClick={() => document.getElementById('cover-photo-input')?.click()}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extrayendo información...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Tomar Foto
                </>
              )}
            </Button>
          </div>
          {imageFile && (
            <p className="text-sm text-muted-foreground">
              {imageFile.name}
            </p>
          )}
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

        <p className="text-xs text-muted-foreground">
          El sistema extraerá automáticamente el título, autor, editorial y año de publicación
        </p>
      </CardContent>
    </Card>
  );
}
