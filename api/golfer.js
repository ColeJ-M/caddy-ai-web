import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export default async function handler(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  try {
    if (req.method === "GET") {
      const { data: golfer, error: golferError } = await supabaseAdmin
        .from("golfers").select("*").eq("id", user.id).maybeSingle();
      if (golferError) throw golferError;
      if (!golfer) return res.status(200).json({ golfer: null, rounds: [], challenge: null, badges: [] });

      const { data: rounds } = await supabaseAdmin
        .from("rounds").select("*").eq("golfer_id", user.id).order("created_at", { ascending: false });

      const { data: challenge } = await supabaseAdmin
        .from("challenges").select("*").eq("golfer_id", user.id).eq("status", "active").maybeSingle();

      const { data: badges } = await supabaseAdmin
        .from("challenges").select("badge_name, completed_at").eq("golfer_id", user.id).eq("status", "completed").order("completed_at", { ascending: false });

      return res.status(200).json({ golfer, rounds: rounds || [], challenge: challenge || null, badges: badges || [] });
    }

    if (req.method === "POST") {
      const { onboarding } = req.body || {};
      if (!onboarding) return res.status(400).json({ error: "Missing onboarding data" });

      const { data, error } = await supabaseAdmin.from("golfers").insert({
        id: user.id,
        age: onboarding.age,
        years_playing: onboarding.yearsPlaying,
        seriousness: onboarding.seriousness,
        avg_nine: onboarding.avgNine,
        avg_eighteen: onboarding.avgEighteen,
        struggle: onboarding.struggle,
      }).select().single();
      if (error) throw error;

      return res.status(200).json({ golfer: data });
    }

    if (req.method === "PATCH") {
      const { username, homeCourse, favoriteClub, currentGoal } = req.body || {};
      const { data, error } = await supabaseAdmin.from("golfers").update({
        username, home_course: homeCourse, favorite_club: favoriteClub, current_goal: currentGoal,
      }).eq("id", user.id).select().single();
      if (error) throw error;
      return res.status(200).json({ golfer: data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load, create, or update golfer", details: String(error) });
  }
}