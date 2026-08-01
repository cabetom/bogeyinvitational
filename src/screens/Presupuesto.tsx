import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthProvider";
import { useNav } from "../App";
import { getRoster } from "../lib/queries";
import {
  CATEGORIES, catInfo, getExpenses, addExpense, deleteExpense, getBalances,
  type ExpenseRow, type Settlement, type Balance,
} from "../lib/expenses";
import type { Player } from "../lib/types";
import { displayName, Spinner } from "../ui/misc";

function money(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

export function Presupuesto() {
  const nav = useNav();
  const { edition } = useAppData();
  const { player } = useAuth();

  const [roster, setRoster] = useState<Player[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [bal, setBal] = useState<{ balances: Balance[]; settlements: Settlement[]; total: number } | null>(null);
  const [showSettle, setShowSettle] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // form
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("otros");
  const [paidBy, setPaidBy] = useState("");
  const [splitAll, setSplitAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map(roster.map((p) => [p.id, displayName(p.full_name)]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [roster]);

  async function refresh() {
    if (!edition) return;
    const [exp, b] = await Promise.all([getExpenses(edition.id), getBalances(edition.id)]);
    setExpenses(exp);
    setBal(b);
  }

  useEffect(() => {
    if (!edition) return;
    getRoster(edition.id).then((r) => {
      const ps = r.map((x: any) => x.players as Player);
      setRoster(ps);
      setPicked(new Set(ps.map((p) => p.id)));
      if (player) setPaidBy((v) => v || player.id);
      else if (ps[0]) setPaidBy((v) => v || ps[0].id);
    });
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition]);

  if (!edition) return <Spinner />;

  const total = bal?.total ?? 0;
  const perHead = roster.length ? total / roster.length : 0;
  const myNet = bal?.balances.find((b) => b.player_id === player?.id)?.net ?? 0;

  function togglePick(id: string) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function onAdd() {
    const amt = Number(amount.replace(/[^\d.]/g, ""));
    if (!desc.trim() || !amt || !paidBy) return;
    const participantIds = splitAll ? roster.map((p) => p.id) : [...picked];
    if (participantIds.length === 0) return;
    setBusy(true);
    try {
      await addExpense(edition!.id, { description: desc.trim(), amount: amt, category, paidBy, participantIds });
      setDesc(""); setAmount(""); setCategory("otros"); setShowAdd(false);
      await refresh();
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Borrar este gasto?")) return;
    await deleteExpense(id);
    await refresh();
  }

  return (
    <>
      <button className="back" onClick={() => nav("more")}>‹ Volver a Más</button>
      <div className="sec-title" style={{ marginTop: 2 }}><h2>Gastos</h2></div>

      <div className="money-hero">
        <div className="k">Gasto total del grupo</div>
        <div className="v tabular">{money(total)}</div>
        <div className="sub">{roster.length} jugadores · {money(perHead)} por cabeza (promedio)</div>
        <div className="split">
          <div><div className="kk">Tu saldo</div><div className="vv tabular" style={{ color: myNet >= 0 ? "#8FE0B4" : "#F3B7A6" }}>
            {myNet >= 0 ? "+" : "−"}{money(Math.abs(myNet))}
          </div></div>
          <div><div className="kk">{myNet >= 0 ? "Te deben" : "Debés"}</div><div className="vv" style={{ fontSize: 12, fontWeight: 500, color: "#CFE0C9" }}>
            {myNet >= 0 ? "otros te tienen que pagar" : "tenés que transferir"}
          </div></div>
        </div>
      </div>

      <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => setShowSettle((v) => !v)}>
        🧮 {showSettle ? "Ocultar" : "Dividir la cuenta"}
      </button>

      {showSettle && bal && (
        <div className="card pad" style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Cómo saldar todo</div>
          {bal.settlements.length === 0 ? (
            <div className="muted">Está todo equilibrado — no hay pagos pendientes. 🎉</div>
          ) : (
            bal.settlements.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 2px", borderBottom: "1px solid var(--line-soft)", fontSize: 13 }}>
                <b>{nameOf(s.from)}</b>
                <span style={{ color: "var(--ink-faint)" }}>le paga a</span>
                <b>{nameOf(s.to)}</b>
                <span className="tabular" style={{ marginLeft: "auto", fontFamily: "var(--serif)", fontWeight: 700, color: "var(--pine)" }}>{money(s.amount)}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="sec-title"><h2>Gastos cargados</h2><button className="link" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cerrar" : "+ Agregar"}</button></div>

      {showAdd && (
        <div className="card pad">
          <label className="form-lbl" style={{ marginTop: 0 }}>¿Qué se pagó?</label>
          <input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: Alojamiento 3 noches" />
          <label className="form-lbl">Monto</label>
          <input className="field tabular" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          <label className="form-lbl">Tipo de gasto</label>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          <label className="form-lbl">¿Quién pagó?</label>
          <select className="field" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {roster.map((p) => <option key={p.id} value={p.id}>{displayName(p.full_name)}</option>)}
          </select>

          <label className="form-lbl">¿Cómo se divide?</label>
          <div className="segbar">
            <button className={splitAll ? "on" : ""} onClick={() => setSplitAll(true)}>Entre todos</button>
            <button className={!splitAll ? "on" : ""} onClick={() => setSplitAll(false)}>Elegir personas</button>
          </div>
          {!splitAll && (
            <div className="pick-grid">
              {roster.map((p) => (
                <button key={p.id} className={`pick ${picked.has(p.id) ? "on" : ""}`} onClick={() => togglePick(p.id)}>
                  {displayName(p.full_name)}
                </button>
              ))}
            </div>
          )}
          <button className="btn-primary" disabled={busy} onClick={onAdd}>{busy ? "Guardando…" : "Guardar gasto"}</button>
        </div>
      )}

      {!expenses ? <Spinner /> : (
        <div className="card pad" style={{ marginTop: 12 }}>
          {expenses.length === 0 && <div className="muted">Todavía no hay gastos cargados.</div>}
          {expenses.map((e) => {
            const c = catInfo(e.category);
            return (
              <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 2px", borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flex: "0 0 auto" }}>{c.icon}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{e.description}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Pagó {nameOf(e.paid_by)} · entre {e.participants}</div>
                </div>
                <div className="tabular" style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: 14 }}>{money(e.amount)}</div>
                {(player?.is_admin || player?.id === e.paid_by) && (
                  <button className="mini-btn danger" onClick={() => onDelete(e.id)}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
