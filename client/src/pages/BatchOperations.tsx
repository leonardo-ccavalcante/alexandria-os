import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Download, Loader2, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function BatchOperations() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const batchUpdateMutation = trpc.batch.updateFromCsv.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error('Por favor selecciona un archivo CSV');
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Por favor selecciona un archivo');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      // Read CSV file
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('El archivo CSV está vacío');
        setUploading(false);
        return;
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const uuidIndex = header.indexOf('uuid');
      const locationIndex = header.indexOf('ubicacion') >= 0 ? header.indexOf('ubicacion') : header.indexOf('location');
      const priceIndex = header.indexOf('precio') >= 0 ? header.indexOf('precio') : header.indexOf('price');
      const statusIndex = header.indexOf('estado') >= 0 ? header.indexOf('estado') : header.indexOf('status');
      const notesIndex = header.indexOf('notas') >= 0 ? header.indexOf('notas') : header.indexOf('notes');

      if (uuidIndex === -1) {
        toast.error('El CSV debe contener una columna "UUID"');
        setUploading(false);
        return;
      }

      // Parse rows
      const updates = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        
        const update: any = {
          uuid: values[uuidIndex],
        };

        if (locationIndex >= 0 && values[locationIndex]) {
          update.locationCode = values[locationIndex];
        }
        if (priceIndex >= 0 && values[priceIndex]) {
          update.listingPrice = values[priceIndex];
        }
        if (statusIndex >= 0 && values[statusIndex]) {
          update.status = values[statusIndex];
        }
        if (notesIndex >= 0 && values[notesIndex]) {
          update.conditionNotes = values[notesIndex];
        }

        if (update.uuid) {
          updates.push(update);
        }
      }

      if (updates.length === 0) {
        toast.error('No se encontraron filas válidas para actualizar');
        setUploading(false);
        return;
      }

      // Send to backend
      const response = await batchUpdateMutation.mutateAsync({ updates });
      setResult(response.stats);

      if (response.success) {
        toast.success(`${response.stats.updated} libros actualizados exitosamente`);
      } else {
        toast.warning(`${response.stats.updated} actualizados, ${response.stats.skipped} con errores`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    // Comprehensive CSV template with all fields and examples
    const headers = [
      "uuid",
      "isbn13",
      "title",
      "author",
      "publisher",
      "publicationYear",
      "conditionGrade",
      "locationCode",
      "listingPrice",
      "status",
      "conditionNotes"
    ];
    
    const exampleRows = [
      [
        "550e8400-e29b-41d4-a716-446655440000",
        "9788420412146",
        "Cien años de soledad",
        "Gabriel García Márquez",
        "Editorial Sudamericana",
        "1967",
        "BUENO",
        "02A",
        "15.00",
        "AVAILABLE",
        "Lomo ligeramente desgastado"
      ],
      [
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "9788408043638",
        "La sombra del viento",
        "Carlos Ruiz Zafón",
        "Editorial Planeta",
        "2001",
        "COMO_NUEVO",
        "03B",
        "12.50",
        "AVAILABLE",
        ""
      ],
      [
        "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "9788466331128",
        "El código Da Vinci",
        "Dan Brown",
        "Editorial Umbriel",
        "2003",
        "ACEPTABLE",
        "01C",
        "8.50",
        "LISTED",
        "Páginas amarillentas"
      ]
    ];
    
    const csvContent = [
      headers.join(","),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alexandria_template_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Plantilla CSV completa descargada');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto max-w-4xl space-y-6 py-8">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Upload className="h-8 w-8 text-orange-600" />
              Operaciones por Lote
            </CardTitle>
            <CardDescription>
              Actualiza múltiples libros a la vez mediante archivo CSV
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Instrucciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Formato del CSV:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                <li><strong>uuid</strong> (obligatorio): Identificador único del item</li>
                <li><strong>isbn13</strong> (recomendado): ISBN-13 del libro</li>
                <li><strong>title</strong> (recomendado): Título del libro</li>
                <li><strong>author</strong> (recomendado): Autor del libro</li>
                <li><strong>publisher</strong> (opcional): Editorial</li>
                <li><strong>publicationYear</strong> (opcional): Año de publicación</li>
                <li><strong>conditionGrade</strong> (opcional): COMO_NUEVO, BUENO, ACEPTABLE</li>
                <li><strong>locationCode</strong> (opcional): Código de ubicación (formato: 02A)</li>
                <li><strong>listingPrice</strong> (opcional): Precio de venta (formato: 15.00)</li>
                <li><strong>status</strong> (opcional): AVAILABLE, LISTED, SOLD, RESERVED, DONATED, MISSING</li>
                <li><strong>conditionNotes</strong> (opcional): Notas sobre el estado del libro</li>
              </ul>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Solo se actualizarán los campos que contengan valores. Los campos vacíos se ignorarán.
              </AlertDescription>
            </Alert>

            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Descargar Plantilla CSV
            </Button>
          </CardContent>
        </Card>

        {/* Upload Area */}
        <Card>
          <CardHeader>
            <CardTitle>Subir Archivo CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">
                  {file ? file.name : 'Haz clic para seleccionar un archivo CSV'}
                </p>
                <p className="text-sm text-gray-500">
                  o arrastra y suelta aquí
                </p>
              </label>
            </div>

            {file && (
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full"
                size="lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-5 w-5" />
                    Cargar y Actualizar
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card className="border-2 border-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Resultado de la Operación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{result.totalRows}</div>
                  <div className="text-sm text-gray-600">Total Filas</div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{result.updated}</div>
                  <div className="text-sm text-gray-600">Actualizados</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600">{result.skipped}</div>
                  <div className="text-sm text-gray-600">Errores</div>
                </div>
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Errores Encontrados:</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((error: any, index: number) => (
                      <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                        UUID {error.uuid}: {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Consejos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>✓ Exporta el inventario actual desde la página de Inventario para obtener los UUIDs</li>
              <li>✓ Edita el archivo exportado en Excel o Google Sheets</li>
              <li>✓ Asegúrate de que los códigos de ubicación sigan el formato correcto (02A, 15C, etc.)</li>
              <li>✓ Los precios deben ser números decimales (ej: 15.50, no 15,50)</li>
              <li>✓ Puedes actualizar solo algunos campos, dejando otros vacíos</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
