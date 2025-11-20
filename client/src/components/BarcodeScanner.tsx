import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from './ui/button';
import { Camera, CameraOff } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (isbn: string) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
}

export function BarcodeScanner({ onScan, isScanning, setIsScanning }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isScanning) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isScanning]);

  const startScanning = async () => {
    try {
      setError(null);
      const scanner = new Html5Qrcode('barcode-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanning();
          setIsScanning(false);
        },
        (errorMessage) => {
          // Ignore continuous scanning errors
        }
      );
    } catch (err: any) {
      setError('Error al iniciar la cámara: ' + err.message);
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        // Ignore stop errors
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Button
          onClick={() => setIsScanning(!isScanning)}
          variant={isScanning ? 'destructive' : 'default'}
          size="lg"
        >
          {isScanning ? (
            <>
              <CameraOff className="mr-2 h-5 w-5" />
              Detener Escáner
            </>
          ) : (
            <>
              <Camera className="mr-2 h-5 w-5" />
              Escanear Código de Barras
            </>
          )}
        </Button>
      </div>

      {isScanning && (
        <div className="relative">
          <div id="barcode-reader" className="w-full max-w-md mx-auto rounded-lg overflow-hidden" />
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
