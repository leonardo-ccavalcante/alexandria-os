import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Package, DollarSign, ShoppingCart, BarChart3, Calendar } from 'lucide-react';
import { useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const DATE_RANGES = [
  { label: 'Últimos 7 días', value: '7d', days: 7 },
  { label: 'Últimos 30 días', value: '30d', days: 30 },
  { label: 'Últimos 90 días', value: '90d', days: 90 },
  { label: 'Último año', value: '1y', days: 365 },
  { label: 'Todo el tiempo', value: 'all', days: null },
];

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('30d');
  const [velocityGroupBy, setVelocityGroupBy] = useState<'day' | 'week' | 'month'>('day');

  // Calculate date range
  const { dateFrom, dateTo } = useMemo(() => {
    const range = DATE_RANGES.find(r => r.value === dateRange);
    if (!range || !range.days) {
      return { dateFrom: undefined, dateTo: undefined };
    }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - range.days);
    return { dateFrom: from, dateTo: to };
  }, [dateRange]);

  // Queries
  const { data: kpis, isLoading: kpisLoading } = trpc.dashboard.getKPIs.useQuery();
  const { data: salesByChannel, isLoading: channelLoading } = trpc.dashboard.getSalesByChannel.useQuery();
  const { data: topBooks, isLoading: booksLoading } = trpc.dashboard.getTopBooks.useQuery({ limit: 10 });
  
  const { data: velocity, isLoading: velocityLoading } = trpc.dashboard.getInventoryVelocity.useQuery({
    dateFrom,
    dateTo,
    groupBy: velocityGroupBy,
  });
  
  const { data: authorAnalytics, isLoading: authorLoading } = trpc.dashboard.getAnalyticsByAuthor.useQuery({
    dateFrom,
    dateTo,
    limit: 10,
  });
  
  const { data: publisherAnalytics, isLoading: publisherLoading } = trpc.dashboard.getAnalyticsByPublisher.useQuery({
    dateFrom,
    dateTo,
    limit: 10,
  });
  
  const { data: categoryAnalytics, isLoading: categoryLoading } = trpc.dashboard.getAnalyticsByCategory.useQuery({
    dateFrom,
    dateTo,
  });
  
  const { data: locationAnalytics, isLoading: locationLoading } = trpc.dashboard.getAnalyticsByLocation.useQuery({
    dateFrom,
    dateTo,
  });

  if (kpisLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
      </div>
    );
  }

  const profitMargin = kpis?.totalRevenue ? ((kpis.totalProfit / kpis.totalRevenue) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-10 w-10 text-green-600" />
            <h1 className="text-4xl font-bold">Dashboard</h1>
          </div>
          
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Inventory */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Inventario Total
              </CardTitle>
              <Package className="h-5 w-5 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{kpis?.totalInventory || 0}</div>
              <p className="text-xs text-gray-500 mt-1">
                Libros en sistema
              </p>
            </CardContent>
          </Card>

          {/* Available */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Disponibles
              </CardTitle>
              <Package className="h-5 w-5 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{kpis?.available || 0}</div>
              <p className="text-xs text-gray-500 mt-1">
                Listos para vender
              </p>
            </CardContent>
          </Card>

          {/* Listed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Publicados
              </CardTitle>
              <ShoppingCart className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{kpis?.listed || 0}</div>
              <p className="text-xs text-gray-500 mt-1">
                En plataformas
              </p>
            </CardContent>
          </Card>

          {/* Sold */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Vendidos
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{kpis?.sold || 0}</div>
              <p className="text-xs text-gray-500 mt-1">
                Transacciones completadas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Financial Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Valor del Inventario
              </CardTitle>
              <DollarSign className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                €{(kpis?.inventoryValue || 0).toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Valor total disponible/publicado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Ingresos Totales
              </CardTitle>
              <DollarSign className="h-5 w-5 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                €{(kpis?.totalRevenue || 0).toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                De ventas completadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Margen de Beneficio
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{profitMargin}%</div>
              <p className="text-xs text-gray-500 mt-1">
                Beneficio neto: €{(kpis?.totalProfit || 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Inventory Velocity Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Velocidad del Inventario</CardTitle>
              <Select value={velocityGroupBy} onValueChange={(v: any) => setVelocityGroupBy(v)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Por día</SelectItem>
                  <SelectItem value="week">Por semana</SelectItem>
                  <SelectItem value="month">Por mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {velocityLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={velocity || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="added" stroke="#10b981" name="Añadidos" strokeWidth={2} />
                  <Line type="monotone" dataKey="sold" stroke="#ef4444" name="Vendidos" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Analytics Tabs */}
        <Tabs defaultValue="author" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="author">Por Autor</TabsTrigger>
            <TabsTrigger value="publisher">Por Editorial</TabsTrigger>
            <TabsTrigger value="category">Por Categoría</TabsTrigger>
            <TabsTrigger value="location">Por Ubicación</TabsTrigger>
          </TabsList>

          {/* Author Analytics */}
          <TabsContent value="author" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Autores</CardTitle>
              </CardHeader>
              <CardContent>
                {authorLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={authorAnalytics || []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="author" type="category" width={150} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="totalItems" fill="#3b82f6" name="Total Libros" />
                      <Bar dataKey="soldItems" fill="#10b981" name="Vendidos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Author Details Table */}
            <Card>
              <CardHeader>
                <CardTitle>Detalles por Autor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Autor</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-right p-2">Disponibles</th>
                        <th className="text-right p-2">Vendidos</th>
                        <th className="text-right p-2">Valor Inv.</th>
                        <th className="text-right p-2">Ingresos</th>
                        <th className="text-right p-2">Precio Prom.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authorAnalytics?.map((author: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{author.author}</td>
                          <td className="text-right p-2">{author.totalItems}</td>
                          <td className="text-right p-2">{author.availableItems}</td>
                          <td className="text-right p-2">{author.soldItems}</td>
                          <td className="text-right p-2">€{author.inventoryValue.toFixed(2)}</td>
                          <td className="text-right p-2">€{author.totalRevenue.toFixed(2)}</td>
                          <td className="text-right p-2">€{author.avgPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Publisher Analytics */}
          <TabsContent value="publisher" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Editoriales</CardTitle>
              </CardHeader>
              <CardContent>
                {publisherLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={publisherAnalytics || []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="publisher" type="category" width={150} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="totalItems" fill="#8b5cf6" name="Total Libros" />
                      <Bar dataKey="soldItems" fill="#10b981" name="Vendidos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Publisher Details Table */}
            <Card>
              <CardHeader>
                <CardTitle>Detalles por Editorial</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Editorial</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-right p-2">Disponibles</th>
                        <th className="text-right p-2">Vendidos</th>
                        <th className="text-right p-2">Valor Inv.</th>
                        <th className="text-right p-2">Ingresos</th>
                        <th className="text-right p-2">Precio Prom.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {publisherAnalytics?.map((publisher: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{publisher.publisher}</td>
                          <td className="text-right p-2">{publisher.totalItems}</td>
                          <td className="text-right p-2">{publisher.availableItems}</td>
                          <td className="text-right p-2">{publisher.soldItems}</td>
                          <td className="text-right p-2">€{publisher.inventoryValue.toFixed(2)}</td>
                          <td className="text-right p-2">€{publisher.totalRevenue.toFixed(2)}</td>
                          <td className="text-right p-2">€{publisher.avgPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Category Analytics */}
          <TabsContent value="category" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribución por Categoría</CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryLoading ? (
                    <div className="h-[400px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={categoryAnalytics || []}
                          dataKey="totalItems"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          label
                        >
                          {categoryAnalytics?.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Category Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Detalles por Categoría</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Categoría</th>
                          <th className="text-right p-2">Total</th>
                          <th className="text-right p-2">Vendidos</th>
                          <th className="text-right p-2">Ingresos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryAnalytics?.map((cat: any, idx: number) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-2">{cat.category}</td>
                            <td className="text-right p-2">{cat.totalItems}</td>
                            <td className="text-right p-2">{cat.soldItems}</td>
                            <td className="text-right p-2">€{cat.totalRevenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Location Analytics */}
          <TabsContent value="location" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Análisis por Ubicación</CardTitle>
              </CardHeader>
              <CardContent>
                {locationLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={locationAnalytics || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="location" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="totalItems" fill="#3b82f6" name="Total" />
                      <Bar dataKey="availableItems" fill="#10b981" name="Disponibles" />
                      <Bar dataKey="listedItems" fill="#f59e0b" name="Publicados" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Location Details Table */}
            <Card>
              <CardHeader>
                <CardTitle>Detalles por Ubicación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Ubicación</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-right p-2">Disponibles</th>
                        <th className="text-right p-2">Publicados</th>
                        <th className="text-right p-2">Vendidos</th>
                        <th className="text-right p-2">Valor Inv.</th>
                        <th className="text-right p-2">Utilización</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationAnalytics?.map((loc: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono">{loc.location}</td>
                          <td className="text-right p-2">{loc.totalItems}</td>
                          <td className="text-right p-2">{loc.availableItems}</td>
                          <td className="text-right p-2">{loc.listedItems}</td>
                          <td className="text-right p-2">{loc.soldItems}</td>
                          <td className="text-right p-2">€{loc.inventoryValue.toFixed(2)}</td>
                          <td className="text-right p-2">{loc.utilization.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Top Books Section */}
        <Card>
          <CardHeader>
            <CardTitle>Libros Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {booksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Título</th>
                      <th className="text-left p-2">Autor</th>
                      <th className="text-right p-2">Ventas</th>
                      <th className="text-right p-2">Ingresos</th>
                      <th className="text-right p-2">Beneficio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBooks?.map((book: any, idx: number) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2">{book.title}</td>
                        <td className="p-2">{book.author}</td>
                        <td className="text-right p-2">{book.salesCount}</td>
                        <td className="text-right p-2">€{book.totalRevenue.toFixed(2)}</td>
                        <td className="text-right p-2 text-green-600">€{book.totalProfit.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales by Channel */}
        {salesByChannel && salesByChannel.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Canal</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByChannel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="channel" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#3b82f6" name="Cantidad" />
                  <Bar dataKey="revenue" fill="#10b981" name="Ingresos (€)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
