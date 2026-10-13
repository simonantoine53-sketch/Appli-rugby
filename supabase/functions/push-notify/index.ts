// Envoi de notifications push (Web Push) aux membres d'une équipe.
// Appelée par le navigateur après une publication (kind = "published") ou une proposition (kind = "proposed"),
// ou par le staff pour relancer les membres qui n'ont pas encore ouvert une stratégie publiée (kind = "reminder").
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

    const { drawing_id, kind } = await req.json();
    if (!drawing_id || !["published", "proposed", "reminder"].includes(kind)) return json({ error: "paramètres invalides" }, 400);

    const admin = createClient(url, serviceKey);
    const { data: drawing } = await admin.from("drawings").select("id, title, team_id, owner_id, visibility").eq("id", drawing_id).maybeSingle();
    if (!drawing || !drawing.team_id) return json({ error: "dessin introuvable" }, 404);
    const expected = kind === "proposed" ? "proposed" : "team";
    if (drawing.visibility !== expected) return json({ error: "état du dessin incohérent" }, 409);

    // L'expéditeur doit être membre actif de l'équipe
    const { data: members } = await admin.from("team_members").select("user_id, role").eq("team_id", drawing.team_id).eq("status", "active");
    const me = (members || []).find((m) => m.user_id === user.id);
    if (!me) return json({ error: "pas membre de l'équipe" }, 403);
    if (kind === "reminder" && me.role !== "coach" && me.role !== "admin") return json({ error: "réservé au staff" }, 403);

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

    const { data: secrets } = await admin.from("app_secrets").select("key, value");
    const sec = Object.fromEntries((secrets || []).map((s) => [s.key, s.value]));
    if (!sec.vapid_public || !sec.vapid_private) return json({ error: "clés VAPID absentes" }, 500);
    webpush.setVapidDetails("mailto:simonantoine53@gmail.com", sec.vapid_public, sec.vapid_private);

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

    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", recipients);
    let sent = 0;
    const dead: string[] = [];
    await Promise.all((subs || []).map(async (s) => {
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
    return json({ sent, removed: dead.length, recipients: recipients.length });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
