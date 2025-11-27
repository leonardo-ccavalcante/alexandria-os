import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Package, BarChart3, Upload, Download, Settings } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto px-4 py-8 md:py-16">
        {/* Hero Section */}
        <div className="text-center mb-8 md:mb-16">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-3 md:mb-4 bg-gradient-mint bg-clip-text text-transparent">
            Alexandria OS
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-2">Donation Edition</p>
          <p className="text-base md:text-lg text-gray-500 px-4">
            Sistema de Gestión de Inventario para Libros Usados
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
          {/* Triage */}
          <Link href="/triage">
            <Card className="hover:shadow-elegant-lg transition-all duration-300 cursor-pointer h-full border-2 hover:border-primary/30 rounded-2xl">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 md:p-3 bg-gradient-teal rounded-xl shadow-elegant">
                      <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl md:text-2xl">Triage & Scan</CardTitle>
                  </div>
                  <CardDescription className="text-sm md:text-base">
                    Escanea libros y determina automáticamente si son rentables para catalogar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li>✓ Escaneo de códigos de barras</li>
                    <li>✓ Cálculo automático de rentabilidad</li>
                    <li>✓ Decisión instantánea (Aceptar/Donar/Reciclar)</li>
                  </ul>
                </CardContent>
              </Card>
          </Link>

          {/* Inventory */}
          <Link href="/inventario">
            <Card className="hover:shadow-elegant-lg transition-all duration-300 cursor-pointer h-full border-2 hover:border-primary/30 rounded-2xl">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 md:p-3 bg-gradient-mint rounded-xl shadow-elegant">
                      <Package className="h-6 w-6 md:h-8 md:w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl md:text-2xl">Inventario</CardTitle>
                  </div>
                  <CardDescription className="text-sm md:text-base">
                    Gestiona todos los libros catalogados con búsqueda y filtros avanzados
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li>✓ Búsqueda por título, autor, ISBN</li>
                    <li>✓ Filtros por estado, condición, ubicación</li>
                    <li>✓ Actualización de precios y ubicaciones</li>
                  </ul>
                </CardContent>
              </Card>
          </Link>

          {/* Dashboard */}
          <Link href="/dashboard">
            <Card className="hover:shadow-elegant-lg transition-all duration-300 cursor-pointer h-full border-2 hover:border-primary/30 rounded-2xl">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 md:p-3 bg-gradient-mint rounded-xl shadow-elegant">
                      <BarChart3 className="h-6 w-6 md:h-8 md:w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl md:text-2xl">Dashboard</CardTitle>
                  </div>
                  <CardDescription className="text-sm md:text-base">
                    Analiza el rendimiento del negocio con métricas detalladas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li>✓ KPIs en tiempo real</li>
                    <li>✓ Análisis de ventas por canal</li>
                    <li>✓ Libros más vendidos</li>
                  </ul>
                </CardContent>
              </Card>
          </Link>

          {/* Batch Upload */}
          <Link href="/carga-masiva">
          <Card className="hover:shadow-elegant-lg transition-all duration-300 cursor-pointer h-full border-2 hover:border-primary/30 rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 md:p-3 bg-gradient-teal rounded-xl shadow-elegant">
                  <Upload className="h-6 w-6 md:h-8 md:w-8 text-white" />
                </div>
                <CardTitle className="text-xl md:text-2xl">Carga Masiva</CardTitle>
              </div>
              <CardDescription className="text-sm md:text-base">
                Actualiza múltiples libros a la vez mediante archivos CSV
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>✓ Importar actualizaciones desde CSV</li>
                <li>✓ Actualización de ubicaciones en lote</li>
                <li>✓ Validación automática de datos</li>
              </ul>
            </CardContent>
          </Card>
          </Link>

          {/* Export */}
          <Link href="/exportar">
          <Card className="hover:shadow-elegant-lg transition-all duration-300 cursor-pointer h-full border-2 hover:border-primary/30 rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 md:p-3 bg-gradient-mint rounded-xl shadow-elegant">
                  <Download className="h-6 w-6 md:h-8 md:w-8 text-white" />
                </div>
                <CardTitle className="text-xl md:text-2xl">Exportar Datos</CardTitle>
              </div>
              <CardDescription className="text-sm md:text-base">
                Exporta el inventario completo o filtrado a CSV
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>✓ Exportación con filtros personalizados</li>
                <li>✓ Análisis externo en Excel</li>
                <li>✓ Respaldo de datos</li>
              </ul>
            </CardContent>
          </Card>
          </Link>

          {/* Settings */}
          <Link href="/configuracion">
          <Card className="hover:shadow-elegant-lg transition-all duration-300 cursor-pointer h-full border-2 hover:border-primary/30 rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 md:p-3 bg-gradient-teal rounded-xl shadow-elegant">
                  <Settings className="h-6 w-6 md:h-8 md:w-8 text-white" />
                </div>
                <CardTitle className="text-xl md:text-2xl">Configuración</CardTitle>
              </div>
              <CardDescription className="text-sm md:text-base">
                Ajusta los umbrales de rentabilidad y reglas de negocio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>✓ Umbral mínimo de beneficio</li>
                <li>✓ Gastos estimados de envío</li>
                <li>✓ Modificadores de precio por condición</li>
              </ul>
            </CardContent>
          </Card>
          </Link>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-12 md:mt-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">¿Listo para empezar?</h2>
          <Link href="/triage">
            <Button size="lg" className="text-base md:text-lg px-6 md:px-8 py-4 md:py-6">
              <BookOpen className="mr-2 h-5 w-5" />
              Escanear Primer Libro
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
