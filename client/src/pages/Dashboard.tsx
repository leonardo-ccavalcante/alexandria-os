import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Package, DollarSign, ShoppingCart, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// McKinsey/Cole Nussbaumer color palette: strategic use of color
const ACCENT_COLOR = '#10b981'; // Green for key insights
const CONTEXT_COLOR = '#9ca3af'; // Gray for context
const WARNING_COLOR = '#f59e0b'; // Amber for warnings
const DANGER_COLOR = '#ef4444'; // Red for critical alerts

const DATE_RANGES = [
  { label: 'Últimos 7 días', value: '7d', days: 7 },
  { label: 'Últimos 30 días', value: '30d', days: 30 },
  { label: 'Últimos 90 días', value: '90d', days: 90 },
  { label: 'Último año', value: '1y', days: 365 },
  { label: 'Todo el tiempo', value: 'all', days: null },
];

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('30d');

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
      </div>
    );
  }

  const profitMargin = kpis?.totalRevenue ? ((kpis.totalProfit / kpis.totalRevenue) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-white p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Header - Clean and minimal */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-3xl md:text-4xl font-light text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Resumen del inventario y análisis</p>
          </div>
          
          {/* Date Range Filter - Minimal styling */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full sm:w-[180px] border-gray-300">
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

        {/* KPI Cards - Clean design with strategic color */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {/* Total Inventory */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-normal text-gray-600">
                Inventario Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-light text-gray-900">{kpis?.totalInventory || 0}</div>
              <p className="text-xs text-gray-500 mt-2">libros en sistema</p>
            </CardContent>
          </Card>

          {/* Available - Accent color for key metric */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-normal text-gray-600">
                Disponibles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-light" style={{ color: ACCENT_COLOR }}>{kpis?.available || 0}</div>
              <p className="text-xs text-gray-500 mt-2">listos para vender</p>
            </CardContent>
          </Card>

          {/* Revenue */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-normal text-gray-600">
                Ingresos Totales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-light text-gray-900">€{(kpis?.totalRevenue || 0).toFixed(0)}</div>
              <p className="text-xs text-gray-500 mt-2">ventas realizadas</p>
            </CardContent>
          </Card>

          {/* Profit Margin */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-normal text-gray-600">
                Margen de Beneficio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-light text-gray-900">{profitMargin}%</div>
              <p className="text-xs text-gray-500 mt-2">€{(kpis?.totalProfit || 0).toFixed(0)} beneficio neto</p>
            </CardContent>
          </Card>
        </div>

        {/* Ubicación Capacity Tracking - NEW FEATURE */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-normal text-gray-900">Capacidad de Ubicaciones</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Espacios de almacenamiento y disponibilidad (referencia: ~25 libros por ubicación)</p>
          </CardHeader>
          <CardContent>
            {locationLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : locationAnalytics && locationAnalytics.length > 0 ? (
              <div className="space-y-4">
                {/* Capacity visualization */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {locationAnalytics
                    .filter((loc: any) => loc.location !== 'No Location')
                    .sort((a: any, b: any) => b.capacityPercentage - a.capacityPercentage)
                    .slice(0, 12)
                    .map((loc: any) => (
                      <div key={loc.location} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">{loc.location}</span>
                          {loc.isAtCapacity ? (
                            <AlertTriangle className="h-4 w-4" style={{ color: DANGER_COLOR }} />
                          ) : loc.isNearCapacity ? (
                            <AlertTriangle className="h-4 w-4" style={{ color: WARNING_COLOR }} />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" style={{ color: ACCENT_COLOR }} />
                          )}
                        </div>
                        
                        {/* Progress bar */}
                        <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${loc.capacityPercentage}%`,
                              backgroundColor: loc.isAtCapacity ? DANGER_COLOR : loc.isNearCapacity ? WARNING_COLOR : ACCENT_COLOR
                            }}
                          />
                        </div>
                        
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">{loc.totalItems} libros</span>
                          <span className={loc.freeSpace <= 5 ? 'font-medium' : ''} style={{ 
                            color: loc.freeSpace <= 5 ? (loc.freeSpace === 0 ? DANGER_COLOR : WARNING_COLOR) : CONTEXT_COLOR 
                          }}>
                            {loc.freeSpace} espacios libres
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No hay datos de ubicaciones disponibles</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analytics Tabs */}
        <Tabs defaultValue="author" className="space-y-4">
          <TabsList className="bg-gray-100">
            <TabsTrigger value="author">Por Autor</TabsTrigger>
            <TabsTrigger value="publisher">Por Editorial</TabsTrigger>
            <TabsTrigger value="category">Por Categoría</TabsTrigger>
            <TabsTrigger value="location">Por Ubicación</TabsTrigger>
          </TabsList>

          {/* Author Analytics */}
          <TabsContent value="author">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-normal text-gray-900">Top 10 Autores</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Autores con más libros en inventario</p>
              </CardHeader>
              <CardContent>
                {authorLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : authorAnalytics && authorAnalytics.length > 0 ? (
                  <div className="space-y-6">
                    {/* Chart - Minimal design, no gridlines */}
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={authorAnalytics} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <XAxis 
                          dataKey="author" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100}
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Bar dataKey="totalItems" radius={[4, 4, 0, 0]}>
                          {authorAnalytics.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? ACCENT_COLOR : CONTEXT_COLOR} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Data table - Clean design */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200">
                          <tr>
                            <th className="text-left py-3 px-4 font-normal text-gray-600">Autor</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Total</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Disponibles</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Vendidos</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Valor Inv.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {authorAnalytics.map((item: any, index: number) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-900">{item.author}</td>
                              <td className="py-3 px-4 text-right text-gray-900">{item.totalItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.availableItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.soldItems}</td>
                              <td className="py-3 px-4 text-right text-gray-900">€{item.inventoryValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No hay datos de autores disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Publisher Analytics */}
          <TabsContent value="publisher">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-normal text-gray-900">Top 10 Editoriales</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Editoriales con más libros en inventario</p>
              </CardHeader>
              <CardContent>
                {publisherLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : publisherAnalytics && publisherAnalytics.length > 0 ? (
                  <div className="space-y-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={publisherAnalytics} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <XAxis 
                          dataKey="publisher" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100}
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Bar dataKey="totalItems" radius={[4, 4, 0, 0]}>
                          {publisherAnalytics.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? ACCENT_COLOR : CONTEXT_COLOR} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200">
                          <tr>
                            <th className="text-left py-3 px-4 font-normal text-gray-600">Editorial</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Total</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Disponibles</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Vendidos</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Valor Inv.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {publisherAnalytics.map((item: any, index: number) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-900">{item.publisher}</td>
                              <td className="py-3 px-4 text-right text-gray-900">{item.totalItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.availableItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.soldItems}</td>
                              <td className="py-3 px-4 text-right text-gray-900">€{item.inventoryValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No hay datos de editoriales disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Category Analytics */}
          <TabsContent value="category">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-normal text-gray-900">Distribución por Categoría</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Categorías de libros en inventario</p>
              </CardHeader>
              <CardContent>
                {categoryLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : categoryAnalytics && categoryAnalytics.length > 0 ? (
                  <div className="space-y-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryAnalytics} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <XAxis 
                          dataKey="category" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100}
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Bar dataKey="totalItems" radius={[4, 4, 0, 0]}>
                          {categoryAnalytics.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? ACCENT_COLOR : CONTEXT_COLOR} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200">
                          <tr>
                            <th className="text-left py-3 px-4 font-normal text-gray-600">Categoría</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Total</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Disponibles</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Vendidos</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Valor Inv.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryAnalytics.map((item: any, index: number) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-900">{item.category}</td>
                              <td className="py-3 px-4 text-right text-gray-900">{item.totalItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.availableItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.soldItems}</td>
                              <td className="py-3 px-4 text-right text-gray-900">€{item.inventoryValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No hay datos de categorías disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Location Analytics */}
          <TabsContent value="location">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-normal text-gray-900">Análisis por Ubicación</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Distribución de libros por ubicación física</p>
              </CardHeader>
              <CardContent>
                {locationLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : locationAnalytics && locationAnalytics.length > 0 ? (
                  <div className="space-y-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart 
                        data={locationAnalytics.filter((loc: any) => loc.location !== 'No Location').slice(0, 15)} 
                        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                      >
                        <XAxis 
                          dataKey="location" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100}
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Bar dataKey="totalItems" radius={[4, 4, 0, 0]}>
                          {locationAnalytics.filter((loc: any) => loc.location !== 'No Location').slice(0, 15).map((entry: any, index: number) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.isAtCapacity ? DANGER_COLOR : entry.isNearCapacity ? WARNING_COLOR : (index === 0 ? ACCENT_COLOR : CONTEXT_COLOR)} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200">
                          <tr>
                            <th className="text-left py-3 px-4 font-normal text-gray-600">Ubicación</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Total</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Disponibles</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Capacidad</th>
                            <th className="text-right py-3 px-4 font-normal text-gray-600">Espacios Libres</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationAnalytics
                            .filter((loc: any) => loc.location !== 'No Location')
                            .map((item: any, index: number) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-900 flex items-center gap-2">
                                {item.location}
                                {item.isAtCapacity && <AlertTriangle className="h-3 w-3" style={{ color: DANGER_COLOR }} />}
                                {item.isNearCapacity && !item.isAtCapacity && <AlertTriangle className="h-3 w-3" style={{ color: WARNING_COLOR }} />}
                              </td>
                              <td className="py-3 px-4 text-right text-gray-900">{item.totalItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.availableItems}</td>
                              <td className="py-3 px-4 text-right text-gray-600">{item.capacityPercentage.toFixed(0)}%</td>
                              <td className="py-3 px-4 text-right" style={{ 
                                color: item.freeSpace <= 5 ? (item.freeSpace === 0 ? DANGER_COLOR : WARNING_COLOR) : '#6b7280',
                                fontWeight: item.freeSpace <= 5 ? 500 : 400
                              }}>
                                {item.freeSpace}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No hay datos de ubicaciones disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
