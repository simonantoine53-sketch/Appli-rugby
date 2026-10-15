// Envoi de notifications push (Web Push) aux membres d'une équipe.
// Appelée par le navigateur après une publication (kind = "published") ou une proposition (kind = "proposed"),
// ou par le staff pour relancer les membres qui n'ont pas encore ouvert une stratégie publiée (kind = "reminder").
// Agenda : nouvel événement (event_new), relance des membres sans réponse (event_reminder), annulation (event_cancelled),
// composition publiée (sheet_published).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "non connecté" }, 401);

    const { drawing_id, event_id, kind } = await req.json();
    const admin = createClient(url, serviceKey);
    if (["event_new", "event_reminder", "event_cancelled", "sheet_published"].includes(kind)) return await eventPush(admin, user.id, event_id, kind);
    if (!drawing_id || !["published", "proposed", "reminder"].includes(kind)) return json({ error: "paramètres invalides" }, 400);

    const { data: drawing } = await admin.from("drawings").select("id, title, team_id, owner_id, visibility").eq("id", drawing_id).maybeSingle();
    if (!drawing || !drawing.team_id) return json({ error: "dessin introuvable" }, 404);
    const expected = kind === "proposed" ? "proposed" : "team";
    if (drawing.visibility !== expected) return json({ error: "état du dessin incohérent" }, 409);

    // L'expéditeur doit être membre actif de l'équipe
    const { data: members } = await admin.from("team_members").select("user_id, role").eq("team_id", drawing.team_id).eq("status", "active");
    const me = (members || []).find((m) => m.user_id === user.id);
    // La direction du club a les droits du staff dans toutes ses équipes ; une proposition peut venir
    // d'un autre membre du club (stratégie partagée par le coach d'une autre équipe)
    const club = me ? null : await clubRole(admin, drawing.team_id, user.id);
    if (!me && club !== "responsable" && !(kind === "proposed" && club)) return json({ error: "pas membre de l'équipe" }, 403);
    if (kind === "reminder" && me?.role !== "coach" && me?.role !== "admin" && club !== "responsable") return json({ error: "réservé au staff" }, 403);

    // Relance : seulement ceux qui n'ont jamais ouvert la stratégie (l'auteur n'est pas relancé)
    let seen = new Set<string>();
    if (kind === "reminder") {
      const { data: views } = await admin.from("drawing_views").select("user_id").eq("drawing_id", drawing.id);
      seen = new Set((views || []).map((v) => v.user_id));
    }
    const recipients = (members || [])
      .filter((m) => m.user_id !== user.id)
      .filter((m) => kind === "proposed" ? (m.role === "coach" || m.role === "admin") : true)
      .filter((m) => kind === "reminder" ? m.user_id !== drawing.owner_id && !seen.has(m.user_id) : true)
      .map((m) => m.user_id);
    if (!recipients.length) return json({ sent: 0, recipients: 0 });

    if (!(await setVapid(admin))) return json({ error: "clés VAPID absentes" }, 500);

    const { data: team } = await admin.from("teams").select("name").eq("id", drawing.team_id).maybeSingle();
    const { data: sender } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const who = sender?.display_name || "Un membre";
    const teamName = team?.name || "équipe";
    const payload = JSON.stringify({
      title: kind === "published" ? `Nouvelle stratégie · ${teamName}` : kind === "reminder" ? `À regarder · ${teamName}` : `Proposition · ${teamName}`,
      body: kind === "published" ? `${who} a publié « ${drawing.title} »` : kind === "reminder" ? `${who} vous demande de regarder « ${drawing.title} »` : `${who} propose « ${drawing.title} »`,
      // Lien direct : la stratégie s'ouvre (et s'anime pour un joueur) ; une proposition ouvre la page Équipe du coach
      url: kind === "proposed" ? `#/team` : `#/d/${drawing.id}`,
      tag: `drawing-${drawing.id}`,
    });

    return json(await send(admin, recipients, payload));
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Admin = any;

async function send(admin: Admin, recipients: string[], payload: string) {
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", recipients);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all((subs || []).map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      else console.error("push", code, (e as Error).message);
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length, recipients: recipients.length };
}

async function setVapid(admin: Admin) {
  const { data: secrets } = await admin.from("app_secrets").select("key, value");
  const sec = Object.fromEntries((secrets || []).map((s: { key: string; value: string }) => [s.key, s.value]));
  if (!sec.vapid_public || !sec.vapid_private) return false;
  webpush.setVapidDetails("mailto:simonantoine53@gmail.com", sec.vapid_public, sec.vapid_private);
  return true;
}

/** Rôle dans le club de l'équipe (« responsable » = direction du club), ou null ; un super-admin compte comme direction. */
async function clubRole(admin: Admin, teamId: string, userId: string): Promise<string | null> {
  const { data: prof } = await admin.from("profiles").select("is_superadmin").eq("id", userId).maybeSingle();
  if (prof?.is_superadmin) return "responsable";
  const { data: t } = await admin.from("teams").select("club_id").eq("id", teamId).maybeSingle();
  if (!t?.club_id) return null;
  const { data: cm } = await admin.from("club_members").select("role").eq("club_id", t.club_id).eq("user_id", userId).maybeSingle();
  return cm?.role ?? null;
}

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function when(iso: string) {
  // Heure de Paris (les clubs sont en France)
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} à ${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Notifications de l'agenda : envoyées par le staff de l'équipe. */
async function eventPush(admin: Admin, senderId: string, eventId: string, kind: string) {
  if (!eventId) return json({ error: "paramètres invalides" }, 400);
  const { data: ev } = await admin.from("team_events").select("id, team_id, kind, title, opponent, home, starts_at, cancelled").eq("id", eventId).maybeSingle();
  if (!ev) return json({ error: "événement introuvable" }, 404);
  const { data: members } = await admin.from("team_members").select("user_id, role, plays").eq("team_id", ev.team_id).eq("status", "active");
  const me = (members || []).find((m: { user_id: string }) => m.user_id === senderId);
  if ((!me || (me.role !== "coach" && me.role !== "admin")) && await clubRole(admin, ev.team_id, senderId) !== "responsable") return json({ error: "réservé au staff" }, 403);
  let recipients = (members || []).map((m: { user_id: string }) => m.user_id).filter((id: string) => id !== senderId);
  // Convocation : seulement les convoqués (joueurs + staff qui joue aussi) ; annulation et compo : tout le monde
  if (kind === "event_new") {
    const convoked = new Set((members || []).filter((m: { role: string; plays?: boolean }) => m.role === "player" || m.plays).map((m: { user_id: string }) => m.user_id));
    recipients = recipients.filter((id: string) => convoked.has(id));
  }
  if (kind === "event_reminder") {
    // Relance : les convoqués qui n'ont pas encore répondu (joueurs + staff qui joue aussi)
    const { data: answers } = await admin.from("event_responses").select("user_id").eq("event_id", ev.id);
    const answered = new Set((answers || []).map((a: { user_id: string }) => a.user_id));
    const players = new Set((members || []).filter((m: { role: string; plays?: boolean }) => m.role === "player" || m.plays).map((m: { user_id: string }) => m.user_id));
    recipients = recipients.filter((id: string) => players.has(id) && !answered.has(id));
  }
  if (!recipients.length) return json({ sent: 0, recipients: 0 });
  if (!(await setVapid(admin))) return json({ error: "clés VAPID absentes" }, 500);
  const { data: team } = await admin.from("teams").select("name").eq("id", ev.team_id).maybeSingle();
  const label = ev.kind === "match" ? `Match ${ev.home === false ? "à" : "contre"} ${ev.opponent || ev.title}` : ev.title;
  const payload = JSON.stringify({
    title: kind === "sheet_published" ? `Compo publiée · ${team?.name || "équipe"}` : kind === "event_cancelled" ? `Annulé · ${team?.name || "équipe"}` : kind === "event_reminder" ? `Serez-vous là ? · ${team?.name || "équipe"}` : `Convocation · ${team?.name || "équipe"}`,
    body: kind === "sheet_published" ? `${label}, ${when(ev.starts_at)} : découvrez la composition.` : kind === "event_cancelled" ? `${label}, ${when(ev.starts_at)}, est annulé.` : `${label}, ${when(ev.starts_at)}. Répondez présent, peut-être ou absent.`,
    url: kind === "sheet_published" ? `#/compos/${ev.id}` : `#/agenda/${ev.id}`,
    tag: `event-${ev.id}`,
  });
  return json(await send(admin, recipients, payload));
}
