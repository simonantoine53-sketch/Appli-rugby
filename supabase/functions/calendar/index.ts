// Abonnement à l'agenda : flux iCal personnel et secret (…/functions/v1/calendar?t=JETON).
// Contient les entraînements, matchs et rendez-vous de toutes les équipes de la personne (et de ses jeunes),
// de 2 mois en arrière à 1 an en avant ; un événement annulé reste dans le flux avec le statut « annulé ».
// Déployée sans vérification du jeton de connexion : le jeton secret de l'adresse (calendar_feeds) fait foi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const KIND: Record<string, string> = { match: "Match", training: "Entraînement", other: "Rendez-vous" };
const z = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const txt = (s: string | null | undefined) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
const paris = (d: string) => new Date(new Date(d).toLocaleString("en-US", { timeZone: "Europe/Paris" }));
const hm = (d: string) => { const x = paris(d); return `${x.getHours()}h${String(x.getMinutes()).padStart(2, "0")}`; };
// Lignes de plus de 75 octets : repliées (norme iCalendar)
const fold = (line: string) => {
  const out: string[] = []; let cur = "";
  for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = " " + ch; } else cur += ch; }
  out.push(cur); return out.join("\r\n");
};

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f]{20,64}$/.test(token)) return new Response("Adresse d'agenda invalide", { status: 404 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: feed } = await admin.from("calendar_feeds").select("user_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Adresse d'agenda introuvable : crée un nouveau lien dans l'appli", { status: 404 });

  const { data: kids } = await admin.from("profiles").select("id").eq("guardian_id", feed.user_id);
  const people = [feed.user_id, ...(kids || []).map((k: { id: string }) => k.id)];
  const { data: memb } = await admin.from("team_members").select("team_id").in("user_id", people).eq("status", "active");
  const teamIds = [...new Set((memb || []).map((m: { team_id: string }) => m.team_id))];
  const { data: teams } = teamIds.length ? await admin.from("teams").select("id, name").in("id", teamIds) : { data: [] };
  const teamName: Record<string, string> = {};
  (teams || []).forEach((t: { id: string; name: string }) => { teamName[t.id] = t.name; });
  const from = new Date(Date.now() - 60 * 864e5).toISOString(), to = new Date(Date.now() + 365 * 864e5).toISOString();
  const { data: evs } = teamIds.length
    ? await admin.from("team_events").select("id, team_id, kind, title, opponent, home, starts_at, meet_at, location, notes, cancelled, updated_at").in("team_id", teamIds).gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(1000)
    : { data: [] };

  const several = teamIds.length > 1;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rugbeo//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Rugbeo", "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT3H", "X-PUBLISHED-TTL:PT3H"];
  for (const ev of evs || []) {
    const what = ev.kind === "match" ? `Match ${ev.home === false ? "à" : "contre"} ${ev.opponent || "adversaire à définir"}` : ev.kind === "training" ? "Entraînement" : ev.title;
    const start = ev.meet_at || ev.starts_at;
    const end = new Date(new Date(ev.starts_at).getTime() + (ev.kind === "match" ? 2.5 : 1.5) * 3600e3);
    const desc = [ev.meet_at ? `Rendez-vous ${hm(ev.meet_at)}, début ${hm(ev.starts_at)}` : "", ev.kind === "training" && ev.title && ev.title !== "Entraînement" ? ev.title : "", ev.notes || ""].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${ev.id}@rugby-strat`, `DTSTAMP:${z(ev.updated_at || new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      fold(`SUMMARY:${txt(`${ev.cancelled ? "Annulé · " : ""}${several ? (teamName[ev.team_id] || "") + " · " : ""}${what || KIND[ev.kind]}`)}`));
    if (ev.location) lines.push(fold(`LOCATION:${txt(ev.location)}`));
    if (desc) lines.push(fold(`DESCRIPTION:${txt(desc)}`));
    if (ev.cancelled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="rugbeo.ics"', "Cache-Control": "private, max-age=900", "Access-Control-Allow-Origin": "*" },
  });
});
