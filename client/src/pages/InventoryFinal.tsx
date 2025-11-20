import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Plus, Minus, Edit, ChevronUp, ChevronDown, MoreHorizontal, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Select from "react-select";

// Updated to match Backend Enum
type SortField = "title" | "author" | "publisher" | "isbn13" | "publicationYear" | "location" | "available" | "total";
type SortDirection = "asc" | "desc";

export default function InventoryFinal() {
  const [searchText, setSearchText] = useState("");
  const [publisher, setPublisher] = useState("");
  const [author, setAuthor] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [showZeroInventory, setShowZeroInventory] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  
  // Sorting State
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  // Pagination state
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Additional filters
  const [hideWithoutLocation, setHideWithoutLocation] = useState(false);
  const [hideWithoutQuantity, setHideWithoutQuantity] = useState(false);
  
  // Edit modal state
  const [editingBook, setEditingBook] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  // Inline location editing state
  const [editingLocation, setEditingLocation] = useState<{ isbn: string; oldLocation: string } | null>(null);
  const [newLocation, setNewLocation] = useState("");

  // Autocomplete queries
  const { data: publishers = [] } = trpc.catalog.getPublishers.useQuery({ search: publisher });
  const { data: authors = [] } = trpc.catalog.getAuthors.useQuery({ search: author });

  // ✅ PASSING SORT PARAMS TO BACKEND
  const { data: inventoryResponse, refetch, isLoading } = trpc.inventory.getGroupedByIsbn.useQuery({
    searchText,
    publisher,
    author,
    yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
    yearTo: yearTo ? parseInt(yearTo) : undefined,
    includeZeroInventory: showZeroInventory,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    sortField,
    sortDirection,
  });
  
  const inventoryData = inventoryResponse?.items || [];
  const totalCount = inventoryResponse?.total || 0;
  const totalPages = inventoryResponse?.totalPages || 1;

  // Mutations
  const increaseQty = trpc.inventory.increaseQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cantidad aumentada");
      refetch();
    },
  });

  const decreaseQty = trpc.inventory.decreaseQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cantidad disminuida");
      refetch();
    },
  });
  
  const updateLocationsMutation = trpc.batch.updateFromCsv.useMutation({
    onSuccess: () => {
      toast.success("Ubicación actualizada");
      setEditingLocation(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const updateBookMutation = trpc.catalog.updateBook.useMutation({
    onSuccess: () => {
      toast.success("Libro actualizado");
      setEditingBook(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Export CSV
  const exportMutation = trpc.batch.exportToCsv.useMutation({
    onSuccess: (data: { csv: string }) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventario_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      toast.success("CSV exportado");
    },
  });

  // ✅ REMOVED CLIENT-SIDE SORTING - Only filtering happens here now
  const filteredData = useMemo(() => {
    if (!inventoryData) return [];
    
    let filtered = [...inventoryData];
    
    if (hideWithoutLocation) {
      filtered = filtered.filter(book => 
        book.locations && 
        book.locations.length > 0 && 
        book.locations.some((loc: any) => loc !== null && loc !== "" && loc !== "-")
      );
    }
    
    if (hideWithoutQuantity) {
      filtered = filtered.filter(book => book.availableQuantity > 0);
    }
    
    return filtered;
  }, [inventoryData, hideWithoutLocation, hideWithoutQuantity]); // Removed sort dependencies

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1); // ✅ RESET PAGE ON SORT
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="h-4 w-4 opacity-30" />;
    return sortDirection === "asc" ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
  };

  const handleEditBook = (book: any) => {
    setEditingBook(book);
    setEditForm({
      isbn13: book.isbn13,
      title: book.title || "",
      author: book.author || "",
      publisher: book.publisher || "",
      publicationYear: book.publicationYear || "",
      language: book.language || "",
      synopsis: book.synopsis || "",
      categoryLevel1: book.categoryLevel1 || "",
      categoryLevel2: book.categoryLevel2 || "",
      categoryLevel3: book.categoryLevel3 || "",
      materia: book.materia || "",
    });
  };

  const handleSaveEdit = () => {
    updateBookMutation.mutate({
      ...editForm,
      publicationYear: editForm.publicationYear ? parseInt(editForm.publicationYear) : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
          </div>
          <Button
            onClick={() => exportMutation.mutate({ filters: { searchText, publisher, author } })}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Input
              placeholder="Buscar por título, autor, ISBN..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="col-span-2"
            />
            
            <Select
              options={publishers.map(p => ({ value: p, label: p }))}
              onChange={(option) => setPublisher(option?.value || "")}
              placeholder="Editorial"
              isClearable
              className="text-sm"
            />
            
            <Select
              options={authors.map(a => ({ value: a, label: a }))}
              onChange={(option) => setAuthor(option?.value || "")}
              placeholder="Autor"
              isClearable
              className="text-sm"
            />
          </div>
          
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <Input
                type="number"
                placeholder="Año desde"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                className="w-32"
              />
              <Input
                type="number"
                placeholder="Año hasta"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                className="w-32"
              />
              
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showZeroInventory}
                    onChange={(e) => setShowZeroInventory(e.target.checked)}
                  />
                  Mostrar libros sin inventario (solo catálogo)
                </label>
                
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={hideWithoutLocation}
                    onChange={(e) => setHideWithoutLocation(e.target.checked)}
                  />
                  Ocultar libros sin ubicación
                </label>
                
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={hideWithoutQuantity}
                    onChange={(e) => setHideWithoutQuantity(e.target.checked)}
                  />
                  Ocultar libros sin cantidad disponible
                </label>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                Tabla
              </Button>
              <Button
                variant={viewMode === "card" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("card")}
              >
                Tarjetas
              </Button>
            </div>
          </div>
        </div>

        {/* Table View */}
        {viewMode === "table" && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-4 text-gray-600">Cargando inventario...</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort("title")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                      >
                        TÍTULO
                        <SortIcon field="title" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort("author")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                      >
                        AUTOR
                        <SortIcon field="author" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort("isbn13")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                      >
                        ISBN
                        <SortIcon field="isbn13" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort("location")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                      >
                        UBICACIÓN
                        <SortIcon field="location" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-center">
                      <button
                        onClick={() => handleSort("available")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                      >
                        DISPONIBLE
                        <SortIcon field="available" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-center">
                      <button
                        onClick={() => handleSort("total")}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                      >
                        TOTAL
                        <SortIcon field="total" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ACCIONES
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        No se encontraron libros con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((book) => (
                      <tr key={book.isbn13} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 line-clamp-2" title={book.title}>
                            {book.title}
                          </div>
                          <div className="text-xs text-gray-500">{book.publisher}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{book.author}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-mono">{book.isbn13}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {editingLocation?.isbn === book.isbn13 ? (
                            <Input
                              value={newLocation}
                              onChange={(e) => setNewLocation(e.target.value)}
                              onBlur={() => {
                                if (newLocation !== editingLocation.oldLocation) {
                                  const availableUuids = book.items
                                    .filter((item: any) => item.status === 'AVAILABLE')
                                    .map((item: any) => item.uuid);
                                  
                                  if (availableUuids.length > 0) {
                                    updateLocationsMutation.mutate({
                                      updates: availableUuids.map((uuid: string) => ({
                                        uuid,
                                        locationCode: newLocation,
                                      })),
                                    });
                                  }
                                } else {
                                  setEditingLocation(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingLocation(null);
                                }
                              }}
                              autoFocus
                              className="w-20 h-8 text-sm"
                            />
                          ) : (
                            <span
                              onClick={() => {
                                const firstLocation = book.locations && book.locations.length > 0 ? book.locations[0] : "";
                                setEditingLocation({ isbn: book.isbn13, oldLocation: firstLocation });
                                setNewLocation(firstLocation);
                              }}
                              className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                            >
                              {book.locations && book.locations.length > 0 ? book.locations.join(", ") : "-"}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={book.availableQuantity > 0 ? "default" : "secondary"} className="bg-green-100 text-green-800">
                            {book.availableQuantity}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline">{book.totalQuantity}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditBook(book)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => increaseQty.mutate({ isbn13: book.isbn13 })}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => decreaseQty.mutate({ isbn13: book.isbn13 })}
                              disabled={book.availableQuantity === 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Mostrando {filteredData.length > 0 ? ((currentPage - 1) * pageSize + 1) : 0}-
            {Math.min(currentPage * pageSize, filteredData.length)} de {totalCount} libros
            {(hideWithoutLocation || hideWithoutQuantity) && ` (filtrados de ${totalCount} total)`}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Mostrar:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-700">por página</span>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum = i + 1;
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        {/* Edit Book Dialog */}
        <Dialog open={!!editingBook} onOpenChange={(open) => !open && setEditingBook(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Libro</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <Label>Título</Label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Autor</Label>
                <Input
                  value={editForm.author}
                  onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                />
              </div>
              <div>
                <Label>Editorial</Label>
                <Input
                  value={editForm.publisher}
                  onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                />
              </div>
              <div>
                <Label>Año de Publicación</Label>
                <Input
                  type="number"
                  value={editForm.publicationYear}
                  onChange={(e) => setEditForm({ ...editForm, publicationYear: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Sinopsis</Label>
                <Textarea
                  value={editForm.synopsis}
                  onChange={(e) => setEditForm({ ...editForm, synopsis: e.target.value })}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingBook(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit}>
                Guardar Cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
