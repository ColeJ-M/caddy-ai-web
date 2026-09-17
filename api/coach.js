import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const CHALLENGE_TEMPLATES = [
  { id: 1, description: "Hit at least 5 fairways in a round", badge: "Fairway Finder", check: (r) => Number(r.fairways) >= 5 },
  { id: 2, description: "Keep your putts under 30 in a round", badge: "Putting Pro", check: (r) => Number(r.putts) > 0 && Number(r.putts) < 30 },
  { id: 3, description: "Hit at least 4 greens in regulation", badge: "Green Machine", check: (r) => Number(r.gir) >= 4 },
  { id: 4, description: "Log a round with no chunks or thins", badge: "Clean Contact", check: (r) => r.miss?.id !== "chunk" && r.miss?.id !== "thin" },
];
function randomTemplate() { return CHALLENGE_TEMPLATES[Math.floor(Math.random() * CHALLENGE_TEMPLATES.length)]; }

async function processChallenge(golferId, roundRow) {
  const { data: active } = await supabaseAdmin.from("challenges").select("*").eq("golfer_id", golferId).eq("status", "active").maybeSingle();

  if (!active) {
    const t = randomTemplate();
    await supabaseAdmin.from("challenges").insert({ golfer_id: golferId, template_id: t.id, description: t.description, badge_name: t.badge, rounds_total: 3, rounds_completed: 0, status: "active" });
    return;
  }

  const template = CHALLENGE_TEMPLATES.find((t) => t.id === active.template_id);
  const success = template ? template.check(roundRow) : false;
  const newCompleted = active.rounds_completed + 1;

  if (success) {
    await supabaseAdmin.from("challenges").update({ status: "completed", rounds_completed: newCompleted, completed_at: new Date().toISOString() }).eq("id", active.id);
    const t2 = randomTemplate();
    await supabaseAdmin.from("challenges").insert({ golfer_id: golferId, template_id: t2.id, description: t2.description, badge_name: t2.badge, rounds_total: 3, rounds_completed: 0, status: "active" });
  } else if (newCompleted >= active.rounds_total) {
    await supabaseAdmin.from("challenges").update({ status: "expired", rounds_completed: newCompleted }).eq("id", active.id);
    const t2 = randomTemplate();
    await supabaseAdmin.from("challenges").insert({ golfer_id: golferId, template_id: t2.id, description: t2.description, badge_name: t2.badge, rounds_total: 3, rounds_completed: 0, status: "active" });
  } else {
    await supabaseAdmin.from("challenges").update({ rounds_completed: newCompleted }).eq("id", active.id);
  }
}

async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { onboarding, roundData } = req.body || {};
  if (!onboarding || !roundData) return res.status(400).json({ error: "Missing onboarding or roundData" });

  try {
    const { data: pastRounds } = await supabaseAdmin.from("rounds").select("*").eq("golfer_id", user.id).order("created_at", { ascending: false }).limit(10);
    const isFun = roundData.mode === "fun";

    const golferProfile = `
Golfer profile:
- Age: ${onboarding.age}
- Years playing: ${onboarding.yearsPlaying}
- Seriousness: ${onboarding.seriousness}
- Average 9-hole score: ${onboarding.avgNine}
- Average 18-hole score: ${onboarding.avgEighteen}
- Self-identified biggest struggle: ${onboarding.struggle}
`.trim();

    const historySummary = pastRounds && pastRounds.length > 0
      ? `\nPast rounds (most recent first, up to 10):\n` + pastRounds.map((r, i) =>
          `${i + 1}. ${new Date(r.created_at).toLocaleDateString()} - ${r.holes} holes, score ${r.score}, putts ${r.putts}, miss: ${r.miss?.label || "n/a"}, mood: ${r.emotion || "n/a"}, notes: ${r.notes || "none"}`
        ).join("\n")
      : "\nNo past rounds yet - this is their first logged round.";

    const roundSummary = `
This round:
- Holes played: ${roundData.holes}
- Score: ${roundData.score}
- Total putts: ${roundData.putts}
- Fairways hit: ${roundData.fairways || 0} of ${roundData.fairwayDenom}
- Greens in regulation: ${roundData.gir || 0} of ${roundData.girDenom}
- Most common miss: ${roundData.miss?.label} (${roundData.miss?.desc})
- Emotional state during round: ${roundData.emotion || "not specified"}
- Round notes from player: ${roundData.notes || "none given"}
`.trim();

    const jsonShape = isFun
      ? `{"summary": "2-3 friendly sentences about the round", "tip": "one plain-English tip, no jargon", "signOff": "a short warm sign-off", "videoQueries": ["youtube search phrase 1", "youtube search phrase 2", "youtube search phrase 3"]}`
      : `{"analysis": "2-4 sentences analyzing the round using the stats given, referencing their emotional state if it seems relevant to their performance", "primaryIssue": "1-2 sentences naming the single biggest thing to fix, tied to their miss pattern, stats, mental game, AND any relevant pattern from their past rounds", "drills": [{"title": "drill name", "time": "e.g. 15 minutes", "description": "1-2 sentence how-to"}, {"title": "drill name", "time": "e.g. 10 minutes", "description": "1-2 sentence how-to"}, {"title": "drill name", "time": "e.g. 20 minutes", "description": "1-2 sentence how-to"}], "focusPoints": ["actionable point 1", "actionable point 2", "actionable point 3"], "coachNote": "a personalized note that references their profile, mental/emotional state, AND, if relevant, a real pattern from their round history", "encouragement": "1-2 warm encouraging sentences", "videoQueries": ["youtube search phrase 1 tied to their miss", "youtube search phrase 2", "youtube search phrase 3"]}`;

    const system = `You are Caddy, an encouraging but expert personal AI golf coach. You remember this golfer's full history including their mental/emotional state and use it to make every report feel specialized to them personally. ${
      isFun ? "This is a FUN ROUND: keep it short, casual, plain English, no jargon, 2-3 sentences plus one tip."
            : "This is an IMPROVEMENT ROUND: give a full, specific, actionable coaching report."
    } Respond with ONLY a single valid JSON object, no markdown fences, no preamble, matching exactly this shape: ${jsonShape}`;

    const userMessage = `${golferProfile}\n${historySummary}\n\n${roundSummary}\n\nWrite the coaching report now as JSON only.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1200, system, messages: [{ role: "user", content: userMessage }] }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return res.status(502).json({ error: "Anthropic API error", details: errText });
    }

    const data = await anthropicResponse.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();
    const cleaned = text.replace(/^```json\s*|^```\s*|```$/g, "").trim();
    const report = JSON.parse(cleaned);

    const { data: insertedRound, error: insertError } = await supabaseAdmin.from("rounds").insert({
      golfer_id: user.id, holes: roundData.holes, mode: roundData.mode, score: roundData.score,
      putts: roundData.putts, fairways: roundData.fairways, fairway_denom: roundData.fairwayDenom,
      gir: roundData.gir, gir_denom: roundData.girDenom, miss: roundData.miss, notes: roundData.notes,
      emotion: roundData.emotion, report,
    }).select().single();
    if (insertError) throw insertError;

    if (!isFun) {
      await processChallenge(user.id, { fairways: roundData.fairways, putts: roundData.putts, gir: roundData.gir, miss: roundData.miss });
    }

    return res.status(200).json(report);
  } catch (error) {
    return res.status(500).json({ error: "Failed to generate report", details: String(error) });
  }
}