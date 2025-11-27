import { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Camera, Upload, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface IsbnImageUploadProps {
  onIsbnExtracted: (isbn: string) => void;
  disabled?: boolean;
}

export function IsbnImageUpload({ onIsbnExtracted, disabled }: IsbnImageUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractIsbnMutation = trpc.triage.extractIsbnFromImage.useMutation();

  const processImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }

    setIsProcessing(true);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1]; // Remove data:image/jpeg;base64, prefix

        try {
          // Call AI extraction API via tRPC
          const result = await extractIsbnMutation.mutateAsync({
            imageBase64: base64Data,
            mimeType: file.type,
          });

          if (result.success && result.isbn) {
            toast.success(`ISBN extraído: ${result.isbn} (${result.confidence} confianza)`);
            onIsbnExtracted(result.isbn);
            clearPreview();
          } else {
            toast.error(result.error || 'No se pudo extraer el ISBN de la imagen');
          }
        } catch (error: any) {
          toast.error(error.message || 'Error al extraer ISBN de la imagen');
        }
      };

      reader.onerror = () => {
        toast.error('Error al leer la imagen');
      };
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('Error al procesar la imagen');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      processImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!previewUrl ? (
        <>
          {/* Drag and Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={!disabled ? handleUploadClick : undefined}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              Arrastra una imagen aquí
            </p>
            <p className="text-sm text-gray-500 mb-4">
              o haz clic para seleccionar una foto del libro
            </p>
            <p className="text-xs text-gray-400">
              La IA extraerá automáticamente el ISBN de la imagen
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleCameraCapture}
              disabled={disabled || isProcessing}
              variant="outline"
              className="flex-1"
              size="lg"
            >
              <Camera className="h-5 w-5 mr-2" />
              Tomar Foto
            </Button>
            <Button
              onClick={handleUploadClick}
              disabled={disabled || isProcessing}
              variant="outline"
              className="flex-1"
              size="lg"
            >
              <Upload className="h-5 w-5 mr-2" />
              Subir Imagen
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Image Preview */}
          <div className="relative">
            <img
              src={previewUrl}
              alt="Book cover"
              className="w-full max-h-64 object-contain rounded-lg border-2 border-gray-300"
            />
            {!isProcessing && (
              <Button
                onClick={clearPreview}
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                <div className="text-center text-white">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Extrayendo ISBN con IA...</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
