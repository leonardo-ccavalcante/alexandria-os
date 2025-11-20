import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Package, BarChart3, Upload, Download } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Alexandria OS
          </h1>
          <p className="text-2xl text-gray-600 mb-2">Donation Edition</p>
          <p className="text-lg text-gray-500">
            Sistema de Gestión de Inventario para Libros Usados
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Triage */}
          <Link href="/triage">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <BookOpen className="h-8 w-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-2xl">Triage & Scan</CardTitle>
                  </div>
                  <CardDescription>
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
          <Link href="/inventory">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <Package className="h-8 w-8 text-purple-600" />
                    </div>
                    <CardTitle className="text-2xl">Inventario</CardTitle>
                  </div>
                  <CardDescription>
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
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <BarChart3 className="h-8 w-8 text-green-600" />
                    </div>
                    <CardTitle className="text-2xl">Dashboard</CardTitle>
                  </div>
                  <CardDescription>
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
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Upload className="h-8 w-8 text-orange-600" />
                </div>
                <CardTitle className="text-2xl">Carga Masiva</CardTitle>
              </div>
              <CardDescription>
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

          {/* Batch Export */}
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-pink-100 rounded-lg">
                  <Download className="h-8 w-8 text-pink-600" />
                </div>
                <CardTitle className="text-2xl">Exportar Datos</CardTitle>
              </div>
              <CardDescription>
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

          {/* Settings */}
          <Card className="hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <BarChart3 className="h-8 w-8 text-indigo-600" />
                </div>
                <CardTitle className="text-2xl">Configuración</CardTitle>
              </div>
              <CardDescription>
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
        </div>

        {/* Quick Start */}
        <div className="text-center mt-16">
          <h2 className="text-2xl font-bold mb-4">¿Listo para empezar?</h2>
          <Link href="/triage">
            <a>
              <Button size="lg" className="text-lg px-8 py-6">
                <BookOpen className="mr-2 h-6 w-6" />
                Escanear Primer Libro
              </Button>
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}
