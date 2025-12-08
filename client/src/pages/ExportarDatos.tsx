import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type ExportPlatform = "general" | "iberlibro" | "casadellibro" | "todocoleccion" | "ebay";

export default function ExportarDatos() {
  const [filters, setFilters] = useState({
    searchQuery: "",
    publisher: "",
    author: "",
    yearFrom: "",
    yearTo: "",
  });

  const [selectedPlatform, setSelectedPlatform] = useState<ExportPlatform>("general");
  const [isExporting, setIsExporting] = useState(false);

  // Export mutations
  const exportCsvMutation = trpc.batch.exportToCsv.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventario_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(`Inventario exportado correctamente`);
      setIsExporting(false);
    },
    onError: (error) => {
      toast.error(`Error al exportar inventario: ${error.message}`);
      setIsExporting(false);
    },
  });

  const exportIberlibroMutation = trpc.batch.exportToIberlibro.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.tsv], { type: "text/tab-separated-values;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iberlibro_${new Date().toISOString().split("T")[0]}.tsv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(`Iberlibro: ${data.stats.totalItems} libros exportados (${data.stats.withPrice} con precio)`);
      setIsExporting(false);
    },
    onError: (error) => {
      toast.error(`Error al exportar a Iberlibro: ${error.message}`);
      setIsExporting(false);
    },
  });

  const exportCasaDelLibroMutation = trpc.batch.exportToCasaDelLibro.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `casadellibro_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      const materiaInfo = data.stats.withMateriaCode 
        ? `, ${data.stats.withMateriaCode} con código Materia`
        : '';
      toast.success(`Casa del Libro: ${data.stats.totalItems} libros exportados (${data.stats.withPrice} con precio${materiaInfo})`);
      setIsExporting(false);
    },
    onError: (error) => {
      toast.error(`Error al exportar a Casa del Libro: ${error.message}`);
      setIsExporting(false);
    },
  });

  const exportTodocoleccionMutation = trpc.batch.exportToTodocoleccion.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todocoleccion_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(`Todocolección: ${data.stats.totalItems} libros exportados (${data.stats.withPrice} con precio)`);
      setIsExporting(false);
    },
    onError: (error) => {
      toast.error(`Error al exportar a Todocolección: ${error.message}`);
      setIsExporting(false);
    },
  });

  const exportEbayMutation = trpc.batch.exportToEbay.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ebay_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(`eBay: ${data.stats.totalItems} libros exportados (${data.stats.withPrice} con precio, ${data.stats.withISBN} con ISBN)`);
      setIsExporting(false);
    },
    onError: (error) => {
      toast.error(`Error al exportar a eBay: ${error.message}`);
      setIsExporting(false);
    },
  });

  const handleExport = async () => {
    setIsExporting(true);

    const filterParams = {
      searchTerm: filters.searchQuery || undefined,
      publisher: filters.publisher || undefined,
      author: filters.author || undefined,
      yearFrom: filters.yearFrom ? parseInt(filters.yearFrom) : undefined,
      yearTo: filters.yearTo ? parseInt(filters.yearTo) : undefined,
    };

    try {
      switch (selectedPlatform) {
        case "iberlibro":
          exportIberlibroMutation.mutate({ filters: filterParams });
          break;
        
        case "casadellibro":
          exportCasaDelLibroMutation.mutate({ filters: filterParams });
          break;
        
        case "todocoleccion":
          exportTodocoleccionMutation.mutate({ filters: filterParams });
          break;
        
        case "ebay":
          exportEbayMutation.mutate({ filters: filterParams });
          break;
        
        case "general":
        default:
          exportCsvMutation.mutate({ filters: filterParams });
          break;
      }
    } catch (error) {
      toast.error("Error al exportar inventario");
      setIsExporting(false);
    }
  };

  const getPlatformInfo = () => {
    switch (selectedPlatform) {
      case "iberlibro":
        return {
          name: "Iberlibro/AbeBooks",
          format: "TSV (Tab-separated)",
          columns: "30 columnas en inglés",
          description: "Formato compatible con Iberlibro y AbeBooks marketplace",
        };
      case "casadellibro":
        return {
          name: "Casa del Libro",
          format: "CSV (Semicolon-separated)",
          columns: "27 columnas con códigos Materia",
          description: "Formato para Materico Marketplace de Casa del Libro",
        };
      case "todocoleccion":
        return {
          name: "Todocolección",
          format: "CSV (Comma-separated)",
          columns: "11 columnas en español",
          description: "Formato compatible con Todocolección Importamatic",
        };
      case "ebay":
        return {
          name: "eBay",
          format: "CSV (Comma-separated)",
          columns: "19 columnas File Exchange",
          description: "Formato compatible con eBay File Exchange (títulos 80 caracteres, item specifics)",
        };
      case "general":
      default:
        return {
          name: "Inventario General",
          format: "CSV (Comma-separated)",
          columns: "Columnas estándar con precios",
          description: "Exportación general del inventario completo",
        };
    }
  };

  const platformInfo = getPlatformInfo();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Exportar Datos</h1>
          <p className="text-gray-600">
            Exporta el inventario completo o filtrado a diferentes plataformas
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Configurar Exportación
            </CardTitle>
            <CardDescription>
              Selecciona la plataforma y aplica filtros personalizados antes de exportar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Platform Selector */}
            <div className="space-y-2">
              <Label htmlFor="platform">Plataforma de Exportación</Label>
              <Select
                value={selectedPlatform}
                onValueChange={(value) => setSelectedPlatform(value as ExportPlatform)}
              >
                <SelectTrigger id="platform" className="w-full">
                  <SelectValue placeholder="Selecciona una plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Inventario General</span>
                      <span className="text-xs text-gray-500">CSV básico para uso general</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="iberlibro">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Iberlibro/AbeBooks</span>
                      <span className="text-xs text-gray-500">TSV con 30 columnas en inglés</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="casadellibro">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Casa del Libro</span>
                      <span className="text-xs text-gray-500">CSV con 27 columnas (Materico)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="todocoleccion">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Todocolección</span>
                      <span className="text-xs text-gray-500">CSV con 11 columnas en español</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ebay">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">eBay</span>
                      <span className="text-xs text-gray-500">CSV File Exchange con 19 columnas</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {/* Platform Info Box */}
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm font-medium text-blue-900">{platformInfo.name}</p>
                <div className="mt-1 text-xs text-blue-700 space-y-1">
                  <p>• <span className="font-medium">Formato:</span> {platformInfo.format}</p>
                  <p>• <span className="font-medium">Columnas:</span> {platformInfo.columns}</p>
                  <p>• {platformInfo.description}</p>
                </div>
              </div>
            </div>

            {/* Filters Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium">Filtros de Búsqueda (Opcional)</h3>
              
              <div>
                <Label htmlFor="searchQuery">Búsqueda</Label>
                <Input
                  id="searchQuery"
                  placeholder="Buscar por título, autor, ISBN..."
                  value={filters.searchQuery}
                  onChange={(e) =>
                    setFilters({ ...filters, searchQuery: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="publisher">Editorial</Label>
                  <Input
                    id="publisher"
                    placeholder="Filtrar por editorial..."
                    value={filters.publisher}
                    onChange={(e) =>
                      setFilters({ ...filters, publisher: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="author">Autor</Label>
                  <Input
                    id="author"
                    placeholder="Filtrar por autor..."
                    value={filters.author}
                    onChange={(e) =>
                      setFilters({ ...filters, author: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="yearFrom">Año desde</Label>
                  <Input
                    id="yearFrom"
                    type="number"
                    placeholder="1900"
                    value={filters.yearFrom}
                    onChange={(e) =>
                      setFilters({ ...filters, yearFrom: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="yearTo">Año hasta</Label>
                  <Input
                    id="yearTo"
                    type="number"
                    placeholder="2025"
                    value={filters.yearTo}
                    onChange={(e) =>
                      setFilters({ ...filters, yearTo: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Export Button */}
            <div className="pt-4 border-t">
              <Button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar {platformInfo.name}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
