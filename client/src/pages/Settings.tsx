import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Settings as SettingsIcon, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: allSettings, isLoading, refetch } = trpc.settings.getAll.useQuery();
  const updateSettingMutation = trpc.settings.update.useMutation();

  useEffect(() => {
    if (allSettings) {
      const settingsMap: Record<string, string> = {};
      allSettings.forEach((setting: any) => {
        settingsMap[setting.settingKey] = setting.settingValue;
      });
      setSettings(settingsMap);
    }
  }, [allSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update all settings
      for (const [key, value] of Object.entries(settings)) {
        await updateSettingMutation.mutateAsync({ key, value });
      }
      toast.success('Configuración guardada exitosamente');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto max-w-4xl space-y-6 py-8">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              <SettingsIcon className="h-8 w-8 text-indigo-600" />
              Configuración del Sistema
            </CardTitle>
            <CardDescription>
              Ajusta los umbrales de rentabilidad y reglas de negocio
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Profitability Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Umbrales de Rentabilidad</CardTitle>
            <CardDescription>
              Configura los valores mínimos para aceptar libros
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="min-profit">Beneficio Mínimo (€)</Label>
              <Input
                id="min-profit"
                type="number"
                step="0.01"
                value={settings.MIN_PROFIT_THRESHOLD || ''}
                onChange={(e) => handleChange('MIN_PROFIT_THRESHOLD', e.target.value)}
              />
              <p className="text-sm text-gray-500">
                Libros con beneficio menor a este valor serán marcados para DONAR
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimated-fees">Gastos Estimados (€)</Label>
              <Input
                id="estimated-fees"
                type="number"
                step="0.01"
                value={settings.ESTIMATED_FEES || ''}
                onChange={(e) => handleChange('ESTIMATED_FEES', e.target.value)}
              />
              <p className="text-sm text-gray-500">
                Promedio de envío + comisiones para cálculo de rentabilidad
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="auto-price-padding">Margen Adicional (€)</Label>
              <Input
                id="auto-price-padding"
                type="number"
                step="0.01"
                value={settings.AUTO_PRICE_PADDING || ''}
                onChange={(e) => handleChange('AUTO_PRICE_PADDING', e.target.value)}
              />
              <p className="text-sm text-gray-500">
                Margen extra añadido al precio sugerido automáticamente
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Commission Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Comisiones de Plataformas</CardTitle>
            <CardDescription>
              Porcentajes de comisión por canal de venta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amazon-commission">Comisión Amazon (%)</Label>
              <Input
                id="amazon-commission"
                type="number"
                step="0.01"
                value={settings.AMAZON_COMMISSION_PCT || ''}
                onChange={(e) => handleChange('AMAZON_COMMISSION_PCT', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="iberlibro-commission">Comisión Iberlibro (%)</Label>
              <Input
                id="iberlibro-commission"
                type="number"
                step="0.01"
                value={settings.IBERLIBRO_COMMISSION_PCT || ''}
                onChange={(e) => handleChange('IBERLIBRO_COMMISSION_PCT', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Price Modifiers */}
        <Card>
          <CardHeader>
            <CardTitle>Modificadores de Precio por Condición</CardTitle>
            <CardDescription>
              Multiplica el precio base según la condición del libro
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.PRICE_MODIFIERS && (() => {
              try {
                const modifiers = JSON.parse(settings.PRICE_MODIFIERS);
                return (
                  <>
                    <div className="space-y-2">
                      <Label>Como Nuevo</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={modifiers.COMO_NUEVO || ''}
                        onChange={(e) => {
                          const newModifiers = { ...modifiers, COMO_NUEVO: parseFloat(e.target.value) };
                          handleChange('PRICE_MODIFIERS', JSON.stringify(newModifiers));
                        }}
                      />
                      <p className="text-sm text-gray-500">
                        Multiplicador: {(modifiers.COMO_NUEVO * 100).toFixed(0)}% del precio base
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Bueno</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={modifiers.BUENO || ''}
                        onChange={(e) => {
                          const newModifiers = { ...modifiers, BUENO: parseFloat(e.target.value) };
                          handleChange('PRICE_MODIFIERS', JSON.stringify(newModifiers));
                        }}
                      />
                      <p className="text-sm text-gray-500">
                        Multiplicador: {(modifiers.BUENO * 100).toFixed(0)}% del precio base
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Aceptable</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={modifiers.ACEPTABLE || ''}
                        onChange={(e) => {
                          const newModifiers = { ...modifiers, ACEPTABLE: parseFloat(e.target.value) };
                          handleChange('PRICE_MODIFIERS', JSON.stringify(newModifiers));
                        }}
                      />
                      <p className="text-sm text-gray-500">
                        Multiplicador: {(modifiers.ACEPTABLE * 100).toFixed(0)}% del precio base
                      </p>
                    </div>
                  </>
                );
              } catch {
                return <p className="text-red-500">Error al cargar modificadores</p>;
              }
            })()}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="w-full md:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                Guardar Configuración
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
