import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Plus, Trash2, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["All", "Produce", "Dairy", "Meat", "Bakery", "Frozen", "Pantry", "Beverages", "Other"];

export default function GroceryList() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("Other");
  const [filter, setFilter] = useState("All");
  const [mealPlan, setMealPlan] = useState("");

  const { data: items = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/grocery-items"] });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/grocery-items", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/grocery-items"] }); setName(""); setQuantity(""); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => apiRequest("PATCH", `/api/grocery-items/${id}`, { completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/grocery-items"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/grocery-items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/grocery-items"] }),
  });

  const aiMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/grocery-items/ai-suggest", { mealPlan });
      return res.json();
    },
    onSuccess: async (suggested: any[]) => {
      for (const item of suggested) {
        await apiRequest("POST", "/api/grocery-items", { name: item.name, quantity: item.quantity || "1", category: item.category || "Other" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/grocery-items"] });
      toast({ title: `Added ${suggested.length} items from AI` });
      setMealPlan("");
    },
  });

  const filtered = filter === "All" ? items : items.filter((i: any) => i.category === filter);
  const active = filtered.filter((i: any) => !i.completed);
  const completed = filtered.filter((i: any) => i.completed);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-grocery-list">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <ShoppingCart className="h-6 w-6 text-green-500" /> Smart Grocery List
      </h1>

      <Card data-testid="card-add-item">
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <Input className="flex-1 min-w-[150px]" placeholder="Item name" value={name} onChange={e => setName(e.target.value)} data-testid="input-item-name" />
            <Input className="w-24" placeholder="Qty" value={quantity} onChange={e => setQuantity(e.target.value)} data-testid="input-item-qty" />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-32" data-testid="select-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.slice(1).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => { if (name.trim()) addMutation.mutate({ name, quantity, category }); }} disabled={addMutation.isPending} data-testid="button-add-item">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-1 flex-wrap">
        {CATEGORIES.map(c => (
          <Button key={c} variant={filter === c ? "default" : "outline"} size="sm" onClick={() => setFilter(c)} data-testid={`button-filter-${c.toLowerCase()}`}>{c}</Button>
        ))}
      </div>

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <>
          <Card data-testid="card-active-items">
            <CardHeader className="pb-2"><CardTitle className="text-sm">To Buy ({active.length})</CardTitle></CardHeader>
            <CardContent>
              {active.length === 0 ? <p className="text-sm text-muted-foreground">No items</p> : (
                <div className="space-y-2">
                  {active.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm" data-testid={`item-${item.id}`}>
                      <Checkbox checked={false} onCheckedChange={() => toggleMutation.mutate({ id: item.id, completed: true })} data-testid={`checkbox-${item.id}`} />
                      <span className="flex-1">{item.name}</span>
                      {item.quantity && <span className="text-muted-foreground">{item.quantity}</span>}
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${item.id}`}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {completed.length > 0 && (
            <Card data-testid="card-completed-items">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Completed ({completed.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {completed.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm opacity-60" data-testid={`item-completed-${item.id}`}>
                      <Checkbox checked={true} onCheckedChange={() => toggleMutation.mutate({ id: item.id, completed: false })} data-testid={`checkbox-completed-${item.id}`} />
                      <span className="flex-1 line-through">{item.name}</span>
                      {item.quantity && <span className="text-muted-foreground">{item.quantity}</span>}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-completed-${item.id}`}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card data-testid="card-ai-suggest">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI Meal Planner</CardTitle></CardHeader>
        <CardContent>
          <Textarea placeholder="Describe your meal plan for the week..." value={mealPlan} onChange={e => setMealPlan(e.target.value)} rows={3} data-testid="input-meal-plan" />
          <Button className="mt-2" onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending || !mealPlan.trim()} data-testid="button-ai-suggest">
            {aiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate Grocery List
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
