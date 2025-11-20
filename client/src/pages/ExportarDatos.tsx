import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function ExportarDatos() {
  const [filters, setFilters] = useState({
    searchQuery: "",
    publisher: "",
    author: "",
    yearFrom: "",
    yearTo: "",
    hideWithoutLocation: false,
    hideWithoutQuantity: false,
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // TODO: Implement CSV export with filters
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Placeholder: Generate sample CSV
      const headers = [
        "ISBN",
        "Título",
        "Autor",
        "Editorial",
        "Año",
        "Ubicación",
        "Disponible",
        "Total",
        "Canales de Venta",
      ];
      const csv = headers.join(",") + "\\n";
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventario_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success("Inventario exportado correctamente");
    } catch (error) {
      toast.error("Error al exportar inventario");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Exportar Datos</h1>
          <p className="text-gray-600">
            Exporta el inventario completo o filtrado a CSV
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Configurar Exportación
            </CardTitle>
            <CardDescription>
              Aplica filtros personalizados antes de exportar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search Filters */}
            <div className="space-y-4">
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
                    placeholder="2000"
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
                    placeholder="2024"
                    value={filters.yearTo}
                    onChange={(e) =>
                      setFilters({ ...filters, yearTo: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hideWithoutLocation"
                  checked={filters.hideWithoutLocation}
                  onCheckedChange={(checked) =>
                    setFilters({
                      ...filters,
                      hideWithoutLocation: checked === true,
                    })
                  }
                />
                <Label htmlFor="hideWithoutLocation" className="cursor-pointer">
                  Ocultar libros sin ubicación
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hideWithoutQuantity"
                  checked={filters.hideWithoutQuantity}
                  onCheckedChange={(checked) =>
                    setFilters({
                      ...filters,
                      hideWithoutQuantity: checked === true,
                    })
                  }
                />
                <Label htmlFor="hideWithoutQuantity" className="cursor-pointer">
                  Ocultar libros sin cantidad disponible
                </Label>
              </div>
            </div>

            {/* Export Button */}
            <div className="pt-4">
              <Button
                onClick={handleExport}
                disabled={isExporting}
                size="lg"
                className="w-full md:w-auto"
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exportando..." : "Exportar a CSV"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
