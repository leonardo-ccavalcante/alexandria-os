import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Search, Download, Grid3x3, List, Plus, Minus, MapPin, Package, Edit, Eye, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type InventoryItem = {
  uuid: string;
  status: string;
  conditionGrade: string;
  locationCode: string | null;
  listingPrice: string | null;
};

type BookWithInventory = {
  isbn13: string;
  title: string;
  author: string;
  publisher: string | null;
  publicationYear: number | null;
  categoryLevel1: string | null;
  categoryLevel2: string | null;
  categoryLevel3: string | null;
  synopsis: string | null;
  coverImageUrl: string | null;
  totalQuantity: number;
  availableQuantity: number;
  locations: (string | null)[];
  items: InventoryItem[];
};

export default function InventoryEnhanced() {
  const [searchText, setSearchText] = useState("");
  const [publisherFilter, setPublisherFilter] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [includeZeroInventory, setIncludeZeroInventory] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  
  // Item detail modal state
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookWithInventory | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedLocation, setEditedLocation] = useState("");
  const [editedPrice, setEditedPrice] = useState("");
  const [editedStatus, setEditedStatus] = useState("");

  // Bulk operations state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState("");

  // Fetch grouped inventory
  const { data: books, isLoading, refetch } = trpc.inventory.getGroupedByIsbn.useQuery({
    searchText: searchText || undefined,
    publisher: publisherFilter || undefined,
    yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
    yearTo: yearTo ? parseInt(yearTo) : undefined,
    includeZeroInventory,
    limit: 100,
    offset: 0,
  });

  // Mutations
  const updateLocationMutation = trpc.inventory.updateLocation.useMutation({
    onSuccess: () => {
      toast.success("Ubicación actualizada");
      refetch();
      setSelectedItem(null);
      setEditMode(false);
    },
    onError: (error) => toast.error(`Error: ${error.message}`),
  });

  const updatePriceMutation = trpc.inventory.updatePrice.useMutation({
    onSuccess: () => {
      toast.success("Precio actualizado");
      refetch();
    },
    onError: (error) => toast.error(`Error: ${error.message}`),
  });

  const updateStatusMutation = trpc.inventory.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado");
      refetch();
      setSelectedItem(null);
    },
    onError: (error) => toast.error(`Error: ${error.message}`),
  });

  const addQuantityMutation = trpc.inventory.addQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cantidad aumentada");
      refetch();
    },
    onError: (error) => toast.error(`Error: ${error.message}`),
  });

  const removeQuantityMutation = trpc.inventory.removeQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cantidad reducida");
      refetch();
    },
    onError: (error) => toast.error(`Error: ${error.message}`),
  });

  const batchUpdateMutation = trpc.batch.updateFromCsv.useMutation({
    onSuccess: () => {
      toast.success("Ubicaciones actualizadas en lote");
      refetch();
      setSelectedItems(new Set());
      setBulkMode(false);
    },
    onError: (error: any) => toast.error(`Error: ${error.message}`),
  });

  const handleOpenItemDetail = (item: InventoryItem, book: BookWithInventory) => {
    setSelectedItem(item);
    setSelectedBook(book);
    setEditedLocation(item.locationCode || "");
    setEditedPrice(item.listingPrice || "");
    setEditedStatus(item.status);
    setEditMode(false);
  };

  const handleSaveChanges = () => {
    if (!selectedItem) return;

    const promises = [];

    if (editedLocation !== selectedItem.locationCode) {
      promises.push(
        updateLocationMutation.mutateAsync({
          uuid: selectedItem.uuid,
          locationCode: editedLocation,
        })
      );
    }

    if (editedPrice !== selectedItem.listingPrice) {
      promises.push(
        updatePriceMutation.mutateAsync({
          uuid: selectedItem.uuid,
          listingPrice: editedPrice,
        })
      );
    }

    if (editedStatus !== selectedItem.status) {
      promises.push(
        updateStatusMutation.mutateAsync({
          uuid: selectedItem.uuid,
          status: editedStatus as any,
        })
      );
    }

    Promise.all(promises).then(() => {
      setEditMode(false);
      setSelectedItem(null);
    });
  };

  const handleBulkLocationUpdate = () => {
    if (selectedItems.size === 0) {
      toast.error("Selecciona al menos un item");
      return;
    }
    if (!bulkLocation.match(/^[0-9]{2}[A-Z]$/)) {
      toast.error("Formato de ubicación inválido (ejemplo: 02A)");
      return;
    }

    batchUpdateMutation.mutate({
      updates: Array.from(selectedItems).map(uuid => ({
        uuid,
        locationCode: bulkLocation,
      })),
    });
  };

  const toggleItemSelection = (uuid: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(uuid)) {
      newSelected.delete(uuid);
    } else {
      newSelected.add(uuid);
    }
    setSelectedItems(newSelected);
  };

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

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      AVAILABLE: "bg-green-500",
      LISTED: "bg-blue-500",
      SOLD: "bg-gray-500",
      RESERVED: "bg-yellow-500",
      DONATED: "bg-purple-500",
      MISSING: "bg-red-500",
    };
    return colors[status] || "bg-gray-400";
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
          <div className="flex gap-2">
            {bulkMode && (
              <Button onClick={() => setBulkMode(false)} variant="outline">
                Cancelar modo lote
              </Button>
            )}
            {!bulkMode && (
              <Button onClick={() => setBulkMode(true)} variant="outline">
                Modo lote
              </Button>
            )}
            <Button onClick={handleExportCSV} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk operations bar */}
      {bulkMode && (
        <div className="max-w-7xl mx-auto mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <p className="text-sm font-medium">
                  {selectedItems.size} items seleccionados
                </p>
                <Input
                  placeholder="Nueva ubicación (ej: 02A)"
                  value={bulkLocation}
                  onChange={(e) => setBulkLocation(e.target.value)}
                  className="w-40"
                />
                <Button
                  onClick={handleBulkLocationUpdate}
                  disabled={selectedItems.size === 0 || !bulkLocation}
                >
                  Actualizar ubicaciones
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span className="text-sm">
                                {book.locations.length > 0 ? book.locations.join(", ") : "Sin ubicación"}
                              </span>
                            </div>
                          </div>

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
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveQuantity(book.isbn13, book.availableQuantity)}
                          disabled={book.availableQuantity === 0}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedBook(expandedBook === book.isbn13 ? null : book.isbn13)}
                      >
                        {expandedBook === book.isbn13 ? "Ocultar copias" : "Ver copias"}
                      </Button>
                    </div>
                  </div>

                  {/* Show individual items if expanded */}
                  {expandedBook === book.isbn13 && book.items && book.items.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="font-medium text-sm mb-3">Copias individuales ({book.items.length}):</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {book.items.map((item) => (
                          <div
                            key={item.uuid}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex-1">
                              <p className="font-mono text-xs text-gray-600 mb-1">
                                {item.uuid.substring(0, 8)}...
                              </p>
                              <div className="flex items-center gap-2">
                                {bulkMode && (
                                  <input
                                    type="checkbox"
                                    checked={selectedItems.has(item.uuid)}
                                    onChange={() => toggleItemSelection(item.uuid)}
                                    className="rounded"
                                  />
                                )}
                                <Badge className={getStatusBadgeColor(item.status)}>
                                  {item.status}
                                </Badge>
                                <span className="text-xs">{item.locationCode || "Sin ubicación"}</span>
                                {item.listingPrice && (
                                  <span className="text-xs font-medium">€{parseFloat(item.listingPrice).toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenItemDetail(item, book)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
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

      {/* Item Detail Modal */}
      <Dialog open={selectedItem !== null} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Item</DialogTitle>
          </DialogHeader>
          {selectedItem && selectedBook && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg">{selectedBook.title}</h3>
                <p className="text-gray-600">{selectedBook.author}</p>
                <p className="text-sm text-gray-500">ISBN: {selectedBook.isbn13}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>UUID</Label>
                  <p className="font-mono text-sm mt-1">{selectedItem.uuid}</p>
                </div>
                <div>
                  <Label>Condición</Label>
                  <p className="mt-1">{selectedItem.conditionGrade}</p>
                </div>
              </div>

              {editMode ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ubicación</Label>
                      <Input
                        value={editedLocation}
                        onChange={(e) => setEditedLocation(e.target.value)}
                        placeholder="02A"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Precio</Label>
                      <Input
                        value={editedPrice}
                        onChange={(e) => setEditedPrice(e.target.value)}
                        placeholder="10.00"
                        type="number"
                        step="0.01"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Estado</Label>
                    <Select value={editedStatus} onValueChange={setEditedStatus}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVAILABLE">Disponible</SelectItem>
                        <SelectItem value="LISTED">Publicado</SelectItem>
                        <SelectItem value="RESERVED">Reservado</SelectItem>
                        <SelectItem value="SOLD">Vendido</SelectItem>
                        <SelectItem value="DONATED">Donado</SelectItem>
                        <SelectItem value="MISSING">Perdido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ubicación</Label>
                      <p className="mt-1">{selectedItem.locationCode || "Sin ubicación"}</p>
                    </div>
                    <div>
                      <Label>Precio</Label>
                      <p className="mt-1">
                        {selectedItem.listingPrice ? `€${parseFloat(selectedItem.listingPrice).toFixed(2)}` : "Sin precio"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label>Estado</Label>
                    <div className="mt-1">
                      <Badge className={getStatusBadgeColor(selectedItem.status)}>
                        {selectedItem.status}
                      </Badge>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => setEditMode(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveChanges}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Guardar cambios
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Cerrar
                </Button>
                <Button onClick={() => setEditMode(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
