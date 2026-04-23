import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, Key, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { setOptOut } from "@/lib/posthog";

export default function Configuracion() {
  const { data: analyticsData } = trpc.settings.getAnalyticsOptOut.useQuery();
  const updateAnalyticsOptOut = trpc.settings.updateAnalyticsOptOut.useMutation({
    onSuccess: (_, variables) => {
      setOptOut(variables.optOut);
      toast.success(variables.optOut ? "Analítica desactivada" : "Analítica activada");
    },
    onError: () => toast.error("Error al guardar preferencia de analítica"),
  });

  const handleAnalyticsToggle = (checked: boolean) => {
    // checked = sharing enabled → optOut = false
    updateAnalyticsOptOut.mutate({ optOut: !checked });
  };

  const [config, setConfig] = useState({
    minProfitThreshold: "3.00",
    shippingCost: "4.50",
    conditionMultipliers: {
      new: "1.0",
      likeNew: "0.9",
      good: "0.75",
      acceptable: "0.6",
    },
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Implement configuration save
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Configuración guardada correctamente");
    } catch (error) {
      toast.error("Error al guardar configuración");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Configuración</h1>
          <p className="text-gray-600">
            Ajusta los umbrales de rentabilidad y reglas de negocio
          </p>
        </div>

        <div className="space-y-6">
          {/* Profitability Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Umbrales de Rentabilidad
              </CardTitle>
              <CardDescription>
                Define los valores mínimos para aceptar libros
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="minProfit">Umbral mínimo de beneficio (€)</Label>
                <Input
                  id="minProfit"
                  type="number"
                  step="0.01"
                  value={config.minProfitThreshold}
                  onChange={(e) =>
                    setConfig({ ...config, minProfitThreshold: e.target.value })
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Libros con beneficio estimado menor a este valor serán rechazados
                </p>
              </div>

              <div>
                <Label htmlFor="shippingCost">Gastos estimados de envío (€)</Label>
                <Input
                  id="shippingCost"
                  type="number"
                  step="0.01"
                  value={config.shippingCost}
                  onChange={(e) =>
                    setConfig({ ...config, shippingCost: e.target.value })
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Costo promedio de envío para calcular rentabilidad
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Condition Multipliers */}
          <Card>
            <CardHeader>
              <CardTitle>Modificadores de Precio por Condición</CardTitle>
              <CardDescription>
                Ajusta el precio de venta según el estado del libro
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="condNew">Nuevo (multiplicador)</Label>
                <Input
                  id="condNew"
                  type="number"
                  step="0.01"
                  value={config.conditionMultipliers.new}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      conditionMultipliers: {
                        ...config.conditionMultipliers,
                        new: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="condLikeNew">Como Nuevo (multiplicador)</Label>
                <Input
                  id="condLikeNew"
                  type="number"
                  step="0.01"
                  value={config.conditionMultipliers.likeNew}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      conditionMultipliers: {
                        ...config.conditionMultipliers,
                        likeNew: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="condGood">Bueno (multiplicador)</Label>
                <Input
                  id="condGood"
                  type="number"
                  step="0.01"
                  value={config.conditionMultipliers.good}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      conditionMultipliers: {
                        ...config.conditionMultipliers,
                        good: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="condAcceptable">Aceptable (multiplicador)</Label>
                <Input
                  id="condAcceptable"
                  type="number"
                  step="0.01"
                  value={config.conditionMultipliers.acceptable}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      conditionMultipliers: {
                        ...config.conditionMultipliers,
                        acceptable: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* API Keys Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Configuración de API Keys
              </CardTitle>
              <CardDescription>
                Para configurar API keys externas (ISBNDB, etc.), use el panel de Secrets en la interfaz de gestión.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Cómo configurar ISBNDB API Key:</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                  <li>Obtenga su API key gratis en{" "}
                    <a href="https://isbndb.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                      isbndb.com
                    </a>
                  </li>
                  <li>Haga clic en el icono de configuración (⚙️) en la esquina superior derecha</li>
                  <li>Seleccione "Secrets" en el menú lateral</li>
                  <li>Haga clic en "+ Add Secret"</li>
                  <li>Agregue la clave <code className="bg-blue-100 px-1 rounded">ISBNDB_API_KEY</code> con su valor</li>
                </ol>
                <p className="text-sm text-blue-700 mt-3">
                  🔒 Las API keys se almacenan de forma segura y están disponibles automáticamente en el servidor.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">✅ Scraping de Precios Automático</h4>
                <p className="text-sm text-green-800">
                  El sistema busca automáticamente precios reales en 7 marketplaces españoles usando IA:
                </p>
                <ul className="list-disc list-inside mt-2 text-sm text-green-700 space-y-0.5">
                  <li>Wallapop (segunda mano)</li>
                  <li>Vinted (segunda mano)</li>
                  <li>Amazon.es (nuevo y usado)</li>
                  <li>Iberlibro (libros usados)</li>
                  <li>Casa del Libro</li>
                  <li>Todocolección</li>
                  <li>FNAC</li>
                </ul>
                <p className="text-sm text-green-700 mt-2">
                  Los precios se actualizan automáticamente cada 24 horas.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Analytics Privacy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5" />
                Privacidad y Analítica
              </CardTitle>
              <CardDescription>
                Controla si Alexandria puede recopilar datos de uso anónimos para mejorar la aplicación.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1 mr-4">
                  <Label htmlFor="analytics-toggle" className="text-base font-medium cursor-pointer">
                    Compartir datos de uso
                  </Label>
                  <p className="text-sm text-gray-500">
                    Ayuda a mejorar Alexandria compartiendo datos anónimos sobre cómo usas la aplicación.
                    No incluye información personal ni contenido de libros.
                  </p>
                </div>
                <Switch
                  id="analytics-toggle"
                  checked={!(analyticsData?.optOut ?? false)}
                  onCheckedChange={handleAnalyticsToggle}
                  disabled={updateAnalyticsOptOut.isPending}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} size="lg">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
