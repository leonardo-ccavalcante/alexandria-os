import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PackageOpen, BookOpen, BarChart3, FileText, Upload } from "lucide-react";

interface EmptyStateProps {
  variant?: "inventory" | "dashboard" | "sales" | "catalog" | "generic";
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const VARIANTS = {
  inventory: {
    icon: PackageOpen,
    title: "No hay libros en el inventario",
    description: "Comienza escaneando tu primer libro en la página de Triage o importa un catálogo desde CSV.",
    actionLabel: "Ir a Triage",
  },
  dashboard: {
    icon: BarChart3,
    title: "No hay datos para mostrar",
    description: "Las métricas aparecerán aquí una vez que tengas libros catalogados y ventas registradas.",
    actionLabel: "Ver Inventario",
  },
  sales: {
    icon: FileText,
    title: "No hay ventas registradas",
    description: "Las transacciones de venta aparecerán aquí una vez que comiences a vender libros.",
    actionLabel: "Registrar Venta",
  },
  catalog: {
    icon: BookOpen,
    title: "No hay libros catalogados",
    description: "Escanea un ISBN o sube una foto de un libro para comenzar a catalogar.",
    actionLabel: "Escanear Libro",
  },
  generic: {
    icon: PackageOpen,
    title: "No hay datos disponibles",
    description: "Los datos aparecerán aquí cuando estén disponibles.",
    actionLabel: undefined,
  },
};

export function EmptyState({
  variant = "generic",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const config = VARIANTS[variant];
  const Icon = config.icon;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">
          {title || config.title}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {description || config.description}
        </p>
        {(actionLabel || config.actionLabel) && onAction && (
          <Button onClick={onAction}>
            {actionLabel || config.actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
