"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  CheckCircle2,
  LayoutDashboard,
  BarChart3,
  Package,
  Boxes,
  Barcode,
  ScanLine,
  ShoppingBag,
  ClipboardCheck,
  Megaphone,
  Banknote,
  Users,
  Truck,
  Shield,
  Undo2,
  Printer,
  FileText,
  UserCog,
  Settings,
} from "lucide-react";

interface FeatureSetting {
  key: string;
  name: string;
  description: string;
  category: string;
  isVisible: boolean;
}

interface RoleSettings {
  role: string;
  features: FeatureSetting[];
}

const FEATURE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  analytics: BarChart3,
  products: Package,
  inventory: Boxes,
  barcodes: Barcode,
  pos: ScanLine,
  orders: ShoppingBag,
  campaigns: Megaphone,
  cash: Banknote,
  customers: Users,
  purchases: Truck,
  warranty: Shield,
  returns: Undo2,
  hardware: Printer,
  reports: FileText,
  audit: Shield,
  staff: UserCog,
  settings: Settings,
  guide: FileText,
};

const SIDEBAR_GROUPS = [
  { title: "Workspace", features: ["analytics"] },
  { title: "Catalog", features: ["products", "inventory", "barcodes"] },
  { title: "Sales", features: ["pos", "orders", "campaigns", "cash"] },
  { title: "Operations", features: ["customers", "purchases", "warranty", "returns", "hardware"] },
  { title: "System", features: ["reports", "audit", "staff", "settings", "guide"] },
];

export default function FeatureSettingsPage() {
  const [settings, setSettings] = useState<RoleSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/features");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        showMessage("error", "Failed to load feature settings");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      showMessage("error", "Network error");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const toggleFeature = async (role: string, featureKey: string, currentState: boolean) => {
    try {
      setUpdating(`${role}-${featureKey}`);
      const response = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          featureKey,
          isVisible: !currentState,
        }),
      });

      if (response.ok) {
        setSettings(
          settings.map((roleSettings) =>
            roleSettings.role === role
              ? {
                  ...roleSettings,
                  features: roleSettings.features.map((feature) =>
                    feature.key === featureKey ? { ...feature, isVisible: !currentState } : feature,
                  ),
                }
              : roleSettings,
          ),
        );
        showMessage("success", "Page visibility updated");
      } else {
        showMessage("error", "Failed to update");
      }
    } catch (error) {
      console.error("Error toggling feature:", error);
      showMessage("error", "Network error");
    } finally {
      setUpdating(null);
    }
  };

  const toggleAllInGroup = async (role: string, featureKeys: string[], isVisible: boolean) => {
    for (const key of featureKeys) {
      const roleSettings = settings.find((r) => r.role === role);
      const feature = roleSettings?.features.find((f) => f.key === key);
      if (feature && feature.isVisible !== isVisible) {
        await toggleFeature(role, key, !isVisible);
      }
    }
  };

  const initializeDefaults = async () => {
    try {
      setInitializing(true);
      const response = await fetch("/api/admin/features", {
        method: "PUT",
      });

      if (response.ok) {
        showMessage("success", "Default settings initialized");
        await fetchSettings();
      } else {
        showMessage("error", "Failed to initialize settings");
      }
    } catch (error) {
      console.error("Error initializing:", error);
      showMessage("error", "Network error");
    } finally {
      setInitializing(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: "Owner",
      manager: "Manager",
      salesman: "Salesman",
      customer: "Customer",
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      owner: "text-purple-600",
      manager: "text-blue-600",
      salesman: "text-green-600",
      customer: "text-orange-600",
    };
    return colors[role] || "text-gray-600";
  };

  const getFeatureIcon = (key: string) => {
    const Icon = FEATURE_ICONS[key];
    if (Icon) {
      return <Icon size={14} />;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight mb-2">Sidebar Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Control which sidebar pages each role can see. Changes apply immediately.
          </p>
        </div>
        <Button onClick={initializeDefaults} disabled={initializing} variant="outline" size="sm">
          {initializing ? (
            <>
              <Loader2 size={14} className="mr-1 animate-spin" /> Initializing
            </>
          ) : (
            <>
              <RefreshCw size={14} className="mr-1" /> Reset to Defaults
            </>
          )}
        </Button>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded border ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {message.type === "success" && <CheckCircle2 size={16} className="inline mr-2" />}
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {settings
          .filter((r) => r.role !== "owner")
          .map((roleSettings) => {
            const visibleCount = roleSettings.features.filter((f) => f.isVisible).length;
            const totalCount = roleSettings.features.length;

            return (
              <Card key={roleSettings.role} className="p-6">
                <div className="mb-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={`text-lg font-semibold ${getRoleColor(roleSettings.role)}`}>
                        {getRoleLabel(roleSettings.role)}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {visibleCount} of {totalCount} pages visible
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          const allKeys = roleSettings.features.map((f) => f.key);
                          toggleAllInGroup(roleSettings.role, allKeys, true);
                        }}
                        variant="outline"
                        size="sm"
                        disabled={visibleCount === totalCount}
                      >
                        <Eye size={14} className="mr-1" /> Show All
                      </Button>
                      <Button
                        onClick={() => {
                          const allKeys = roleSettings.features.map((f) => f.key);
                          toggleAllInGroup(roleSettings.role, allKeys, false);
                        }}
                        variant="outline"
                        size="sm"
                        disabled={visibleCount === 0}
                      >
                        <EyeOff size={14} className="mr-1" /> Hide All
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  {SIDEBAR_GROUPS.map((group) => {
                    const groupFeatures = roleSettings.features.filter((f) =>
                      group.features.includes(f.key),
                    );
                    if (groupFeatures.length === 0) return null;

                    const allVisible = groupFeatures.every((f) => f.isVisible);
                    const someVisible = groupFeatures.some((f) => f.isVisible);

                    return (
                      <div key={group.title}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
                            {group.title}
                          </h3>
                          <button
                            onClick={() =>
                              toggleAllInGroup(roleSettings.role, group.features, !allVisible)
                            }
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {allVisible ? "Hide all" : "Show all"}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {groupFeatures.map((feature) => (
                            <div
                              key={feature.key}
                              className="flex items-center justify-between py-2 px-3 rounded hover:bg-surface transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`${
                                    feature.isVisible ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {getFeatureIcon(feature.key)}
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{feature.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {feature.description}
                                  </div>
                                </div>
                              </div>
                              <Button
                                onClick={() =>
                                  toggleFeature(roleSettings.role, feature.key, feature.isVisible)
                                }
                                disabled={updating === `${roleSettings.role}-${feature.key}`}
                                variant={feature.isVisible ? "default" : "outline"}
                                size="sm"
                                className={feature.isVisible ? "" : "opacity-60"}
                              >
                                {updating === `${roleSettings.role}-${feature.key}` ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : feature.isVisible ? (
                                  <>
                                    <Eye size={14} className="mr-1" /> Visible
                                  </>
                                ) : (
                                  <>
                                    <EyeOff size={14} className="mr-1" /> Hidden
                                  </>
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
