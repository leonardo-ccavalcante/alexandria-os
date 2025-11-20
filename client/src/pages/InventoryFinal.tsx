import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Plus, Minus, Edit, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Select from "react-select";

type SortField = "title" | "author" | "isbn" | "location" | "available" | "total";
type SortDirection = "asc" | "desc";

export default function InventoryFinal() {
  const [searchText, setSearchText] = useState("");
  const [publisher, setPublisher] = useState("");
  const [author, setAuthor] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [showZeroInventory, setShowZeroInventory] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
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

  // Inventory query
  const { data: inventoryResponse, refetch } = trpc.inventory.getGroupedByIsbn.useQuery({
    searchText,
    publisher,
    author,
    yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
    yearTo: yearTo ? parseInt(yearTo) : undefined,
    includeZeroInventory: showZeroInventory,
    sortField,
    sortDirection,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
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

  // Filter data (sorting is now done on backend)
  const filteredData = useMemo(() => {
    if (!inventoryData) return [];
    
    // Apply client-side filters only
    let filtered = [...inventoryData];
    
    if (hideWithoutLocation) {
      filtered = filtered.filter(book => 
        book.locations && 
        book.locations.length > 0 && 
        book.locations.some(loc => loc !== null && loc !== "" && loc !== "-")
      );
    }
    
    if (hideWithoutQuantity) {
      filtered = filtered.filter(book => book.availableQuantity > 0);
    }
    
    return filtered;
  }, [inventoryData, hideWithoutLocation, hideWithoutQuantity]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
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
            
            <div>
              <Select
                options={publishers.map(p => ({ value: p, label: p }))}
                onChange={(option) => setPublisher(option?.value || "")}
                onInputChange={(value) => setPublisher(value)}
                placeholder="Editorial"
                isClearable
                className="text-sm"
              />
            </div>
            
            <div>
              <Select
                options={authors.map(a => ({ value: a, label: a }))}
                onChange={(option) => setAuthor(option?.value || "")}
                onInputChange={(value) => setAuthor(value)}
                placeholder="Autor"
                isClearable
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
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
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showZeroInventory}
                    onChange={(e) => setShowZeroInventory(e.target.checked)}
                    className="rounded"
                  />
                  Mostrar libros sin inventario (solo catálogo)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hideWithoutLocation}
                    onChange={(e) => setHideWithoutLocation(e.target.checked)}
                    className="rounded"
                  />
                  Ocultar libros sin ubicación
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hideWithoutQuantity}
                    onChange={(e) => setHideWithoutQuantity(e.target.checked)}
                    className="rounded"
                  />
                  Ocultar libros sin cantidad disponible
                </label>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={viewMode === "card" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("card")}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </Button>
            </div>
          </div>
        </div>

        {/* Table View */}
        {viewMode === "table" && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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
                      onClick={() => handleSort("isbn")}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                    >
                      ISBN
                      <SortIcon field="isbn" />
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
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ACCIONES
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredData.map((book) => (
                  <tr key={book.isbn13} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{book.title}</div>
                      <div className="text-sm text-gray-500">{book.publisher}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{book.author}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{book.isbn13}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {editingLocation?.isbn === book.isbn13 ? (
                        <Input
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          onBlur={() => {
                            if (newLocation.trim() && editingLocation) {
                              // Get all AVAILABLE items for this ISBN and update their locations
                              const availableItems = book.items?.filter((item: any) => item.status === 'AVAILABLE') || [];
                              if (availableItems.length > 0) {
                                updateLocationsMutation.mutate({
                                  updates: availableItems.map((item: any) => ({
                                    uuid: item.uuid,
                                    locationCode: newLocation.trim(),
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
                          className="w-24 h-8"
                          placeholder="ej: 16D"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingLocation({ isbn: book.isbn13, oldLocation: book.locations?.[0] || "" });
                            setNewLocation(book.locations?.[0] || "");
                          }}
                          className="text-left hover:bg-gray-100 px-2 py-1 rounded w-full"
                        >
                          {book.locations && book.locations.length > 0 ? book.locations.join(", ") : "-"}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                        book.availableQuantity > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {book.availableQuantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">{book.totalQuantity}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditBook(book)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => increaseQty.mutate({ isbn13: book.isbn13 })}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => decreaseQty.mutate({ isbn13: book.isbn13 })}
                          disabled={book.availableQuantity === 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredData.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No se encontraron libros
              </div>
            )}
          </div>
        )}

        {/* Pagination Controls */}
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">
              Mostrando {filteredData.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}-{Math.min(currentPage * pageSize, filteredData.length)} de {filteredData.length} libros
              {(hideWithoutLocation || hideWithoutQuantity) && (
                <span className="text-xs text-gray-500 ml-2">(filtrados de {totalCount} total)</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Mostrar:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-600">por página</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-10"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            
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

      {/* Edit Book Modal */}
      <Dialog open={!!editingBook} onOpenChange={() => setEditingBook(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Libro</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ISBN-13</Label>
                <Input value={editForm.isbn13 || ""} disabled className="bg-gray-50" />
              </div>
              <div>
                <Label>Año de Publicación</Label>
                <Input
                  type="number"
                  value={editForm.publicationYear || ""}
                  onChange={(e) => setEditForm({ ...editForm, publicationYear: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Título</Label>
              <Input
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>

            <div>
              <Label>Autor</Label>
              <Input
                value={editForm.author || ""}
                onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
              />
            </div>

            <div>
              <Label>Editorial</Label>
              <Input
                value={editForm.publisher || ""}
                onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
              />
            </div>

            <div>
              <Label>Idioma</Label>
              <Input
                value={editForm.language || ""}
                onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Categoría Nivel 1</Label>
                <Input
                  value={editForm.categoryLevel1 || ""}
                  onChange={(e) => setEditForm({ ...editForm, categoryLevel1: e.target.value })}
                />
              </div>
              <div>
                <Label>Categoría Nivel 2</Label>
                <Input
                  value={editForm.categoryLevel2 || ""}
                  onChange={(e) => setEditForm({ ...editForm, categoryLevel2: e.target.value })}
                />
              </div>
              <div>
                <Label>Categoría Nivel 3</Label>
                <Input
                  value={editForm.categoryLevel3 || ""}
                  onChange={(e) => setEditForm({ ...editForm, categoryLevel3: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Materia</Label>
              <Input
                value={editForm.materia || ""}
                onChange={(e) => setEditForm({ ...editForm, materia: e.target.value })}
              />
            </div>

            <div>
              <Label>Sinopsis</Label>
              <Textarea
                value={editForm.synopsis || ""}
                onChange={(e) => setEditForm({ ...editForm, synopsis: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBook(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateBookMutation.isPending}>
              {updateBookMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
