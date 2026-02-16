import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { Save, Sun, Moon, Monitor } from "lucide-react";
import { useState, useEffect } from "react";
import type { Setting } from "@shared/schema";

function ThemeCard({
  label,
  icon: Icon,
  selected,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ElementType;
  selected: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-md border transition-colors cursor-pointer ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover-elevate"
      }`}
      data-testid={testId}
    >
      <Icon className={`h-6 w-6 ${selected ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`text-sm font-medium ${selected ? "" : "text-muted-foreground"}`}>{label}</span>
    </button>
  );
}

export default function SettingsAppearance() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const appearanceSettings = settings?.filter((s) => s.category === "appearance") ?? [];

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (appearanceSettings.length > 0) {
      const values: Record<string, string> = {};
      appearanceSettings.forEach((s) => {
        values[s.key] = s.value;
      });
      setFormValues(values);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (updates: { key: string; value: string }[]) => {
      await apiRequest("PATCH", "/api/settings/bulk", { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Appearance settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const updates = Object.entries(formValues).map(([key, value]) => ({ key, value }));
    mutation.mutate(updates);
  };

  const updateValue = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleThemeSelect = (selectedTheme: string) => {
    if (selectedTheme === "light" && theme === "dark") toggleTheme();
    if (selectedTheme === "dark" && theme === "light") toggleTheme();
    updateValue("appearance.theme", selectedTheme);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Appearance
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Customize the look and feel of your dashboard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>Choose your preferred color scheme.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 max-w-sm">
            <ThemeCard
              label="Light"
              icon={Sun}
              selected={theme === "light"}
              onClick={() => handleThemeSelect("light")}
              testId="button-theme-light"
            />
            <ThemeCard
              label="Dark"
              icon={Moon}
              selected={theme === "dark"}
              onClick={() => handleThemeSelect("dark")}
              testId="button-theme-dark"
            />
            <ThemeCard
              label="System"
              icon={Monitor}
              selected={false}
              onClick={() => {
                const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                handleThemeSelect(prefersDark ? "dark" : "light");
              }}
              testId="button-theme-system"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display</CardTitle>
          <CardDescription>Configure display preferences for the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label data-testid="label-font-size">Font Size</Label>
              <Select
                value={formValues["appearance.font_size"] ?? "medium"}
                onValueChange={(val) => updateValue("appearance.font_size", val)}
              >
                <SelectTrigger data-testid="select-font-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label data-testid="label-density">Density</Label>
              <Select
                value={formValues["appearance.density"] ?? "comfortable"}
                onValueChange={(val) => updateValue("appearance.density", val)}
              >
                <SelectTrigger data-testid="select-density">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label data-testid="label-accent-color">Accent Color</Label>
            <Select
              value={formValues["appearance.accent_color"] ?? "blue"}
              onValueChange={(val) => updateValue("appearance.accent_color", val)}
            >
              <SelectTrigger data-testid="select-accent-color" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue">Blue</SelectItem>
                <SelectItem value="purple">Purple</SelectItem>
                <SelectItem value="green">Green</SelectItem>
                <SelectItem value="orange">Orange</SelectItem>
                <SelectItem value="red">Red</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          data-testid="button-save-appearance"
        >
          <Save className="h-4 w-4 mr-2" />
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
