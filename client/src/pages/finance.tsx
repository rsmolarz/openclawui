import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, DollarSign, Plus, Trash2, TrendingUp, TrendingDown, Building2, User, Briefcase, Landmark, PiggyBank, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const SECTIONS = [
  { id: "personal", label: "Personal", icon: User },
  { id: "business1", label: "Business 1", icon: Building2 },
  { id: "business2", label: "Business 2", icon: Briefcase },
];

const EXPENSE_CATEGORIES = ["Food", "Transport", "Utilities", "Entertainment", "Medical", "Business", "Payroll", "Marketing", "Supplies", "Other"];

function getToday() { return new Date().toISOString().split("T")[0]; }
function getCurrentMonth() { return new Date().toISOString().slice(0, 7); }

export default function Finance() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("personal");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("Food");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(getToday());

  const { data: transactions = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/financial-transactions"] });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/financial-transactions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-transactions"] });
      setAmount(""); setDescription("");
      toast({ title: "Transaction added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/financial-transactions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/financial-transactions"] }),
  });

  const sectionTx = transactions.filter((t: any) => (t.section || "personal") === activeSection);
  const currentMonth = getCurrentMonth();
  const monthlyTx = sectionTx.filter((t: any) => t.date?.startsWith(currentMonth));
  const totalIncome = monthlyTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + (t.amount || 0), 0);
  const totalExpenses = monthlyTx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + (t.amount || 0), 0);
  const net = totalIncome - totalExpenses;

  const categoryData = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    amount: monthlyTx.filter((t: any) => t.type === "expense" && t.category === cat).reduce((s: number, t: any) => s + (t.amount || 0), 0),
  })).filter(c => c.amount > 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-finance">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <DollarSign className="h-6 w-6 text-emerald-500" /> Financial Dashboard
      </h1>

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="w-full justify-start" data-testid="tabs-sections">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <TabsTrigger key={s.id} value={s.id} className="gap-1" data-testid={`tab-${s.id}`}>
                <Icon className="h-4 w-4" /> {s.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {SECTIONS.map(section => (
          <TabsContent key={section.id} value={section.id} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card data-testid="card-income"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><TrendingUp className="h-4 w-4 text-green-500" /> Income</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-green-600" data-testid="text-income">${totalIncome.toFixed(2)}</div></CardContent>
              </Card>
              <Card data-testid="card-expenses"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><TrendingDown className="h-4 w-4 text-red-500" /> Expenses</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-red-600" data-testid="text-expenses">${totalExpenses.toFixed(2)}</div></CardContent>
              </Card>
              <Card data-testid="card-net"><CardHeader className="pb-2"><CardTitle className="text-sm">Net</CardTitle></CardHeader>
                <CardContent><div className={`text-2xl font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-net">${net.toFixed(2)}</div></CardContent>
              </Card>
            </div>

            <Card data-testid="card-add-transaction">
              <CardHeader><CardTitle className="text-lg">Add Transaction</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <Label>Type</Label>
                    <div className="flex gap-1 mt-1">
                      <Button variant={type === "income" ? "default" : "outline"} size="sm" onClick={() => setType("income")} data-testid="button-type-income">Income</Button>
                      <Button variant={type === "expense" ? "default" : "outline"} size="sm" onClick={() => setType("expense")} data-testid="button-type-expense">Expense</Button>
                    </div>
                  </div>
                  <div><Label>Amount</Label><Input type="number" step={0.01} min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" data-testid="input-amount" /></div>
                  <div><Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                      <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-date" /></div>
                  <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" data-testid="input-description" /></div>
                </div>
                <Button className="mt-3" onClick={() => { if (parseFloat(amount) > 0) addMutation.mutate({ amount: parseFloat(amount), type, category, description, date, section: activeSection }); }} disabled={addMutation.isPending} data-testid="button-add-transaction">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </CardContent>
            </Card>

            {categoryData.length > 0 && (
              <Card data-testid="card-chart">
                <CardHeader><CardTitle className="text-lg">Spending by Category</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={categoryData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card data-testid="card-transactions">
              <CardHeader><CardTitle className="text-lg">Recent Transactions</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : sectionTx.length === 0 ? <p className="text-sm text-muted-foreground">No transactions in this section yet</p> : (
                  <div className="space-y-2">
                    {sectionTx.slice(0, 20).map((tx: any) => (
                      <div key={tx.id} className="flex items-center gap-2 text-sm border-b pb-2" data-testid={`transaction-${tx.id}`}>
                        <Badge variant={tx.type === "income" ? "default" : "destructive"} className="text-xs">{tx.type}</Badge>
                        <span className={`font-medium ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}>${tx.amount?.toFixed(2)}</span>
                        <Badge variant="outline" className="text-xs">{tx.category}</Badge>
                        <span className="flex-1 text-muted-foreground truncate">{tx.description || ""}</span>
                        <span className="text-xs text-muted-foreground">{tx.date}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMutation.mutate(tx.id)} data-testid={`button-delete-${tx.id}`}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed" data-testid="card-quickbooks">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Landmark className="h-4 w-4 text-green-600" /> QuickBooks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <Settings className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground mb-2">Connect QuickBooks to auto-import business transactions</p>
              <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              <p className="text-xs text-muted-foreground mt-2">Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to enable</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed" data-testid="card-stifel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" /> Stifel Wealth Tracker
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <Settings className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground mb-2">Track investments and portfolio performance from Stifel</p>
              <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              <p className="text-xs text-muted-foreground mt-2">Set STIFEL_API_KEY to enable</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed" data-testid="card-voya">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-purple-600" /> Voya Retirement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <Settings className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground mb-2">Monitor retirement accounts and contributions from Voya</p>
              <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              <p className="text-xs text-muted-foreground mt-2">Set VOYA_API_KEY to enable</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
