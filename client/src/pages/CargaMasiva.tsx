import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, Download, Trash2, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type UploadResult = {
  imported?: number;
  updated?: number;
  skipped: number;
  errors: string[];
};

export default function CargaMasiva() {
  const { user } = useAuth();
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [channelsFile, setChannelsFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [catalogResult, setCatalogResult] = useState<UploadResult | null>(null);
  const [channelsResult, setChannelsResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState<'catalog' | 'channels' | null>(null);

  const isAdmin = user?.role === "admin";

  const cleanupDatabase = trpc.batch.cleanupDatabase.useMutation({
    onSuccess: () => {
      toast.success('Base de datos limpiada correctamente');
      setCatalogResult(null);
      setChannelsResult(null);
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  const importCatalog = trpc.batch.importCatalogFromCsv.useMutation({
    onSuccess: (result: { imported: number; skipped: number; errors: string[] }) => {
      setCatalogResult(result);
      toast.success(`Importación completada: ${result.imported} libros importados`);
      setCatalogFile(null);
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast.error(`Error al importar catálogo: ${error.message}`);
      setIsUploading(false);
    },
  });
  
  const importChannels = trpc.batch.importSalesChannelsFromCsv.useMutation({
    onSuccess: (result: { updated: number; skipped: number; errors: string[] }) => {
      setChannelsResult(result);
      toast.success(`Canales actualizados: ${result.updated} libros`);
      setChannelsFile(null);
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast.error(`Error al importar canales: ${error.message}`);
      setIsUploading(false);
    },
  });

  const handleCatalogUpload = async () => {
    if (!catalogFile) {
      toast.error("Por favor selecciona un archivo");
      return;
    }

    setIsUploading(true);
    setCatalogResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvData = e.target?.result as string;
      importCatalog.mutate({ csvData });
    };
    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setIsUploading(false);
    };
    reader.readAsText(catalogFile);
  };

  const handleChannelsUpload = async () => {
    if (!channelsFile) {
      toast.error("Por favor selecciona un archivo");
      return;
    }

    setIsUploading(true);
    setChannelsResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvData = e.target?.result as string;
      importChannels.mutate({ csvData });
    };
    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setIsUploading(false);
    };
    reader.readAsText(channelsFile);
  };

  const handleDrag = (e: React.DragEvent, type: 'catalog' | 'channels') => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(type);
    } else if (e.type === "dragleave") {
      setDragActive(null);
    }
  };

  const handleDrop = (e: React.DragEvent, type: 'catalog' | 'channels') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        if (type === 'catalog') {
          setCatalogFile(file);
        } else {
          setChannelsFile(file);
        }
      } else {
        toast.error('Por favor selecciona un archivo CSV');
      }
    }
  };

  const downloadCatalogTemplate = () => {
    const headers = [
      "ISBN",
      "Título",
      "Autor",
      "Editorial",
      "Año",
      "Categoría",
      "Sinopsis",
      "Páginas",
      "Edición",
      "Idioma",
      "Cantidad",
      "Ubicación",
      "Precio",
    ];
    const example = [
      "9780061120084",
      "To Kill a Mockingbird",
      "Harper Lee",
      "Harper Perennial",
      "1960",
      "Fiction",
      "A classic novel about racial injustice",
      "324",
      "1st Edition",
      "EN",
      "5",
      "01A",
      "12.50",
    ];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_catalogo.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadChannelsTemplate = () => {
    const headers = ["UUID", "Canales"];
    const example = [
      "550e8400-e29b-41d4-a716-446655440000",
      "Wallapop;Vinted;Amazon",
    ];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_canales.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ResultDisplay = ({ result, type }: { result: UploadResult; type: 'catalog' | 'channels' }) => {
    const successCount = result.imported || result.updated || 0;
    const hasErrors = result.errors.length > 0;
    
    return (
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              {type === 'catalog' ? 'Importados' : 'Actualizados'}: {successCount}
            </span>
          </div>
          {result.skipped > 0 && (
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Omitidos: {result.skipped}</span>
            </div>
          )}
          {hasErrors && (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Errores: {result.errors.length}</span>
            </div>
          )}
        </div>
        
        {hasErrors && (
          <div className="border border-red-200 rounded-lg p-4 bg-red-50 max-h-60 overflow-y-auto">
            <h4 className="font-medium text-red-900 mb-2">Detalles de errores:</h4>
            <ul className="space-y-1 text-sm text-red-800">
              {result.errors.slice(0, 10).map((error, idx) => (
                <li key={idx} className="font-mono">{error}</li>
              ))}
              {result.errors.length > 10 && (
                <li className="text-red-600 font-medium">
                  ... y {result.errors.length - 10} errores más
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-3 md:px-4 py-4 md:py-8">
        <div className="mb-4 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Carga Masiva</h1>
          <p className="text-gray-600">
            Actualiza múltiples libros a la vez mediante archivos CSV
          </p>
        </div>

        {/* Admin Only: Database Cleanup */}
        {isAdmin && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <Trash2 className="h-5 w-5" />
                Limpieza de Base de Datos (Solo Administrador)
              </CardTitle>
              <CardDescription>
                Elimina todos los datos de catálogo e inventario. Esta acción NO se puede deshacer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={cleanupDatabase.isPending}>
                    {cleanupDatabase.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Limpiando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Limpiar Base de Datos
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción eliminará permanentemente todos los datos de catálogo e inventario.
                      Esta acción NO se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cleanupDatabase.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Sí, eliminar todos los datos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {/* Catalog Bulk Upload */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Carga Masiva de Catálogo
            </CardTitle>
            <CardDescription>
              Importa información de libros desde un archivo CSV
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                El archivo CSV debe contener: ISBN, Título, Autor, Editorial, Año, Categoría, Sinopsis, Páginas, Edición, Idioma, Cantidad, Ubicación, Precio (opcional)
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={downloadCatalogTemplate}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla
              </Button>
            </div>

            {/* Drag and Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive === 'catalog'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              onDragEnter={(e) => handleDrag(e, 'catalog')}
              onDragLeave={(e) => handleDrag(e, 'catalog')}
              onDragOver={(e) => handleDrag(e, 'catalog')}
              onDrop={(e) => handleDrop(e, 'catalog')}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Arrastra tu archivo CSV aquí
              </p>
              <p className="text-sm text-gray-500 mb-4">o</p>
              <label className="cursor-pointer">
                <span className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  Seleccionar archivo
                </span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCatalogFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              {catalogFile && (
                <p className="mt-4 text-sm text-green-600 font-medium">
                  ✓ Archivo seleccionado: {catalogFile.name}
                </p>
              )}
            </div>

            <Button
              onClick={handleCatalogUpload}
              disabled={!catalogFile || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Cargar Catálogo
                </>
              )}
            </Button>

            {catalogResult && <ResultDisplay result={catalogResult} type="catalog" />}
          </CardContent>
        </Card>

        {/* Sales Channels Bulk Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Carga Masiva de Canales de Venta
            </CardTitle>
            <CardDescription>
              Actualiza los canales de venta para múltiples libros
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                El archivo CSV debe contener: UUID, Canales (separados por punto y coma)
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={downloadChannelsTemplate}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla
              </Button>
            </div>

            {/* Drag and Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive === 'channels'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              onDragEnter={(e) => handleDrag(e, 'channels')}
              onDragLeave={(e) => handleDrag(e, 'channels')}
              onDragOver={(e) => handleDrag(e, 'channels')}
              onDrop={(e) => handleDrop(e, 'channels')}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Arrastra tu archivo CSV aquí
              </p>
              <p className="text-sm text-gray-500 mb-4">o</p>
              <label className="cursor-pointer">
                <span className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  Seleccionar archivo
                </span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setChannelsFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              {channelsFile && (
                <p className="mt-4 text-sm text-green-600 font-medium">
                  ✓ Archivo seleccionado: {channelsFile.name}
                </p>
              )}
            </div>

            <Button
              onClick={handleChannelsUpload}
              disabled={!channelsFile || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Actualizar Canales
                </>
              )}
            </Button>

            {channelsResult && <ResultDisplay result={channelsResult} type="channels" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
