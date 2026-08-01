import { supabase } from "./supabase";

export const CATEGORIES = [
  { key: "alojamiento", label: "Alojamiento", icon: "🏨" },
  { key: "green_fees", label: "Green fees", icon: "⛳" },
  { key: "traslados", label: "Traslados / nafta", icon: "🚐" },
  { key: "comida", label: "Comida", icon: "🍽️" },
  { key: "bebida", label: "Bebida", icon: "🍺" },
  { key: "premios", label: "Premios", icon: "🏆" },
  { key: "otros", label: "Otros", icon: "🧾" },
] as const;

export function catInfo(key: string | null) {
  return CATEGORIES.find((c) => c.key === key) ?? { key: "otros", label: "Otros", icon: "🧾" };
}

export interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  paid_by: string | null;
  participants: number;
}

export async function getExpenses(editionId: string): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, description, amount, category, paid_by, expense_shares(count)")
    .eq("edition_id", editionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    description: e.description,
    amount: Number(e.amount),
    category: e.category,
    paid_by: e.paid_by,
    participants: e.expense_shares?.[0]?.count ?? 0,
  }));
}

export async function addExpense(
  editionId: string,
  input: { description: string; amount: number; category: string; paidBy: string; participantIds: string[] }
): Promise<void> {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      edition_id: editionId,
      description: input.description.trim(),
      amount: input.amount,
      category: input.category,
      paid_by: input.paidBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  const expenseId = (data as { id: string }).id;

  const n = input.participantIds.length || 1;
  const base = Math.round((input.amount / n) * 100) / 100;
  const rows = input.participantIds.map((pid, i) => ({
    expense_id: expenseId,
    player_id: pid,
    // el último absorbe el redondeo para que sume exacto
    share: i === n - 1 ? Math.round((input.amount - base * (n - 1)) * 100) / 100 : base,
  }));
  if (rows.length) {
    const { error: e2 } = await supabase.from("expense_shares").insert(rows);
    if (e2) throw e2;
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export interface Balance { player_id: string; net: number } // >0 le deben, <0 debe
export interface Settlement { from: string; to: string; amount: number }

export async function getBalances(editionId: string): Promise<{ balances: Balance[]; settlements: Settlement[]; total: number }> {
  const exp = await supabase.from("expenses").select("id, amount, paid_by").eq("edition_id", editionId);
  if (exp.error) throw exp.error;
  const expenses = (exp.data ?? []) as { id: string; amount: number; paid_by: string | null }[];
  const ids = expenses.map((e) => e.id);

  const net = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    total += Number(e.amount);
    if (e.paid_by) net.set(e.paid_by, (net.get(e.paid_by) ?? 0) + Number(e.amount));
  }
  if (ids.length) {
    const sh = await supabase.from("expense_shares").select("player_id, share").in("expense_id", ids);
    if (sh.error) throw sh.error;
    for (const s of (sh.data ?? []) as { player_id: string; share: number }[]) {
      net.set(s.player_id, (net.get(s.player_id) ?? 0) - Number(s.share));
    }
  }

  const balances: Balance[] = [...net.entries()].map(([player_id, n]) => ({ player_id, net: Math.round(n * 100) / 100 }));

  // Conciliación: emparejar deudores con acreedores (greedy).
  const debtors = balances.filter((b) => b.net < -0.01).map((b) => ({ ...b })).sort((a, b) => a.net - b.net);
  const creditors = balances.filter((b) => b.net > 0.01).map((b) => ({ ...b })).sort((a, b) => b.net - a.net);
  const settlements: Settlement[] = [];
  let di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const pay = Math.min(-debtors[di].net, creditors[ci].net);
    if (pay > 0.01) {
      settlements.push({ from: debtors[di].player_id, to: creditors[ci].player_id, amount: Math.round(pay * 100) / 100 });
      debtors[di].net += pay;
      creditors[ci].net -= pay;
    }
    if (Math.abs(debtors[di].net) < 0.01) di++;
    if (Math.abs(creditors[ci].net) < 0.01) ci++;
  }
  return { balances, settlements, total };
}
