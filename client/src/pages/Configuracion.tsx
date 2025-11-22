import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, Key, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
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
  const [isbndbApiKey, setIsbndbApiKey] = useState("");
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyValidationStatus, setKeyValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  
  // Load ISBNDB API key from settings
  const { data: isbndbSetting } = trpc.settings.get.useQuery({ key: 'ISBNDB_API_KEY' });
  const updateSettingMutation = trpc.settings.update.useMutation();
  const validateKeyMutation = trpc.settings.validateIsbndbKey.useMutation();
  
  useEffect(() => {
    if (isbndbSetting?.settingValue) {
      setIsbndbApiKey(isbndbSetting.settingValue);
      setKeyValidationStatus('valid');
    }
  }, [isbndbSetting]);

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

          {/* ISBNDB API Key Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                ISBNDB API Key
              </CardTitle>
              <CardDescription>
                Configure su clave de API de ISBNDB para usar como respaldo cuando Google Books no encuentra un libro.
                <br />
                Obtenga su API key gratis en{" "}
                <a href="https://isbndb.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  isbndb.com
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="isbndbKey">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="isbndbKey"
                    type="password"
                    placeholder="Ingrese su ISBNDB API key"
                    value={isbndbApiKey}
                    onChange={(e) => {
                      setIsbndbApiKey(e.target.value);
                      setKeyValidationStatus('idle');
                    }}
                  />
                  <Button
                    onClick={async () => {
                      if (!isbndbApiKey.trim()) {
                        toast.error('Por favor ingrese una API key');
                        return;
                      }
                      
                      setIsValidatingKey(true);
                      try {
                        const result = await validateKeyMutation.mutateAsync({ apiKey: isbndbApiKey });
                        if (result.valid) {
                          setKeyValidationStatus('valid');
                          await updateSettingMutation.mutateAsync({
                            key: 'ISBNDB_API_KEY',
                            value: isbndbApiKey,
                          });
                          toast.success('API key válida y guardada correctamente');
                        } else {
                          setKeyValidationStatus('invalid');
                          toast.error('API key inválida. Por favor verifique su clave.');
                        }
                      } catch (error: any) {
                        setKeyValidationStatus('invalid');
                        toast.error(error.message || 'Error al validar API key');
                      } finally {
                        setIsValidatingKey(false);
                      }
                    }}
                    disabled={isValidatingKey}
                  >
                    {isValidatingKey ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Validar y Guardar'
                    )}
                  </Button>
                </div>
                {keyValidationStatus === 'valid' && (
                  <div className="flex items-center gap-2 mt-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">API key configurada y válida</span>
                  </div>
                )}
                {keyValidationStatus === 'invalid' && (
                  <div className="flex items-center gap-2 mt-2 text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span className="text-sm">API key inválida</span>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Cuando Google Books no encuentra un libro, el sistema automáticamente intentará buscarlo en ISBNDB.
                </p>
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
