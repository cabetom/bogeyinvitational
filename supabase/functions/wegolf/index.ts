// Edge Function "wegolf": consulta de matrícula en we.golf, autoregistro de jugadores y actualización de hándicaps.
// we.golf: GET https://we.golf/busca-golfista-web-proc.php?srchstr=<matrícula> -> [{matricula, fullname, std, club, active}]
// robots.txt pide Crawl-delay: 3 -> las consultas en lote van de a una, con 3 s entre cada una.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DOMAIN = "@jugador.bogeyinvitational.com.ar";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface WG { matricula: string; fullname: string; std: string; club: string; active: string }

async function wegolf(m: string): Promise<WG | null> {
  const r = await fetch(`https://we.golf/busca-golfista-web-proc.php?srchstr=${encodeURIComponent(m)}`, {
    headers: { "User-Agent": "BogeyInvitational/1.0 (app de un grupo de amigos)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`we.golf respondió ${r.status}`);
  const arr = (await r.json()) as WG[];
  return (Array.isArray(arr) ? arr : []).find((x) => String(x.matricula) === m) ?? null;
}
const toIndex = (std: string | undefined) => {
  const n = Number(String(std ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- nombres ----
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s: string) => strip(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
const PARTICLES = new Set(["de", "del", "la", "las", "los", "do", "da", "dos", "das", "van", "von", "der", "di", "y"]);
const cap = (w: string) => w.split("-").map((p) => (p ? p[0].toLocaleUpperCase("es") + p.slice(1) : p)).join("-");
/** "PÉREZ santandrea" -> "Pérez Santandrea" · "DO COBO" -> "do Cobo" */
function properSurname(s: string): string {
  const w = s.trim().replace(/\s+/g, " ").toLocaleLowerCase("es").split(" ");
  return w.map((x) => (PARTICLES.has(x) && w.length > 1 ? x : cap(x))).join(" ");
}
/** "joaquín MARÍA" -> "Joaquín María" */
function properGiven(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("es").split(" ").map(cap).join(" ");
}
/** ¿El nombre escrito coincide con el de we.golf? (sin tildes, en cualquier orden, "Gian" ~ "Gianmarco") */
function nameMatches(typed: string, official: string): boolean {
  const a = tokens(typed), b = tokens(official);
  let hits = 0;
  for (const t of a) if (b.some((o) => o === t || (t.length >= 3 && (o.startsWith(t) || t.startsWith(o))))) hits++;
  return a.length > 0 && hits >= Math.min(2, a.length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // ---------- consulta pública (prellenar el registro) ----------
    if (body.action === "lookup") {
      const m = String(body.matricula ?? "").trim();
      if (!/^\d{3,8}$/.test(m)) return json({ error: "Matrícula inválida" }, 400);
      try {
        const wg = await wegolf(m);
        return json({ found: !!wg, fullname: wg?.fullname ?? null, index: toIndex(wg?.std), club: wg?.club ?? null });
      } catch {
        return json({ found: null }); // we.golf caído: el registro sigue igual
      }
    }

    // ---------- autoregistro ----------
    if (body.action === "register") {
      const m = String(body.matricula ?? "").trim();
      const nombre = String(body.nombre ?? "").trim();
      const apellido = String(body.apellido ?? "").trim();
      const team = String(body.team ?? "");
      const password = String(body.password ?? "");
      if (!/^\d{3,8}$/.test(m)) return json({ error: "Matrícula inválida" }, 400);
      if (nombre.length < 2 || apellido.length < 2 || nombre.length > 40 || apellido.length > 40) return json({ error: "Completá nombre y apellido" }, 400);
      if (team !== "Pato" && team !== "Tano") return json({ error: "Elegí tu equipo" }, 400);
      if (password.length < 6) return json({ error: "La contraseña tiene que tener al menos 6 caracteres" }, 400);
      if (password === m) return json({ error: "La contraseña no puede ser tu matrícula" }, 400);

      const dup = await admin.from("players").select("id").eq("matricula", m).maybeSingle();
      if (dup.error) throw dup.error;
      if (dup.data) return json({ error: "Esa matrícula ya está registrada. Entrá con tu contraseña o pedile a un admin que te la resetee." }, 409);

      // Verificación contra we.golf (si we.golf no responde, se deja pasar igual)
      let wg: WG | null = null, wgDown = false;
      try { wg = await wegolf(m); } catch { wgDown = true; }
      if (!wgDown && !wg) return json({ error: "No encontramos esa matrícula en we.golf. Revisá el número." }, 400);
      if (wg && !nameMatches(`${nombre} ${apellido}`, wg.fullname)) {
        return json({ error: `El nombre no coincide con el de esa matrícula en we.golf (figura como "${wg.fullname}").` }, 400);
      }

      const fullName = `${properSurname(apellido)}, ${properGiven(nombre)}`;
      const index = toIndex(wg?.std);

      // ¿Ya estaba cargado (de otra edición) sin matrícula? -> vincular en vez de duplicar
      const cands = await admin.from("players").select("id, full_name, team_name").is("matricula", null);
      if (cands.error) throw cands.error;
      const typed = new Set(tokens(`${nombre} ${apellido}`));
      const match = (cands.data ?? []).filter((p) => {
        const [sur, giv = ""] = String(p.full_name).split(",");
        const st = tokens(sur), gt = tokens(giv);
        return st.length > 0 && st.every((t) => typed.has(t)) &&
          (gt.length === 0 || gt.some((g) => [...typed].some((t) => t === g || (t.length >= 3 && (t.startsWith(g) || g.startsWith(t))))));
      });
      const existing = match.length === 1 ? match[0] : null;

      let playerId: string;
      if (existing) {
        playerId = existing.id;
        const u = await admin.from("players").update({
          matricula: m, team_name: existing.team_name ?? team,
          handicap_index: index, handicap_club: wg?.club ?? null, handicap_updated_at: wg ? new Date().toISOString() : null,
        }).eq("id", playerId);
        if (u.error) throw u.error;
      } else {
        playerId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
        const ins = await admin.from("players").insert({
          id: playerId, full_name: fullName, matricula: m, team_name: team, self_registered: true,
          handicap_index: index, handicap_club: wg?.club ?? null, handicap_updated_at: wg ? new Date().toISOString() : null,
        });
        if (ins.error) throw ins.error;
      }

      const created = await admin.auth.admin.createUser({
        email: `${m}${DOMAIN}`, password, email_confirm: true,
        user_metadata: { player_id: playerId, must_change_password: false },
      });
      if (created.error) {
        // deshacer para que pueda reintentar
        if (existing) await admin.from("players").update({ matricula: null }).eq("id", playerId);
        else await admin.from("players").delete().eq("id", playerId);
        const msg = /already|registered|exists/i.test(created.error.message)
          ? "Esa matrícula ya tiene usuario. Entrá con tu contraseña."
          : `No se pudo crear el usuario: ${created.error.message}`;
        return json({ error: msg }, 409);
      }
      return json({ ok: true, fullName: existing ? existing.full_name : fullName, linked: !!existing, index, wegolfVerified: !!wg });
    }

    // ---------- actualizar hándicaps (requiere estar logueado) ----------
    if (body.action === "refresh") {
      const auth = req.headers.get("Authorization") ?? "";
      const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const me = await user.rpc("current_player_id");
      if (me.error || !me.data) return json({ error: "Tenés que estar logueado" }, 401);
      const myId = me.data as string;

      const apply = async (id: string, m: string) => {
        const wg = await wegolf(m);
        const index = toIndex(wg?.std);
        if (!wg || index == null) return { id, ok: false, index: null as number | null };
        const u = await admin.from("players").update({ handicap_index: index, handicap_club: wg.club, handicap_updated_at: new Date().toISOString() }).eq("id", id);
        if (u.error) throw u.error;
        return { id, ok: true, index };
      };

      if (body.scope === "self") {
        const p = await admin.from("players").select("id, matricula").eq("id", myId).maybeSingle();
        if (p.error) throw p.error;
        if (!p.data?.matricula) return json({ results: [] });
        return json({ results: [await apply(p.data.id, p.data.matricula)] });
      }

      // plantel de la edición actual: solo admins
      const meRow = await admin.from("players").select("is_admin").eq("id", myId).maybeSingle();
      if (!meRow.data?.is_admin) return json({ error: "Solo admins" }, 403);
      const ed = await admin.from("editions").select("id").eq("is_current", true).maybeSingle();
      if (ed.error || !ed.data) return json({ error: "No hay edición actual" }, 400);
      const roster = await admin.from("edition_players").select("player_id, players(full_name, matricula)").eq("edition_id", ed.data.id);
      if (roster.error) throw roster.error;
      const results: { id: string; name: string; ok: boolean; index: number | null }[] = [];
      let first = true;
      for (const r of (roster.data ?? []) as any[]) {
        const m = r.players?.matricula;
        if (!m) { results.push({ id: r.player_id, name: r.players?.full_name ?? "?", ok: false, index: null }); continue; }
        if (!first) await sleep(3000); // Crawl-delay de we.golf
        first = false;
        try {
          const res = await apply(r.player_id, m);
          if (res.ok && body.syncEdition) {
            const u = await admin.from("edition_players").update({ handicap: res.index }).eq("edition_id", ed.data.id).eq("player_id", r.player_id);
            if (u.error) throw u.error;
          }
          results.push({ ...res, name: r.players?.full_name ?? "?" });
        } catch {
          results.push({ id: r.player_id, name: r.players?.full_name ?? "?", ok: false, index: null });
        }
      }
      return json({ results });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, 500);
  }
});
