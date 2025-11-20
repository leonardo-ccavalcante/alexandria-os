import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save } from "lucide-react";
import { toast } from "sonner";

export default function Configuracion() {
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
