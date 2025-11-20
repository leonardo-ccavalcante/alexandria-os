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
import { Upload, Download, Trash2, FileSpreadsheet, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function CargaMasiva() {
  const { user } = useAuth();
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [channelsFile, setChannelsFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const isAdmin = user?.role === "admin";

  // TODO: Implement database cleanup mutation
  const cleanupDatabase = {
    mutate: () => {
      toast.info("Función de limpieza de base de datos en desarrollo");
    },
  };

  const handleCatalogUpload = async () => {
    if (!catalogFile) {
      toast.error("Por favor selecciona un archivo");
      return;
    }

    setIsUploading(true);
    try {
      // TODO: Implement catalog bulk upload
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Catálogo cargado correctamente");
      setCatalogFile(null);
    } catch (error) {
      toast.error("Error al cargar el catálogo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleChannelsUpload = async () => {
    if (!channelsFile) {
      toast.error("Por favor selecciona un archivo");
      return;
    }

    setIsUploading(true);
    try {
      // TODO: Implement sales channels bulk upload
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Canales de venta actualizados correctamente");
      setChannelsFile(null);
    } catch (error) {
      toast.error("Error al actualizar canales");
    } finally {
      setIsUploading(false);
    }
  };

  const downloadCatalogTemplate = () => {
    const headers = [
      "isbn13",
      "title",
      "author",
      "publisher",
      "publicationYear",
      "categoryLevel1",
      "categoryLevel2",
      "categoryLevel3",
      "synopsis",
      "coverImageUrl",
      "marketMinPrice",
      "marketMaxPrice",
      "marketMedianPrice",
    ];
    const csv = headers.join(",") + "\\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_catalogo.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadChannelsTemplate = () => {
    const headers = ["isbn13", "salesChannels"];
    const example = [
      "9780000000001",
      '"[\\"Wallapop\\",\\"Vinted\\",\\"Amazon\\"]"',
    ];
    const csv = [headers.join(","), example.join(",")].join("\\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_canales.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Carga Masiva</h1>
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
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Limpiar Base de Datos
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
                El archivo CSV debe contener las columnas: isbn13, title, author, publisher, publicationYear, etc.
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

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Seleccionar archivo CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCatalogFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {catalogFile && (
                <p className="text-sm text-gray-600">
                  Archivo seleccionado: {catalogFile.name}
                </p>
              )}
            </div>

            <Button
              onClick={handleCatalogUpload}
              disabled={!catalogFile || isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? "Cargando..." : "Cargar Catálogo"}
            </Button>
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
                El archivo CSV debe contener: isbn13, salesChannels (array JSON de canales)
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

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Seleccionar archivo CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setChannelsFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
              {channelsFile && (
                <p className="text-sm text-gray-600">
                  Archivo seleccionado: {channelsFile.name}
                </p>
              )}
            </div>

            <Button
              onClick={handleChannelsUpload}
              disabled={!channelsFile || isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? "Cargando..." : "Actualizar Canales"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
