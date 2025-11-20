import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, Package, DollarSign, ShoppingCart, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const { data: kpis, isLoading: kpisLoading } = trpc.dashboard.getKPIs.useQuery();
  const { data: salesByChannel, isLoading: channelLoading } = trpc.dashboard.getSalesByChannel.useQuery();
  const { data: topBooks, isLoading: booksLoading } = trpc.dashboard.getTopBooks.useQuery({ limit: 10 });

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
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="h-10 w-10 text-green-600" />
          <h1 className="text-4xl font-bold">Dashboard</h1>
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

        {/* Revenue Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Revenue */}
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
                Ventas brutas
              </p>
            </CardContent>
          </Card>

          {/* Total Profit */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Beneficio Neto
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                €{(kpis?.totalProfit || 0).toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Después de gastos
              </p>
            </CardContent>
          </Card>

          {/* Average Profit */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Beneficio Promedio
              </CardTitle>
              <BarChart3 className="h-5 w-5 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">
                €{(kpis?.avgProfit || 0).toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Por libro • Margen: {profitMargin}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sales by Channel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Ventas por Canal</CardTitle>
          </CardHeader>
          <CardContent>
            {channelLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : salesByChannel && salesByChannel.length > 0 ? (
              <div className="space-y-4">
                {salesByChannel.map((channel: any) => (
                  <div key={channel.channel} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="font-semibold text-lg">{channel.channel}</div>
                      <div className="text-sm text-gray-600">
                        {channel.count} ventas
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-600">
                        €{channel.revenue.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-600">
                        Beneficio: €{channel.profit.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No hay datos de ventas
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Performing Books */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Libros Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {booksLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : topBooks && topBooks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2">#</th>
                      <th className="text-left py-3 px-2">Título</th>
                      <th className="text-left py-3 px-2">Autor</th>
                      <th className="text-right py-3 px-2">Ventas</th>
                      <th className="text-right py-3 px-2">Ingresos</th>
                      <th className="text-right py-3 px-2">Beneficio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBooks.map((book: any, index: number) => (
                      <tr key={book.isbn13} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-semibold">{index + 1}</td>
                        <td className="py-3 px-2">
                          <div className="font-medium">{book.title}</div>
                          <div className="text-xs text-gray-500 font-mono">{book.isbn13}</div>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{book.author}</td>
                        <td className="py-3 px-2 text-right font-semibold">{book.salesCount}</td>
                        <td className="py-3 px-2 text-right text-green-600">
                          €{book.totalRevenue.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-blue-600">
                          €{book.totalProfit.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No hay datos de ventas
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
