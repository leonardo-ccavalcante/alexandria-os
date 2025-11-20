import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Grid3x3, List, Plus, Minus, MapPin, Package } from "lucide-react";
import { toast } from "sonner";

export default function InventoryNew() {
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [publisherFilter, setPublisherFilter] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [includeZeroInventory, setIncludeZeroInventory] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  // Fetch grouped inventory
  const { data: inventoryResponse, isLoading, refetch } = trpc.inventory.getGroupedByIsbn.useQuery({
    searchText: searchText || undefined,
    categoryLevel1: categoryFilter || undefined,
    publisher: publisherFilter || undefined,
    yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
    yearTo: yearTo ? parseInt(yearTo) : undefined,
    includeZeroInventory,
    limit: 100,
    offset: 0,
  });
  
  const books = inventoryResponse?.items || [];

  // Mutations
  const addQuantityMutation = trpc.inventory.addQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cantidad aumentada");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const removeQuantityMutation = trpc.inventory.removeQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cantidad reducida");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleAddQuantity = (isbn13: string) => {
    const quantity = prompt("¿Cuántas copias desea agregar?", "1");
    if (quantity && parseInt(quantity) > 0) {
      addQuantityMutation.mutate({
        isbn13,
        quantity: parseInt(quantity),
        condition: "BUENO",
      });
    }
  };

  const handleRemoveQuantity = (isbn13: string, availableQty: number) => {
    if (availableQty === 0) {
      toast.error("No hay copias disponibles para eliminar");
      return;
    }
    const quantity = prompt(`¿Cuántas copias desea eliminar? (Disponibles: ${availableQty})`, "1");
    if (quantity && parseInt(quantity) > 0 && parseInt(quantity) <= availableQty) {
      removeQuantityMutation.mutate({
        isbn13,
        quantity: parseInt(quantity),
        reason: "DONATED",
      });
    }
  };

  const handleExportCSV = () => {
    if (!books || books.length === 0) {
      toast.error("No hay datos para exportar");
      return;
    }

    const headers = ["ISBN", "Título", "Autor", "Editorial", "Año", "Categoría", "Cantidad Total", "Disponible", "Ubicaciones"];
    const rows = books.map(book => [
      book.isbn13,
      book.title,
      book.author,
      book.publisher || "",
      book.publicationYear || "",
      book.categoryLevel1 || "",
      book.totalQuantity,
      book.availableQuantity,
      book.locations.join("; ")
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inventario_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("CSV exportado");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold">Inventario</h1>
          </div>
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="max-w-7xl mx-auto mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por título, autor, ISBN..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Input
                placeholder="Editorial"
                value={publisherFilter}
                onChange={(e) => setPublisherFilter(e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Año desde"
                  type="number"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-1/2"
                />
                <Input
                  placeholder="Año hasta"
                  type="number"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="w-1/2"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeZeroInventory}
                    onChange={(e) => setIncludeZeroInventory(e.target.checked)}
                    className="rounded"
                  />
                  Mostrar libros sin inventario (solo catálogo)
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={viewMode === "card" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("card")}
                >
                  <Grid3x3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando inventario...</p>
          </div>
        ) : !books || books.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No se encontraron libros</p>
            </CardContent>
          </Card>
        ) : viewMode === "card" ? (
          <div className="grid grid-cols-1 gap-4">
            {books.map((book) => (
              <Card key={book.isbn13} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-bold mb-1">{book.title}</h3>
                          <p className="text-gray-600 mb-2">{book.author}</p>
                          <p className="text-sm text-gray-500 mb-3">ISBN: {book.isbn13}</p>

                          <div className="flex items-center gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Condición:</span>
                              {book.items && book.items.length > 0 ? (
                                <Badge variant="outline">{book.items[0].conditionGrade}</Badge>
                              ) : (
                                <Badge variant="outline">N/A</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span className="text-sm">
                                {book.locations.length > 0 ? book.locations.join(", ") : "Sin ubicación"}
                              </span>
                            </div>
                            {book.items && book.items.length > 0 && book.items[0].listingPrice && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Precio:</span>
                                <span className="text-sm">€{parseFloat(book.items[0].listingPrice).toFixed(2)}</span>
                              </div>
                            )}
                          </div>

                          {expandedBook === book.isbn13 && book.synopsis && (
                            <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                              <p className="font-medium mb-1">Sinopsis:</p>
                              <p className="line-clamp-3">{book.synopsis}</p>
                            </div>
                          )}

                          {book.publisher && (
                            <p className="text-sm text-gray-500 mt-2">
                              Editorial: {book.publisher} {book.publicationYear && `(${book.publicationYear})`}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <Badge
                        variant={book.availableQuantity > 0 ? "default" : "secondary"}
                        className={book.availableQuantity > 0 ? "bg-green-500" : "bg-gray-400"}
                      >
                        {book.availableQuantity > 0 ? "DISPONIBLE" : "SIN STOCK"}
                      </Badge>

                      <div className="text-right">
                        <p className="text-2xl font-bold">{book.availableQuantity}</p>
                        <p className="text-xs text-gray-500">disponibles</p>
                        <p className="text-sm text-gray-600">de {book.totalQuantity} total</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddQuantity(book.isbn13)}
                          disabled={addQuantityMutation.isPending}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveQuantity(book.isbn13, book.availableQuantity)}
                          disabled={removeQuantityMutation.isPending || book.availableQuantity === 0}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>

                      {book.synopsis && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedBook(expandedBook === book.isbn13 ? null : book.isbn13)}
                        >
                          {expandedBook === book.isbn13 ? "Ocultar" : "Ver más"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Show individual items if expanded */}
                  {expandedBook === book.isbn13 && book.items && book.items.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="font-medium text-sm mb-2">Copias individuales ({book.items.length}):</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {book.items.map((item) => (
                          <div key={item.uuid} className="text-xs p-2 bg-gray-50 rounded">
                            <p className="font-mono text-gray-600">{item.uuid.substring(0, 8)}...</p>
                            <p><Badge variant="outline" className="text-xs">{item.status}</Badge></p>
                            <p>{item.locationCode || "Sin ubicación"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* Table View */
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Autor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ISBN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Disponible</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {books.map((book) => (
                      <tr key={book.isbn13} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{book.title}</p>
                          {book.publisher && (
                            <p className="text-xs text-gray-500">{book.publisher}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{book.author}</td>
                        <td className="px-4 py-3 text-sm font-mono">{book.isbn13}</td>
                        <td className="px-4 py-3 text-sm">{book.locations.join(", ") || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={book.availableQuantity > 0 ? "default" : "secondary"}
                            className={book.availableQuantity > 0 ? "bg-green-500" : ""}
                          >
                            {book.availableQuantity}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-sm">{book.totalQuantity}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddQuantity(book.isbn13)}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveQuantity(book.isbn13, book.availableQuantity)}
                              disabled={book.availableQuantity === 0}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {books && books.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Mostrando {books.length} libros
          </div>
        )}
      </div>
    </div>
  );
}
