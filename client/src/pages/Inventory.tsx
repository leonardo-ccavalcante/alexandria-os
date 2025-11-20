import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Filter, Download, Edit, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function Inventory() {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [conditionFilter, setConditionFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState('');
  const [page, setPage] = useState(0);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [newLocation, setNewLocation] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleData, setSaleData] = useState({
    channel: 'TIENDA_FISICA',
    finalSalePrice: '',
    platformFees: '',
    shippingCost: '0',
    notes: '',
  });

  const limit = 20;
  const offset = page * limit;

  const { data, isLoading, refetch } = trpc.inventory.search.useQuery({
    searchText: searchText || undefined,
    status: statusFilter || undefined,
    condition: conditionFilter || undefined,
    location: locationFilter || undefined,
    limit,
    offset,
  });

  const updateLocationMutation = trpc.inventory.updateLocation.useMutation();
  const updatePriceMutation = trpc.inventory.updatePrice.useMutation();
  const recordSaleMutation = trpc.inventory.recordSale.useMutation();
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

  const handleUpdateLocation = async () => {
    if (!editingItem || !newLocation) return;

    if (!/^[0-9]{2}[A-Z]$/.test(newLocation)) {
      toast.error('Formato de ubicación inválido. Debe ser: 02A');
      return;
    }

    try {
      await updateLocationMutation.mutateAsync({
        uuid: editingItem.uuid,
        locationCode: newLocation.toUpperCase(),
      });
      toast.success('Ubicación actualizada');
      setEditingItem(null);
      setNewLocation('');
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdatePrice = async () => {
    if (!editingItem || !newPrice) return;

    try {
      await updatePriceMutation.mutateAsync({
        uuid: editingItem.uuid,
        listingPrice: newPrice,
      });
      toast.success('Precio actualizado');
      setEditingItem(null);
      setNewPrice('');
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRecordSale = async () => {
    if (!editingItem) return;

    try {
      await recordSaleMutation.mutateAsync({
        uuid: editingItem.uuid,
        channel: saleData.channel,
        finalSalePrice: saleData.finalSalePrice,
        platformFees: saleData.platformFees,
        shippingCost: saleData.shippingCost,
        notes: saleData.notes || undefined,
      });
      toast.success('Venta registrada exitosamente');
      setSaleDialogOpen(false);
      setEditingItem(null);
      setSaleData({
        channel: 'TIENDA_FISICA',
        finalSalePrice: '',
        platformFees: '',
        shippingCost: '0',
        notes: '',
      });
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleExport = async () => {
    exportMutation.mutate({ filters: {} });
  };



  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      INGESTION: 'bg-gray-100 text-gray-700',
      AVAILABLE: 'bg-green-100 text-green-700',
      LISTED: 'bg-blue-100 text-blue-700',
      RESERVED: 'bg-yellow-100 text-yellow-700',
      SOLD: 'bg-purple-100 text-purple-700',
      REJECTED: 'bg-red-100 text-red-700',
      DONATED: 'bg-orange-100 text-orange-700',
      MISSING: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto space-y-6 py-8">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-3xl flex items-center gap-2">
                <Package className="h-8 w-8 text-purple-600" />
                Inventario
              </CardTitle>
              <Button onClick={handleExport} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por título, autor, ISBN..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todos</SelectItem>
                  <SelectItem value="AVAILABLE">Disponible</SelectItem>
                  <SelectItem value="LISTED">Publicado</SelectItem>
                  <SelectItem value="SOLD">Vendido</SelectItem>
                  <SelectItem value="RESERVED">Reservado</SelectItem>
                </SelectContent>
              </Select>

              {/* Condition Filter */}
              <Select value={conditionFilter} onValueChange={setConditionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Condición" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todas</SelectItem>
                  <SelectItem value="COMO_NUEVO">Como Nuevo</SelectItem>
                  <SelectItem value="BUENO">Bueno</SelectItem>
                  <SelectItem value="ACEPTABLE">Aceptable</SelectItem>
                </SelectContent>
              </Select>

              {/* Location Filter */}
              <Input
                placeholder="Ubicación (ej: 02)"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : data?.items && data.items.length > 0 ? (
              <div className="space-y-4">
                {data.items.map((row: any) => {
                  const item = row.item;
                  const book = row.book;
                  return (
                    <div
                      key={item.uuid}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex gap-4">
                        {/* Book Cover */}
                        {book?.coverImageUrl && (
                          <img
                            src={book.coverImageUrl}
                            alt={book.title}
                            className="w-16 h-24 object-cover rounded"
                          />
                        )}

                        {/* Book Info */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-lg">{book?.title || 'Unknown'}</h3>
                              <p className="text-gray-600">{book?.author || 'Unknown'}</p>
                              <p className="text-sm text-gray-500 font-mono">ISBN: {item.isbn13}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(item.status)}`}>
                              {item.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className="font-semibold">Condición:</span> {item.conditionGrade}
                            </div>
                            <div>
                              <span className="font-semibold">Ubicación:</span> {item.locationCode || 'N/A'}
                            </div>
                            <div>
                              <span className="font-semibold">Precio:</span> €{parseFloat(item.listingPrice || '0').toFixed(2)}
                            </div>
                            <div>
                              <span className="font-semibold">UUID:</span>{' '}
                              <span className="font-mono text-xs">{item.uuid.substring(0, 8)}...</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingItem(item);
                                    setNewLocation(item.locationCode || '');
                                  }}
                                >
                                  <Edit className="mr-1 h-3 w-3" />
                                  Ubicación
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Actualizar Ubicación</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                  <div>
                                    <Label>Nueva Ubicación</Label>
                                    <Input
                                      placeholder="Ej: 02A"
                                      value={newLocation}
                                      onChange={(e) => setNewLocation(e.target.value.toUpperCase())}
                                      maxLength={3}
                                      className="font-mono"
                                    />
                                  </div>
                                  <Button onClick={handleUpdateLocation} className="w-full">
                                    Actualizar
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>

                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingItem(item);
                                    setNewPrice(item.listingPrice || '');
                                  }}
                                >
                                  <Edit className="mr-1 h-3 w-3" />
                                  Precio
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Actualizar Precio</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                  <div>
                                    <Label>Nuevo Precio (€)</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="15.00"
                                      value={newPrice}
                                      onChange={(e) => setNewPrice(e.target.value)}
                                    />
                                  </div>
                                  <Button onClick={handleUpdatePrice} className="w-full">
                                    Actualizar
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>

                            {item.status !== 'SOLD' && (
                              <Dialog open={saleDialogOpen && editingItem?.uuid === item.uuid} onOpenChange={setSaleDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      setEditingItem(item);
                                      setSaleData({
                                        ...saleData,
                                        finalSalePrice: item.listingPrice || '',
                                      });
                                    }}
                                  >
                                    Registrar Venta
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Registrar Venta</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4 pt-4">
                                    <div>
                                      <Label>Canal de Venta</Label>
                                      <Select value={saleData.channel} onValueChange={(v) => setSaleData({ ...saleData, channel: v })}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="TIENDA_FISICA">Tienda Física</SelectItem>
                                          <SelectItem value="AMAZON">Amazon</SelectItem>
                                          <SelectItem value="IBERLIBRO">Iberlibro</SelectItem>
                                          <SelectItem value="WALLAPOP">Wallapop</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label>Precio Final de Venta (€)</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={saleData.finalSalePrice}
                                        onChange={(e) => setSaleData({ ...saleData, finalSalePrice: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label>Comisiones de Plataforma (€)</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={saleData.platformFees}
                                        onChange={(e) => setSaleData({ ...saleData, platformFees: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label>Costo de Envío (€)</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={saleData.shippingCost}
                                        onChange={(e) => setSaleData({ ...saleData, shippingCost: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label>Notas (Opcional)</Label>
                                      <Input
                                        value={saleData.notes}
                                        onChange={(e) => setSaleData({ ...saleData, notes: e.target.value })}
                                      />
                                    </div>
                                    <Button onClick={handleRecordSale} className="w-full">
                                      Registrar Venta
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination */}
                <div className="flex justify-between items-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-gray-600">
                    Página {page + 1} • Total: {data.total} libros
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage(page + 1)}
                    disabled={data.items.length < limit}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                No se encontraron libros
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
