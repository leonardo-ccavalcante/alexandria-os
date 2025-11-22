import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Triage from "./pages/Triage";
import Catalog from "./pages/Catalog";
import InventoryFinal from "./pages/InventoryFinal";
import Dashboard from "./pages/Dashboard";
import BatchOperations from "./pages/BatchOperations";
import Settings from "./pages/Settings";
import CargaMasiva from "./pages/CargaMasiva";
import ExportarDatos from "./pages/ExportarDatos";
import Configuracion from "./pages/Configuracion";
import { BookOpen, Package, BarChart3, Upload, Settings as SettingsIcon, Menu, X } from "lucide-react";
import { useState } from "react";

function Router() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/triage", icon: BookOpen, label: "Triage" },
    { href: "/inventario", icon: Package, label: "Inventario" },
    { href: "/dashboard", icon: BarChart3, label: "Dashboard" },
    { href: "/batch", icon: Upload, label: "Lotes" },
    { href: "/settings", icon: SettingsIcon, label: "Config" },
  ];

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/">
              <span className="text-xl md:text-2xl font-bold text-blue-600 flex items-center gap-2 cursor-pointer">
                <BookOpen className="h-6 w-6 md:h-8 md:w-8" />
                <span className="hidden sm:inline">Alexandria OS</span>
                <span className="sm:hidden">Alex</span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex gap-2 lg:gap-4">
              {navLinks.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm lg:text-base"
                >
                  <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              ))}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Mobile Navigation Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 border-t pt-4">
              <div className="flex flex-col gap-2">
                {navLinks.map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Routes */}
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/triage" component={Triage} />
        <Route path="/catalog" component={Catalog} />
       <Route path="/inventario" component={InventoryFinal} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/batch" component={BatchOperations} />
        <Route path="/settings" component={Settings} />
        <Route path="/carga-masiva" component={CargaMasiva} />
        <Route path="/exportar" component={ExportarDatos} />
        <Route path="/configuracion" component={Configuracion} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
