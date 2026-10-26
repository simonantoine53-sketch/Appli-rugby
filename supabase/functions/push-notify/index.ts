// Envoi de notifications push (Web Push) aux membres d'une équipe.
// Appelée par le navigateur après une publication (kind = "published") ou une proposition (kind = "proposed"),
// ou par le staff pour relancer les membres qui n'ont pas encore ouvert une stratégie publiée (kind = "reminder").
// Agenda : nouvel événement (event_new), relance des membres sans réponse (event_reminder), annulation (event_cancelled),
// modification (event_updated), composition publiée (sheet_published) ; event_ids : plusieurs événements de la même équipe
// (planning, import des matchs, annulation de plusieurs séances) en une seule notification. Adhésion : nouvelle demande (join_request), demande acceptée (join_accepted).
// Espace parents : un parent agit au nom d'un jeune (as_user) ; les notifications d'un jeune arrivent sur les appareils du parent.
// Sans connexion (déployée sans vérification du jeton) :
//  - réponse depuis la notification (corps { rsvp }) : jeton signé ici, valable pour une personne, un événement, jusqu'à son début ;
//  - rappels de la veille (en-tête x-cron-key) : appelée chaque heure par la tâche planifiée « rappels-veille ».
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const cronKey = req.headers.get("x-cron-key");
    const body = await req.json().catch(() => ({}));
    if (cronKey) return await dailyReminders(admin, cronKey, body.at);
    if (body.rsvp) return await rsvpAnswer(admin, body.rsvp);
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "non connecté" }, 401);

    const { drawing_id, event_id, event_ids, team_id, user_id, kind, as_user } = body;
    // Au nom d'un jeune : seulement son parent
    let actor = user.id;
    if (as_user && as_user !== user.id) {
      const { data: kid } = await admin.from("profiles").select("guardian_id").eq("id", as_user).maybeSingle();
      if (!kid || kid.guardian_id !== user.id) return json({ error: "action non autorisée" }, 403);
      actor = as_user;
    }
    if (kind === "join_request" || kind === "join_accepted") return await joinPush(admin, actor, team_id, user_id, kind);
    if (["event_new", "event_reminder", "event_cancelled", "event_updated", "sheet_published"].includes(kind)) {
      const ids = Array.isArray(event_ids) ? [...new Set(event_ids as string[])].slice(0, 100) : [];
      if (ids.length > 1 && kind !== "event_reminder" && kind !== "sheet_published") return await eventsPush(admin, user.id, ids, kind);
      return await eventPush(admin, user.id, ids[0] || event_id, kind);
    }
    if (!drawing_id || !["published", "proposed", "reminder"].includes(kind)) return json({ error: "paramètres invalides" }, 400);

    const { data: drawing } = await admin.from("drawings").select("id, title, team_id, owner_id, visibility").eq("id", drawing_id).maybeSingle();
    if (!drawing || !drawing.team_id) return json({ error: "dessin introuvable" }, 404);
    const expected = kind === "proposed" ? "proposed" : "team";
    if (drawing.visibility !== expected) return json({ error: "état du dessin incohérent" }, 409);

    // L'expéditeur doit être membre actif de l'équipe
    const { data: members } = await admin.from("team_members").select("user_id, role").eq("team_id", drawing.team_id).eq("status", "active");
    const me = (members || []).find((m) => m.user_id === actor);
    // La direction du club a les droits du staff dans toutes ses équipes ; une proposition peut venir
    // d'un autre membre du club (stratégie partagée par le coach d'une autre équipe)
    const club = me ? null : await clubRole(admin, drawing.team_id, actor);
    if (!me && club !== "responsable" && !(kind === "proposed" && club)) return json({ error: "pas membre de l'équipe" }, 403);
    if (kind === "reminder" && me?.role !== "coach" && me?.role !== "admin" && club !== "responsable") return json({ error: "réservé au staff" }, 403);

    // Relance : seulement ceux qui n'ont jamais ouvert la stratégie (l'auteur n'est pas relancé)
    let seen = new Set<string>();
    if (kind === "reminder") {
      const { data: views } = await admin.from("drawing_views").select("user_id").eq("drawing_id", drawing.id);
      seen = new Set((views || []).map((v) => v.user_id));
    }
    const recipients = (members || [])
      .filter((m) => m.user_id !== actor && m.user_id !== user.id)
      .filter((m) => kind === "proposed" ? (m.role === "coach" || m.role === "admin") : true)
      .filter((m) => kind === "reminder" ? m.user_id !== drawing.owner_id && !seen.has(m.user_id) : true)
      .map((m) => m.user_id);
    if (!recipients.length) return json({ sent: 0, recipients: 0 });

    if (!(await setVapid(admin))) return json({ error: "clés VAPID absentes" }, 500);

    const { data: team } = await admin.from("teams").select("name").eq("id", drawing.team_id).maybeSingle();
    const { data: sender } = await admin.from("profiles").select("display_name").eq("id", actor).maybeSingle();
    const who = sender?.display_name || "Un membre";
    const teamName = team?.name || "équipe";
    const payload = JSON.stringify({
      title: kind === "published" ? `Nouvelle stratégie · ${teamName}` : kind === "reminder" ? `À regarder · ${teamName}` : `Proposition · ${teamName}`,
      body: kind === "published" ? `${who} a publié « ${drawing.title} »` : kind === "reminder" ? `${who} te demande de regarder « ${drawing.title} »` : `${who} propose « ${drawing.title} »`,
      // Lien direct : la stratégie s'ouvre (et s'anime pour un joueur) ; une proposition ouvre Stratégies → Propositions
      url: kind === "proposed" ? `#/strategies/propositions` : `#/d/${drawing.id}`,
      tag: `drawing-${drawing.id}`,
    });

    return json(await send(admin, recipients, payload, user.id));
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Admin = any;

/** payload : le même pour tous, ou une fonction (destinataire → contenu) quand il contient un jeton de réponse personnel. */
async function send(admin: Admin, recipients: string[], payload: string | ((id: string) => Promise<string>), skip?: string) {
  // Un jeune n'a pas d'appareil : on prévient son parent, avec le prénom du jeune devant le titre (une notification par jeune)
  const forUser: Record<string, string[]> = {};
  const content: Record<string, string> = {};
  for (const id of recipients) content[id] = typeof payload === "string" ? payload : await payload(id);
  recipients.forEach((id) => { forUser[id] = [content[id]]; });
  const { data: kids, error: kidErr } = await admin.from("profiles").select("id, display_name, guardian_id").in("id", recipients).not("guardian_id", "is", null);
  if (!kidErr) (kids || []).forEach((k: { id: string; display_name: string; guardian_id: string }) => {
    if (k.guardian_id === skip) return;
    const p = JSON.parse(content[k.id]);
    (forUser[k.guardian_id] ||= []).push(JSON.stringify({ ...p, title: `${(k.display_name || "").split(" ")[0]} · ${p.title}`, tag: `${p.tag}-${k.id}` }));
  });
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", Object.keys(forUser));
  let sent = 0;
  const dead: string[] = [];
  await Promise.all((subs || []).flatMap((s: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }) => (forUser[s.user_id] || []).map(async (body) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      else console.error("push", code, (e as Error).message);
    }
  })));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", [...new Set(dead)]);
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

const eventLabel = (ev: { kind: string; home?: boolean | null; opponent?: string | null; title: string }) =>
  ev.kind === "match" ? `Match ${ev.home === false ? "à" : "contre"} ${ev.opponent || ev.title}` : ev.title;

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
  const { data: ev } = await admin.from("team_events").select("id, team_id, kind, title, opponent, home, starts_at, location, cancelled").eq("id", eventId).maybeSingle();
  if (!ev) return json({ error: "événement introuvable" }, 404);
  const members = await staffMembers(admin, ev.team_id, senderId);
  if (!members) return json({ error: "réservé au staff" }, 403);
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
  const label = eventLabel(ev);
  const base = {
    title: kind === "sheet_published" ? `Compo publiée · ${team?.name || "équipe"}` : kind === "event_cancelled" ? `Annulé · ${team?.name || "équipe"}` : kind === "event_updated" ? `Changement · ${team?.name || "équipe"}` : kind === "event_reminder" ? `Tu seras là ? · ${team?.name || "équipe"}` : `Convocation · ${team?.name || "équipe"}`,
    body: kind === "sheet_published" ? `${label}, ${when(ev.starts_at)} : découvre la compo.` : kind === "event_cancelled" ? `${label}, ${when(ev.starts_at)}, est annulé.` : kind === "event_updated" ? `${label} : désormais ${when(ev.starts_at)}${ev.location ? ` (${ev.location})` : ""}.` : `${label}, ${when(ev.starts_at)}. Réponds présent, peut-être ou absent.`,
    url: kind === "sheet_published" ? `#/compos/${ev.id}` : `#/agenda/${ev.id}`,
    tag: `event-${ev.id}`,
  };
  // Convocation et relance : boutons Présent / Absent dans la notification (Android, ordinateur) ; sur iPhone, l'appui ouvre l'écran de réponse
  if (kind !== "event_new" && kind !== "event_reminder") return json(await send(admin, recipients, JSON.stringify(base), senderId));
  const secret = await rsvpSecret(admin);
  return json(await send(admin, recipients, async (id) => JSON.stringify({ ...base, url: `#/agenda/${ev.id}/repondre`, rsvp: await rsvpToken(secret, id, ev) }), senderId));
}

/** Membres actifs de l'équipe, ou null si l'expéditeur n'est pas du staff (ni de la direction du club). */
async function staffMembers(admin: Admin, teamId: string, senderId: string) {
  const { data: members } = await admin.from("team_members").select("user_id, role, plays").eq("team_id", teamId).eq("status", "active");
  const me = (members || []).find((m: { user_id: string }) => m.user_id === senderId);
  if ((!me || (me.role !== "coach" && me.role !== "admin")) && await clubRole(admin, teamId, senderId) !== "responsable") return null;
  return (members || []) as { user_id: string; role: string; plays?: boolean }[];
}

/** Plusieurs événements d'une même équipe (planning, import, annulation groupée) : une seule notification par personne. */
async function eventsPush(admin: Admin, senderId: string, ids: string[], kind: string) {
  const { data: evs } = await admin.from("team_events").select("id, team_id, kind, title, opponent, home, starts_at, cancelled").in("id", ids).order("starts_at");
  if (!evs?.length) return json({ error: "événements introuvables" }, 404);
  const teamId = evs[0].team_id;
  if (evs.some((e: { team_id: string }) => e.team_id !== teamId)) return json({ error: "une seule équipe à la fois" }, 400);
  const members = await staffMembers(admin, teamId, senderId);
  if (!members) return json({ error: "réservé au staff" }, 403);
  const recipients = members.filter((m) => m.user_id !== senderId && (kind !== "event_new" || m.role === "player" || m.plays)).map((m) => m.user_id);
  if (!recipients.length) return json({ sent: 0, recipients: 0 });
  if (!(await setVapid(admin))) return json({ error: "clés VAPID absentes" }, 500);
  const { data: team } = await admin.from("teams").select("name").eq("id", teamId).maybeSingle();
  const n = evs.length;
  const allTrainings = evs.every((e: { kind: string }) => e.kind === "training"), allMatches = evs.every((e: { kind: string }) => e.kind === "match");
  const what = allTrainings ? "entraînements" : allMatches ? "matchs" : "événements";
  const list = evs.slice(0, 3).map((e: { kind: string; title: string; opponent?: string; home?: boolean; starts_at: string }) => (allTrainings ? "" : eventLabel(e) + " ") + when(e.starts_at).split(" à ")[0]).join(", ") + (n > 3 ? "…" : "");
  const payload = JSON.stringify({
    title: kind === "event_cancelled" ? `${n} ${what} annulés · ${team?.name || "équipe"}` : kind === "event_updated" ? `${n} ${what} modifiés · ${team?.name || "équipe"}` : `${n} nouveaux ${what} · ${team?.name || "équipe"}`,
    body: kind === "event_new" ? `${list}. Réponds dans l'agenda.` : `${list}. Détails dans l'agenda.`,
    url: "#/agenda",
    tag: `events-${teamId}-${kind}`,
  });
  return json(await send(admin, recipients, payload, senderId));
}

/** Adhésion : le staff et la direction du club sont prévenus d'une demande ; la personne est prévenue quand elle est acceptée. */
async function joinPush(admin: Admin, senderId: string, teamId: string, userId: string, kind: string) {
  if (!teamId) return json({ error: "paramètres invalides" }, 400);
  const { data: team } = await admin.from("teams").select("name, club_id").eq("id", teamId).maybeSingle();
  if (!team) return json({ error: "équipe introuvable" }, 404);
  const { data: sender } = await admin.from("profiles").select("display_name").eq("id", senderId).maybeSingle();
  let recipients: string[] = [];
  let payload: string;
  if (kind === "join_request") {
    // Seule la personne qui a une demande en attente peut prévenir le staff
    const { data: mine } = await admin.from("team_members").select("status, requested_as").eq("team_id", teamId).eq("user_id", senderId).maybeSingle();
    if (!mine || mine.status !== "pending") return json({ error: "aucune demande en attente" }, 403);
    const { data: staff } = await admin.from("team_members").select("user_id").eq("team_id", teamId).eq("status", "active").in("role", ["coach", "admin"]);
    const { data: heads } = team.club_id ? await admin.from("club_members").select("user_id").eq("club_id", team.club_id).eq("role", "responsable") : { data: [] };
    recipients = [...new Set([...(staff || []), ...(heads || [])].map((m: { user_id: string }) => m.user_id))].filter((id) => id !== senderId);
    payload = JSON.stringify({
      title: `Demande d'adhésion · ${team.name}`,
      body: `${sender?.display_name || "Quelqu'un"} demande à rejoindre l'équipe${mine.requested_as === "staff" ? " comme coach / encadrant" : ""}.`,
      url: "#/team",
      tag: `join-${teamId}-${senderId}`,
    });
  } else {
    // Seul le staff de l'équipe (ou la direction du club) annonce une acceptation, à une personne désormais membre
    if (!userId) return json({ error: "paramètres invalides" }, 400);
    const { data: me } = await admin.from("team_members").select("role, status").eq("team_id", teamId).eq("user_id", senderId).maybeSingle();
    const isStaff = me && me.status === "active" && (me.role === "coach" || me.role === "admin");
    if (!isStaff && await clubRole(admin, teamId, senderId) !== "responsable") return json({ error: "réservé au staff" }, 403);
    const { data: target } = await admin.from("team_members").select("status").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
    if (!target || target.status !== "active") return json({ error: "pas encore membre" }, 409);
    recipients = [userId];
    payload = JSON.stringify({
      title: `Bienvenue · ${team.name}`,
      body: `Ta demande est acceptée : tu fais partie de « ${team.name} ».`,
      url: "#/",
      tag: `join-${teamId}-${userId}`,
    });
  }
  if (!recipients.length) return json({ sent: 0, recipients: 0 });
  if (!(await setVapid(admin))) return json({ error: "clés VAPID absentes" }, 500);
  return json(await send(admin, recipients, payload));
}

/* ---------- Réponse depuis la notification ---------- */

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function rsvpSecret(admin: Admin): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("key", "rsvp_secret").maybeSingle();
  return data?.value ?? null;
}
async function sign(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
/** Jeton de réponse : une personne, un événement, valable jusqu'au début de l'événement. Rien n'est stocké. */
async function rsvpToken(secret: string | null, userId: string, ev: { id: string; starts_at: string }) {
  if (!secret) return undefined;
  const x = Math.floor(new Date(ev.starts_at).getTime() / 1000);
  const fn = `${Deno.env.get("SUPABASE_URL")}/functions/v1/push-notify`;
  return { api: fn, u: userId, e: ev.id, x, s: await sign(secret, `${userId}.${ev.id}.${x}`) };
}

/** Appelée par le service worker quand on appuie sur Présent ou Absent dans la notification. */
async function rsvpAnswer(admin: Admin, t: { u?: string; e?: string; x?: number; s?: string; status?: string }) {
  if (!t.u || !t.e || !t.x || !t.s || !["yes", "no", "maybe"].includes(t.status || "")) return json({ error: "paramètres invalides" }, 400);
  const secret = await rsvpSecret(admin);
  if (!secret || await sign(secret, `${t.u}.${t.e}.${t.x}`) !== t.s) return json({ error: "lien de réponse invalide" }, 403);
  if (Date.now() / 1000 > t.x) return json({ error: "l'événement a commencé" }, 410);
  const { data: ev } = await admin.from("team_events").select("id, team_id, kind, title, opponent, home, starts_at, cancelled").eq("id", t.e).maybeSingle();
  if (!ev || ev.cancelled) return json({ error: "événement annulé ou supprimé" }, 410);
  const { data: m } = await admin.from("team_members").select("role, plays, status").eq("team_id", ev.team_id).eq("user_id", t.u).maybeSingle();
  if (!m || m.status !== "active" || !(m.role === "player" || m.plays)) return json({ error: "plus convoqué pour cet événement" }, 403);
  const { error } = await admin.from("event_responses").upsert({ event_id: ev.id, user_id: t.u, status: t.status, set_by: t.u });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, status: t.status, label: eventLabel(ev), when: when(ev.starts_at) });
}

/* ---------- Rappels de la veille ---------- */

/** Chaque heure : pour les équipes dont c'est l'heure de rappel (heure de Paris), les événements de demain.
    Présents : rappel simple. Sans réponse ou « peut-être » : « Tu n'as pas répondu », avec les boutons.
    Absents, événements annulés, personnes qui ont coupé les rappels : rien. Journal : jamais deux fois le même rappel. */
async function dailyReminders(admin: Admin, key: string, at?: string) {
  const { data: k } = await admin.from("app_secrets").select("value").eq("key", "cron_key").maybeSingle();
  if (!k?.value || k.value !== key) return json({ error: "clé invalide" }, 403);
  const paris = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  // « at » : heure simulée pour les tests (seulement avec la clé de la tâche)
  const clock = at ? new Date(at) : new Date();
  const now = paris(clock);
  const hour = now.getHours();
  const { data: teams } = await admin.from("teams").select("id, name").eq("reminder_enabled", true).eq("reminder_hour", hour);
  if (!teams?.length) return json({ hour, teams: 0, sent: 0 });
  // Demain, en date de Paris : on prend une fenêtre large puis on filtre par jour
  const from = new Date(clock.getTime() + 2 * 3600e3).toISOString(), to = new Date(clock.getTime() + 54 * 3600e3).toISOString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const sameDay = (d: Date) => d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
  const { data: evs } = await admin.from("team_events").select("id, team_id, kind, title, opponent, home, starts_at, meet_at, location, cancelled")
    .in("team_id", teams.map((t: { id: string }) => t.id)).eq("cancelled", false).gte("starts_at", from).lte("starts_at", to);
  const events = (evs || []).filter((e: { starts_at: string }) => sameDay(paris(new Date(e.starts_at))));
  if (!events.length) return json({ hour, teams: teams.length, events: 0, sent: 0 });
  if (!(await setVapid(admin))) return json({ error: "clés VAPID absentes" }, 500);
  const secret = await rsvpSecret(admin);
  let sent = 0, people = 0;
  for (const ev of events) {
    const team = teams.find((t: { id: string }) => t.id === ev.team_id);
    const { data: members } = await admin.from("team_members").select("user_id, role, plays").eq("team_id", ev.team_id).eq("status", "active");
    const convoked = (members || []).filter((m: { role: string; plays?: boolean }) => m.role === "player" || m.plays).map((m: { user_id: string }) => m.user_id);
    if (!convoked.length) continue;
    const { data: answers } = await admin.from("event_responses").select("user_id, status").eq("event_id", ev.id);
    const status: Record<string, string> = {};
    (answers || []).forEach((a: { user_id: string; status: string }) => { status[a.user_id] = a.status; });
    // Préférences : la personne, ou pour un jeune le parent qui reçoit ses notifications
    const { data: profs } = await admin.from("profiles").select("id, guardian_id").in("id", convoked);
    const guardian: Record<string, string> = {};
    (profs || []).forEach((p: { id: string; guardian_id: string | null }) => { if (p.guardian_id) guardian[p.id] = p.guardian_id; });
    const { data: off } = await admin.from("profile_private").select("user_id").eq("reminders_off", true).in("user_id", [...convoked, ...Object.values(guardian)]);
    const muted = new Set((off || []).map((o: { user_id: string }) => o.user_id));
    const targets = convoked.filter((id: string) => status[id] !== "no" && !muted.has(id) && !(guardian[id] && muted.has(guardian[id])));
    if (!targets.length) continue;
    // Journal d'abord : seuls ceux qui n'avaient pas encore eu ce rappel le reçoivent
    const { data: logged } = await admin.from("reminder_log").upsert(targets.map((id: string) => ({ event_id: ev.id, user_id: id, kind: "veille" })), { onConflict: "event_id,user_id,kind", ignoreDuplicates: true }).select("user_id");
    const fresh = (logged || []).map((l: { user_id: string }) => l.user_id);
    if (!fresh.length) continue;
    people += fresh.length;
    const label = eventLabel(ev);
    const at = `demain à ${when(ev.starts_at).split(" à ")[1]}`;
    const meet = ev.meet_at ? `, rendez-vous à ${when(ev.meet_at).split(" à ")[1]}` : "";
    const res = await send(admin, fresh, async (id: string) => status[id] === "yes"
      ? JSON.stringify({ title: `Demain · ${team?.name || "équipe"}`, body: `${label} ${at}${meet}${ev.location ? ` (${ev.location})` : ""}. À demain !`, url: `#/agenda/${ev.id}`, tag: `event-${ev.id}` })
      : JSON.stringify({ title: `Tu n'as pas répondu · ${team?.name || "équipe"}`, body: `${label} ${at}${meet}. Tu seras là ?`, url: `#/agenda/${ev.id}/repondre`, tag: `event-${ev.id}`, rsvp: await rsvpToken(secret, id, ev) }));
    sent += res.sent;
  }
  return json({ hour, teams: teams.length, events: events.length, people, sent });
}
