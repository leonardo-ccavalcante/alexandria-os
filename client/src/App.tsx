import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Triage from "./pages/Triage";
import Catalog from "./pages/Catalog";
import Inventory from "./pages/Inventory";
import Dashboard from "./pages/Dashboard";
import BatchOperations from "./pages/BatchOperations";
import Settings from "./pages/Settings";
import { BookOpen, Package, BarChart3, Upload, Settings as SettingsIcon } from "lucide-react";

function Router() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/">
              <span className="text-2xl font-bold text-blue-600 flex items-center gap-2 cursor-pointer">
                <BookOpen className="h-8 w-8" />
                Alexandria OS
              </span>
            </Link>
            <div className="flex gap-4">
              <Link href="/triage" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                <BookOpen className="h-5 w-5" />
                Triage
              </Link>
              <Link href="/inventory" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                <Package className="h-5 w-5" />
                Inventario
              </Link>
              <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                <BarChart3 className="h-5 w-5" />
                Dashboard
              </Link>
              <Link href="/batch" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                <Upload className="h-5 w-5" />
                Lotes
              </Link>
              <Link href="/settings" className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                <SettingsIcon className="h-5 w-5" />
                Config
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Routes */}
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/triage" component={Triage} />
        <Route path="/catalog" component={Catalog} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/batch" component={BatchOperations} />
        <Route path="/settings" component={Settings} />
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
