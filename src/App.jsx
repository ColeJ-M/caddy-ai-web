import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const MISSES = [
  { id: "slice", label: "Slice", desc: "Ball curves hard left-to-right (for righties)" },
  { id: "hook", label: "Hook", desc: "Ball curves hard right-to-left (for righties)" },
  { id: "chunk", label: "Chunk", desc: "Club hits the ground before the ball, fat contact" },
  { id: "thin", label: "Thin", desc: "Club hits the ball's equator, low screamer" },
  { id: "pull", label: "Pull", desc: "Ball starts left and stays left" },
  { id: "push", label: "Push", desc: "Ball starts right and stays right" },
];
const YEARS_OPTIONS = ["Just started", "1-2 years", "3-5 years", "5+ years"];
const SERIOUS_OPTIONS = ["Just for fun", "Want to improve", "Completely serious"];
const NINE_SCORE_OPTIONS = ["Over 54", "45-55", "36-44", "Under 36"];
const EIGHTEEN_SCORE_OPTIONS = ["Over 108", "90-110", "72-88", "Under 72"];
const STRUGGLE_OPTIONS = ["Driver", "Irons", "Short game", "Putting", "Mental game"];
const EMOTIONS = [
  "I got in my head after a bad shot",
  "I felt confident and relaxed",
  "I got frustrated and it affected my game",
  "I rushed my shots under pressure",
  "I stayed focused the whole round",
  "Outside distractions affected me",
];
const FREE_ROUNDS = 3;

export default function CaddyAI() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [onboarding, setOnboarding] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [rounds, setRounds] = useState([]);
  const [challenge, setChallenge] = useState(null);
  const [badges, setBadges] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [report, setReport] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadGolfer(); }, [session]);

  async function authedFetch(url, options = {}) {
    const token = session?.access_token;
    return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
  }

  async function loadGolfer() {
    const res = await authedFetch("/api/golfer");
    const data = await res.json();
    if (data.golfer) {
      setOnboarding({
        age: data.golfer.age, yearsPlaying: data.golfer.years_playing, seriousness: data.golfer.seriousness,
        avgNine: data.golfer.avg_nine, avgEighteen: data.golfer.avg_eighteen, struggle: data.golfer.struggle,
        username: data.golfer.username, homeCourse: data.golfer.home_course,
        favoriteClub: data.golfer.favorite_club, currentGoal: data.golfer.current_goal,
      });
      setRounds(data.rounds || []);
      setChallenge(data.challenge || null);
      setBadges(data.badges || []);
      setNeedsOnboarding(false);
    } else {
      setNeedsOnboarding(true);
    }
  }

  if (checking) return <div style={styles.appShell}><GlobalStyle /><LoadingScreen text="Loading..." /></div>;

  return (
    <div style={styles.appShell}>
      <GlobalStyle />
      {!session && <AuthScreen />}
      {session && needsOnboarding && (
        <Onboarding onDone={async (data) => {
          setOnboarding(data);
          await authedFetch("/api/golfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboarding: data }) });
          setNeedsOnboarding(false);
        }} />
      )}
      {session && !needsOnboarding && onboarding && (
        <div style={styles.appBody}>
          <div style={styles.tabContent}>
            {activeTab === "home" && (
              <HomeTab onboarding={onboarding} rounds={rounds} challenge={challenge} badges={badges}
                onLogRound={() => setActiveTab("new-round")}
                onOpenReport={(r) => setReport({ ...r.report, mode: r.mode })} />
            )}
            {activeTab === "new-round" && (
              <NewRoundTab roundsLogged={rounds.length} onboarding={onboarding} authedFetch={authedFetch}
                onSubmitted={(newReport) => { setReport(newReport); loadGolfer(); }} />
            )}
            {activeTab === "progress" && <ProgressTab rounds={rounds} />}
            {activeTab === "profile" && (
              <ProfileTab onboarding={onboarding} rounds={rounds} email={session.user.email}
                authedFetch={authedFetch} onSaved={loadGolfer} />
            )}
          </div>
          <BottomTabBar active={activeTab} onChange={setActiveTab} />
        </div>
      )}
      {report && <ReportOverlay report={report} onClose={() => { setReport(null); }} />}
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [error, setError] = useState(null);
  async function handleSend() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message); else setSent(true);
  }
  return (
    <div style={styles.screen}>
      <div style={styles.onboardHeader}><div style={styles.logoMark}>CADDY</div></div>
      <div style={styles.onboardBody}>
        <h1 style={styles.onboardTitle}>{sent ? "Check your email" : "Sign in to Caddy"}</h1>
        {sent ? <p style={{ marginTop: 16, color: "var(--muted)" }}>We sent a login link to {email}.</p> : (
          <>
            <input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...styles.numberInput, marginTop: 24 }} />
            {error && <div style={styles.errorText}>{error}</div>}
          </>
        )}
      </div>
      {!sent && <div style={styles.onboardFooter}><button style={{ ...styles.primaryBtn, opacity: email ? 1 : 0.4 }} disabled={!email} onClick={handleSend}>Send magic link</button></div>}
    </div>
  );
}

function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ age: "", yearsPlaying: "", seriousness: "", avgNine: "", avgEighteen: "", struggle: "" });
  const steps = [
    { title: "How old are you?", render: () => <input type="number" min="5" max="99" placeholder="Enter your age" value={data.age} onChange={(e) => setData({ ...data, age: e.target.value })} style={styles.numberInput} />, valid: () => data.age !== "" && Number(data.age) > 0 },
    { title: "How long have you been playing golf?", render: () => <ChoiceGrid options={YEARS_OPTIONS} value={data.yearsPlaying} onChange={(v) => setData({ ...data, yearsPlaying: v })} />, valid: () => !!data.yearsPlaying },
    { title: "How serious are you about improving?", render: () => <ChoiceGrid options={SERIOUS_OPTIONS} value={data.seriousness} onChange={(v) => setData({ ...data, seriousness: v })} />, valid: () => !!data.seriousness },
    { title: "What's your average 9-hole score?", render: () => <ChoiceGrid options={NINE_SCORE_OPTIONS} value={data.avgNine} onChange={(v) => setData({ ...data, avgNine: v })} />, valid: () => !!data.avgNine },
    { title: "What's your average 18-hole score?", render: () => <ChoiceGrid options={EIGHTEEN_SCORE_OPTIONS} value={data.avgEighteen} onChange={(v) => setData({ ...data, avgEighteen: v })} />, valid: () => !!data.avgEighteen },
    { title: "What's your biggest struggle right now?", render: () => <ChoiceGrid options={STRUGGLE_OPTIONS} value={data.struggle} onChange={(v) => setData({ ...data, struggle: v })} />, valid: () => !!data.struggle },
  ];
  const current = steps[step]; const isLast = step === steps.length - 1;
  return (
    <div style={styles.screen}>
      <div style={styles.onboardHeader}>
        <div style={styles.logoMark}>CADDY</div>
        <div style={styles.progressRow}>{steps.map((s, i) => <div key={i} style={{ ...styles.progressDot, background: i <= step ? "var(--fresh)" : "var(--fresh-light)" }} />)}</div>
      </div>
      <div style={styles.onboardBody}><h1 style={styles.onboardTitle}>{current.title}</h1><div style={{ marginTop: 24 }}>{current.render()}</div></div>
      <div style={styles.onboardFooter}>
        {step > 0 && <button style={styles.ghostBtn} onClick={() => setStep(step - 1)}>Back</button>}
        <button style={{ ...styles.primaryBtn, opacity: current.valid() ? 1 : 0.4 }} disabled={!current.valid()} onClick={() => (isLast ? onDone(data) : setStep(step + 1))}>{isLast ? "Start coaching" : "Next"}</button>
      </div>
    </div>
  );
}

function ChoiceGrid({ options, value, onChange }) {
  return <div style={styles.choiceGrid}>{options.map((opt) => <button key={opt} onClick={() => onChange(opt)} style={{ ...styles.choiceCard, ...(value === opt ? styles.choiceCardActive : {}) }}>{opt}</button>)}</div>;
}

function computeStreak(rounds) {
  if (!rounds.length) return 0;
  const days = [...new Set(rounds.map((r) => new Date(r.created_at).toDateString()))].map((d) => new Date(d)).sort((a, b) => b - a);
  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) { const diff = Math.round((days[i] - days[i + 1]) / 86400000); if (diff === 1) streak++; else break; }
  return streak;
}
function greeting() { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 18) return "Good afternoon"; return "Good evening"; }

function HomeTab({ onboarding, rounds, challenge, badges, onLogRound, onOpenReport }) {
  const last = rounds[0]; const streak = computeStreak(rounds);
  return (
    <div style={styles.tabScreen}>
      <div style={styles.heroCard}>
        <div style={styles.heroGreeting}>{greeting()}{onboarding?.username ? `, ${onboarding.username}` : ""}</div>
        <div style={styles.heroTitle}>Ready to play better today?</div>
        <button style={styles.heroBtn} onClick={onLogRound}>+ Log a round</button>
      </div>
      <div style={styles.statTilesRow}>
        <div style={styles.statTile}><div style={styles.statTileNum}>{streak}</div><div style={styles.statTileLabel}>day streak</div></div>
        <div style={styles.statTile}><div style={styles.statTileNum}>{rounds.length}</div><div style={styles.statTileLabel}>rounds logged</div></div>
      </div>

      {challenge && (
        <>
          <div style={styles.sectionLabel}>Current challenge</div>
          <div style={styles.challengeCard}>
            <div style={styles.challengeIcon}>🎯</div>
            <div style={{ flex: 1 }}>
              <div style={styles.challengeDesc}>{challenge.description}</div>
              <div style={styles.challengeProgressBar}>
                <div style={{ ...styles.challengeProgressFill, width: `${(challenge.rounds_completed / challenge.rounds_total) * 100}%` }} />
              </div>
              <div style={styles.challengeProgressText}>{challenge.rounds_completed} of {challenge.rounds_total} rounds</div>
            </div>
          </div>
        </>
      )}

      {badges.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Badges earned</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {badges.map((b, i) => <div key={i} style={styles.badgePill}>🏅 {b.badge_name}</div>)}
          </div>
        </>
      )}

      <div style={styles.sectionLabel}>Last round</div>
      {last ? (
        <button style={styles.cardClickable} onClick={() => onOpenReport(last)}>
          <div style={styles.rowBetween}>
            <div><div style={styles.cardBigNum}>{last.score}</div><div style={styles.cardSubtext}>{last.holes} holes &middot; {new Date(last.created_at).toLocaleDateString()}</div></div>
            <div style={styles.missPill}>{last.miss?.label}</div>
          </div>
          {last.report?.coachNote && <div style={styles.homeCoachNote}>{last.report.coachNote}</div>}
          <div style={styles.tapHint}>Tap to view full report →</div>
        </button>
      ) : <div style={styles.card}><div style={styles.cardSubtext}>No rounds logged yet.</div></div>}
    </div>
  );
}

function NewRoundTab({ roundsLogged, onSubmitted, onboarding, authedFetch }) {
  const [holes, setHoles] = useState(18); const [mode, setMode] = useState("improvement");
  const [score, setScore] = useState(""); const [putts, setPutts] = useState("");
  const [fairways, setFairways] = useState(""); const [gir, setGir] = useState("");
  const [miss, setMiss] = useState(null); const [notes, setNotes] = useState("");
  const [emotion, setEmotion] = useState(null);
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState(null);
  const fairwayDenom = holes === 18 ? 14 : 7; const girDenom = holes;
  const remainingFree = Math.max(FREE_ROUNDS - roundsLogged, 0); const locked = roundsLogged >= FREE_ROUNDS;
  const canSubmit = score !== "" && putts !== "" && miss;

  async function handleSubmit() {
    setSubmitting(true); setError(null);
    const roundData = { holes, mode, score, putts, fairways, fairwayDenom, gir, girDenom, miss: MISSES.find((m) => m.id === miss), notes, emotion };
    try {
      const response = await authedFetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboarding, roundData }) });
      if (!response.ok) throw new Error("Coach is unavailable right now. Try again in a moment.");
      const result = await response.json();
      onSubmitted({ ...result, mode });
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  }

  return (
    <div style={styles.tabScreen}>
      <div style={styles.tabHeaderRow}><div style={styles.tabHeaderTitle}>Log this round</div><div style={styles.trialChip}>{locked ? "Trial used" : `${remainingFree} free left`}</div></div>
      <ToggleRow value={mode} options={[{ label: "Fun round", value: "fun" }, { label: "Improvement round", value: "improvement" }]} onChange={setMode} />
      <div style={{ ...styles.card, marginTop: 16 }}>
        <ToggleRow value={holes} options={[{ label: "9 holes", value: 9 }, { label: "18 holes", value: 18 }]} onChange={setHoles} />
        <div style={styles.fieldGrid}>
          <StatField label="Score" value={score} onChange={setScore} placeholder={holes === 18 ? "e.g. 92" : "e.g. 45"} />
          <StatField label="Total putts" value={putts} onChange={setPutts} placeholder={holes === 18 ? "e.g. 34" : "e.g. 17"} />
          <StatField label={`Fairways hit (of ${fairwayDenom})`} value={fairways} onChange={setFairways} placeholder={holes === 18 ? "e.g. 6" : "e.g. 3"} />
          <StatField label={`Greens in reg. (of ${girDenom})`} value={gir} onChange={setGir} placeholder={holes === 18 ? "e.g. 5" : "e.g. 3"} />
        </div>
        <div style={styles.sectionLabel}>Most common miss today</div>
        <div style={styles.missGrid}>{MISSES.map((m) => <button key={m.id} onClick={() => setMiss(m.id)} style={{ ...styles.missCard, ...(miss === m.id ? styles.missCardActive : {}) }}><div style={styles.missLabel}>{m.label}</div><div style={styles.missDesc}>{m.desc}</div></button>)}</div>
        <div style={styles.sectionLabel}>Round notes</div>
        <textarea style={styles.textarea} placeholder='e.g. "Chunked 3 wedges"' value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

        <div style={styles.sectionLabel}>How did you feel out there?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {EMOTIONS.map((e) => (
            <button key={e} onClick={() => setEmotion(e)} style={{ ...styles.emotionCard, ...(emotion === e ? styles.emotionCardActive : {}) }}>{e}</button>
          ))}
        </div>

        <button style={{ ...styles.primaryBtn, width: "100%", marginTop: 20, opacity: canSubmit && !locked && !submitting ? 1 : 0.4 }} disabled={!canSubmit || locked || submitting} onClick={handleSubmit}>{submitting ? "Reading your round..." : "Get my coaching report"}</button>
        {error && <div style={styles.errorText}>{error}</div>}
      </div>
    </div>
  );
}

function StatField({ label, value, onChange, placeholder }) {
  return <label style={styles.statField}><span style={styles.statFieldLabel}>{label}</span><input type="number" min="0" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={styles.statFieldInput} /></label>;
}
function ToggleRow({ value, options, onChange }) {
  return <div style={styles.toggleRow}>{options.map((opt) => <button key={opt.value} onClick={() => onChange(opt.value)} style={{ ...styles.toggleBtn, ...(value === opt.value ? styles.toggleBtnActive : {}) }}>{opt.label}</button>)}</div>;
}

function Sparkline({ data, color, big }) {
  if (!data.length) return <div style={styles.cardSubtext}>Not enough rounds yet</div>;
  const w = 280, h = big ? 140 : 60, pad = 8; const max = Math.max(...data), min = Math.min(...data); const range = max - min || 1;
  const pts = data.map((v, i) => [pad + (i / (data.length - 1 || 1)) * (w - 2 * pad), h - pad - ((v - min) / range) * (h - 2 * pad)]);
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: big ? 140 : 60 }}>
    <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={big ? 4 : 3} fill={color} />)}
  </svg>;
}

function ProgressTab({ rounds }) {
  const [expanded, setExpanded] = useState(null);
  const chrono = [...rounds].reverse();
  const metrics = [
    { key: "score", title: "Score over time", color: "#163C2C", suffix: "", data: chrono.map((r) => ({ v: Number(r.score), d: r.created_at })).filter((x) => !isNaN(x.v)) },
    { key: "fairway", title: "Fairways hit %", color: "#2D6A4F", suffix: "%", data: chrono.map((r) => ({ v: (Number(r.fairways) / (Number(r.fairway_denom) || 1)) * 100, d: r.created_at })).filter((x) => !isNaN(x.v)) },
    { key: "gir", title: "Greens in regulation %", color: "#52B788", suffix: "%", data: chrono.map((r) => ({ v: (Number(r.gir) / (Number(r.gir_denom) || 1)) * 100, d: r.created_at })).filter((x) => !isNaN(x.v)) },
    { key: "putts", title: "Putts per round", color: "#C9A227", suffix: "", data: chrono.map((r) => ({ v: Number(r.putts), d: r.created_at })).filter((x) => !isNaN(x.v)) },
  ];
  return (
    <div style={styles.tabScreen}>
      <div style={styles.tabHeaderTitle}>Your progress</div>
      {metrics.map((m) => (
        <div key={m.key} style={{ ...styles.card, marginTop: 14 }}>
          <button style={styles.progressCardHeader} onClick={() => setExpanded(expanded === m.key ? null : m.key)}>
            <div style={styles.progressCardTitle}>{m.title}</div>
            <div style={styles.rowBetween}>
              {m.data.length > 0 && <div style={styles.progressCardValue}>{Math.round(m.data[m.data.length - 1].v)}{m.suffix}</div>}
              <div style={styles.expandArrow}>{expanded === m.key ? "▲" : "▼"}</div>
            </div>
          </button>
          <Sparkline data={m.data.map((x) => x.v)} color={m.color} />
          {expanded === m.key && (
            <div style={styles.detailList}>
              {m.data.length === 0 && <div style={styles.cardSubtext}>No data yet</div>}
              {[...m.data].reverse().map((x, i) => (
                <div key={i} style={styles.detailRow}>
                  <span style={styles.detailDate}>{new Date(x.d).toLocaleDateString()}</span>
                  <span style={styles.detailValue}>{Math.round(x.v)}{m.suffix}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProfileTab({ onboarding, rounds, email, authedFetch, onSaved }) {
  const [username, setUsername] = useState(onboarding.username || "");
  const [homeCourse, setHomeCourse] = useState(onboarding.homeCourse || "");
  const [favoriteClub, setFavoriteClub] = useState(onboarding.favoriteClub || "");
  const [currentGoal, setCurrentGoal] = useState(onboarding.currentGoal || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await authedFetch("/api/golfer", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, homeCourse, favoriteClub, currentGoal }) });
    await onSaved();
    setSaving(false);
  }

  if (!onboarding) return null;
  const golfRows = [["Age", onboarding.age], ["Years playing", onboarding.yearsPlaying], ["Seriousness", onboarding.seriousness], ["Average 9-hole score", onboarding.avgNine], ["Average 18-hole score", onboarding.avgEighteen], ["Biggest struggle", onboarding.struggle], ["Total rounds logged", rounds.length]];

  return (
    <div style={styles.tabScreen}>
      <div style={styles.tabHeaderTitle}>Your profile</div>
      <div style={{ ...styles.card, marginTop: 14 }}>
        <div style={styles.sectionLabel}>Personal</div>
        <label style={styles.statField}><span style={styles.statFieldLabel}>Display name</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Cole" style={styles.profileInput} /></label>
        <label style={{ ...styles.statField, marginTop: 12 }}><span style={styles.statFieldLabel}>Home course</span><input value={homeCourse} onChange={(e) => setHomeCourse(e.target.value)} placeholder="e.g. Pine Valley" style={styles.profileInput} /></label>
        <label style={{ ...styles.statField, marginTop: 12 }}><span style={styles.statFieldLabel}>Favorite club</span><input value={favoriteClub} onChange={(e) => setFavoriteClub(e.target.value)} placeholder="e.g. 7-iron" style={styles.profileInput} /></label>
        <label style={{ ...styles.statField, marginTop: 12 }}><span style={styles.statFieldLabel}>Current goal</span><input value={currentGoal} onChange={(e) => setCurrentGoal(e.target.value)} placeholder="e.g. Break 90" style={styles.profileInput} /></label>
        <button style={{ ...styles.primaryBtn, width: "100%", marginTop: 16, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSave}>{saving ? "Saving..." : "Save profile"}</button>
      </div>

      <div style={{ ...styles.card, marginTop: 14 }}>
        <div style={styles.sectionLabel}>Golf details</div>
        <div style={styles.profileRow}><span style={styles.profileLabel}>Email</span><span style={styles.profileValue}>{email}</span></div>
        {golfRows.map(([label, value]) => <div key={label} style={styles.profileRow}><span style={styles.profileLabel}>{label}</span><span style={styles.profileValue}>{value}</span></div>)}
      </div>
      <button style={{ ...styles.ghostBtn, width: "100%", marginTop: 16 }} onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}

function ReportOverlay({ report, onClose }) {
  const isFun = report.mode === "fun";
  return (
    <div style={styles.overlay}>
      <div style={styles.overlayCard}>
        <div style={styles.overlayHandle} />
        <div style={{ ...styles.reportHero, background: isFun ? "linear-gradient(135deg, #2D6A4F, #163C2C)" : "linear-gradient(135deg, #163C2C, #0E2A1E)" }}>
          <div style={styles.reportHeroBadge}>{isFun ? "FUN ROUND" : "IMPROVEMENT ROUND"}</div>
          <div style={styles.reportHeroTitle}>{isFun ? "Nice round out there" : "Your Round Breakdown"}</div>
        </div>
        <div style={styles.overlayBody}>
          {isFun ? (
            <>
              <p style={styles.reportBody}>{report.summary}</p>
              <div style={styles.tipBoxNew}><div style={styles.tipIconRow}><div style={styles.tipIconCircle}>💡</div><div style={styles.tipLabel}>One thing to try next time</div></div><div style={styles.tipText}>{report.tip}</div></div>
              <p style={styles.signOff}>{report.signOff}</p>
            </>
          ) : (
            <>
              <p style={styles.reportBody}>{report.analysis}</p>
              <div style={styles.issueCard}><div style={styles.issueLabel}>PRIMARY ISSUE</div><div style={styles.issueText}>{report.primaryIssue}</div></div>
              <div style={styles.sectionLabel}>Practice drills</div>
              {report.drills?.map((d, i) => (
                <div key={i} style={styles.drillCardNew}>
                  <div style={styles.drillNumber}>{i + 1}</div>
                  <div style={{ flex: 1 }}><div style={styles.rowBetween}><span style={styles.drillTitle}>{d.title}</span><span style={styles.drillTimeNew}>{d.time}</span></div><div style={styles.drillDesc}>{d.description}</div></div>
                </div>
              ))}
              <div style={styles.sectionLabel}>Focus for next round</div>
              <div style={styles.focusCard}>{report.focusPoints?.map((f, i) => <div key={i} style={styles.focusRow}><div style={styles.focusCheck}>✓</div><div style={styles.focusText}>{f}</div></div>)}</div>
              <div style={styles.coachNoteBoxNew}><div style={styles.quoteMark}>&ldquo;</div><div style={styles.coachNoteText}>{report.coachNote}</div></div>
              <p style={styles.signOff}>{report.encouragement}</p>
            </>
          )}
          <div style={styles.sectionLabel}>Videos to help you fix this</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{report.videoQueries?.map((q, i) => <a key={i} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" style={styles.videoCardNew}><div style={styles.videoPlayNew}>▶</div><div style={styles.videoTitle}>{q}</div><div style={styles.videoArrow}>→</div></a>)}</div>
          <button style={{ ...styles.primaryBtn, width: "100%", marginTop: 20 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const TAB_ICONS = {
  home: <path d="M4 12L12 5l8 7M6 10v9h12v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  "new-round": <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  progress: <path d="M4 20V10M11 20V4M18 20v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  profile: <><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5 20c1.5-4 5-5 7-5s5.5 1 7 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
};
function BottomTabBar({ active, onChange }) {
  const tabs = [
    { id: "home", label: "Home" },
    { id: "new-round", label: "New Round" },
    { id: "progress", label: "Progress" },
    { id: "profile", label: "Profile" }
  ];
  // Add safe area padding for mobile at the bottom
  return (
    <div
      style={{
        ...styles.tabBar,
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 12px))"
      }}
    >
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} style={styles.tabBarBtn}>
          <div
            style={{
              ...styles.tabBarIconWrap,
              ...(active === t.id ? styles.tabBarIconWrapActive : {})
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ color: active === t.id ? "#fff" : "var(--muted)" }}>
              {TAB_ICONS[t.id]}
            </svg>
          </div>
          <span
            style={{
              ...styles.tabBarLabel,
              color: active === t.id ? "var(--pine)" : "var(--muted)",
              fontWeight: active === t.id ? 700 : 500
            }}
          >
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}
function LoadingScreen({ text }) {
  return (
    <div style={{ ...styles.screen, alignItems: "center", justifyContent: "center" }}>
      <div style={styles.spinner} />
      <div style={styles.loadingText}>{text}</div>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
    :root {
      --bg: #F5F8F6; --surface: #FFFFFF; --pine: #123024; --pine-dark: #0A1D15; --navy: #0F2942; --navy-dark: #091A2C;
      --fairway: #2D6A4F; --fresh: #4CAF7D; --fresh-light: #E1F5EA; --ink: #16241C; --muted: #74897E; --gold: #C9A227; --line: #E7EEEA;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    * { box-sizing: border-box; } html, body { overflow-x: hidden; }
    button { font-family: inherit; cursor: pointer; } input, textarea { font-family: inherit; } a { text-decoration: none; color: inherit; }
  `}</style>
  );
}

const styles = {
  appShell: {
    fontFamily: "'Inter', sans-serif",
    background: "var(--bg)",
    minHeight: 700,
    maxWidth: "480px",      // UPDATED maxWidth
    margin: "0 auto",
    color: "var(--ink)",
    borderRadius: 24,
    overflow: "hidden",     // Ensure overflow is hidden
    border: "1px solid var(--line)",
    position: "relative",
    boxShadow: "0 20px 60px rgba(15,41,66,0.12)"
  },
  appBody: { display: "flex", flexDirection: "column", minHeight: 700 },
  tabContent: { flex: 1, overflowY: "auto", paddingBottom: 96 },
  screen: { padding: "12px 16px", minHeight: 700, display: "flex", flexDirection: "column" },
  tabScreen: { padding: "26px 20px 12px" },
  logoMark: { fontFamily: "'Fraunces', serif", fontWeight: 700, letterSpacing: 3, color: "var(--navy)", fontSize: 16 },
  onboardHeader: { display: "flex", flexDirection: "column", gap: 18 },
  progressRow: { display: "flex", gap: 6 }, progressDot: { height: 5, borderRadius: 3, flex: 1 },
  onboardBody: { flex: 1, marginTop: 44 },
  onboardTitle: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 27, lineHeight: 1.25, color: "var(--navy)", margin: 0 },
  onboardFooter: { display: "flex", gap: 12, marginTop: 24 },
  numberInput: { width: "100%", padding: "15px 16px", fontSize: 18, border: "2px solid var(--line)", borderRadius: 14, outline: "none", background: "var(--surface)" },
  choiceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px"
  },
  choiceCard: {
    textAlign: "left",
    padding: "8px 6px",
    borderRadius: 14,
    border: "2px solid var(--line)",
    background: "var(--surface)",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--ink)"
  },
  choiceCardActive: { border: "2px solid var(--fresh)", background: "var(--fresh-light)", color: "var(--pine)", fontWeight: 700 },
  primaryBtn: { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 14, padding: "16px 22px", fontSize: 15, fontWeight: 700, flex: 1, boxShadow: "0 6px 16px rgba(15,41,66,0.25)" },
  ghostBtn: { background: "transparent", color: "var(--muted)", border: "2px solid var(--line)", borderRadius: 14, padding: "16px 22px", fontSize: 15, fontWeight: 600 },
  tabHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  tabHeaderTitle: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, color: "var(--navy)" },
  trialChip: { fontSize: 11, fontWeight: 700, color: "var(--fairway)", background: "var(--fresh-light)", padding: "7px 12px", borderRadius: 20 },
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, padding: 20, boxShadow: "0 6px 18px rgba(15,41,66,0.06)" },
  cardClickable: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, padding: 20, boxShadow: "0 6px 18px rgba(15,41,66,0.06)", width: "100%", textAlign: "left", display: "block" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toggleRow: { display: "flex", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 14, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, padding: "11px 10px", borderRadius: 11, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "var(--muted)" },
  toggleBtnActive: { background: "var(--navy)", color: "#fff", boxShadow: "0 3px 10px rgba(15,41,66,0.2)" },
  fieldGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, margin: "20px 0" },
  statField: { display: "flex", flexDirection: "column", gap: 7 },
  statFieldLabel: { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 },
  statFieldInput: { fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, padding: "12px 14px", borderRadius: 12, border: "2px solid var(--line)", background: "var(--bg)", color: "var(--navy)", width: "100%" },
  profileInput: { fontSize: 15, padding: "12px 14px", borderRadius: 12, border: "2px solid var(--line)", background: "var(--bg)", color: "var(--ink)", width: "100%" },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--fairway)", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 20, marginBottom: 10 },
  missGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  missCard: { textAlign: "left", border: "2px solid var(--line)", borderRadius: 14, padding: 12, background: "var(--surface)" },
  missCardActive: { border: "2px solid var(--fresh)", background: "var(--fresh-light)" },
  missLabel: { fontWeight: 700, fontSize: 13, color: "var(--pine)" }, missDesc: { fontSize: 11, color: "var(--muted)", marginTop: 3, lineHeight: 1.35 },
  emotionCard: { textAlign: "left", border: "2px solid var(--line)", borderRadius: 14, padding: "14px 16px", background: "var(--surface)", fontSize: 13, fontWeight: 600, color: "var(--ink)" },
  emotionCardActive: { border: "2px solid var(--navy)", background: "#EAF1F7", color: "var(--navy)" },
  textarea: { width: "100%", border: "2px solid var(--line)", borderRadius: 14, padding: 14, fontSize: 14, resize: "vertical", background: "var(--bg)" },
  errorText: { fontSize: 12, color: "#B3261E", textAlign: "center", marginTop: 10, fontWeight: 600 },
  spinner: { width: 36, height: 36, borderRadius: "50%", border: "4px solid var(--fresh-light)", borderTopColor: "var(--fresh)", animation: "spin 0.8s linear infinite" },
  loadingText: { marginTop: 14, color: "var(--muted)", fontWeight: 600 },
  heroCard: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", borderRadius: 22, padding: 24, color: "#fff", boxShadow: "0 10px 24px rgba(15,41,66,0.3)" },
  heroGreeting: { fontSize: 13, opacity: 0.8, fontWeight: 600 },
  heroTitle: { fontFamily: "'Fraunces', serif", fontSize: 23, fontWeight: 600, marginTop: 7, lineHeight: 1.3 },
  heroBtn: { marginTop: 18, background: "var(--fresh)", color: "#0A1D15", border: "none", borderRadius: 14, padding: "13px 20px", fontWeight: 700, fontSize: 14, boxShadow: "0 6px 14px rgba(76,175,125,0.35)" },
  statTilesRow: { display: "flex", gap: 12, marginTop: 18 },
  statTile: { flex: 1, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 18, padding: 18, textAlign: "center", boxShadow: "0 4px 12px rgba(15,41,66,0.05)" },
  statTileNum: { fontFamily: "'JetBrains Mono', monospace", fontSize: 27, fontWeight: 700, color: "var(--navy)" },
  statTileLabel: { fontSize: 11, color: "var(--muted)", fontWeight: 600, marginTop: 3 },
  cardBigNum: { fontFamily: "'JetBrains Mono', monospace", fontSize: 29, fontWeight: 700, color: "var(--navy)" },
  cardSubtext: { fontSize: 12, color: "var(--muted)", marginTop: 4 },
  missPill: { fontSize: 11, fontWeight: 700, color: "var(--fairway)", background: "var(--fresh-light)", padding: "7px 12px", borderRadius: 20 },
  homeCoachNote: {
    fontSize: 13,
    color: "var(--ink)",
    marginTop: 14,
    lineHeight: 1.5,
    borderTop: "1px dashed var(--line)",
    paddingTop: 14,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden"
  },
  tapHint: { fontSize: 11, color: "var(--fresh)", fontWeight: 700, marginTop: 10 },
  challengeCard: { display: "flex", gap: 14, background: "linear-gradient(135deg, #EAF6EF, #DCEFE4)", border: "1px solid var(--fresh-light)", borderRadius: 18, padding: 16 },
  challengeIcon: { fontSize: 24 },
  challengeDesc: { fontSize: 13, fontWeight: 700, color: "var(--pine)", marginBottom: 8 },
  challengeProgressBar: { height: 6, background: "#fff", borderRadius: 4, overflow: "hidden" },
  challengeProgressFill: { height: "100%", background: "var(--fresh)", borderRadius: 4 },
  challengeProgressText: { fontSize: 11, color: "var(--fairway)", fontWeight: 600, marginTop: 6 },
  badgePill: { fontSize: 12, fontWeight: 700, color: "var(--navy)", background: "#EAF1F7", padding: "8px 14px", borderRadius: 20, border: "1px solid #D2E1EE" },
  progressCardHeader: { background: "transparent", border: "none", width: "100%", textAlign: "left", padding: 0, display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 },
  progressCardTitle: { fontSize: 13, fontWeight: 700, color: "var(--navy)" },
  progressCardValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: "var(--fairway)" },
  expandArrow: { fontSize: 10, color: "var(--muted)" },
  detailList: { marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 10, maxHeight: 200, overflowY: "auto" },
  detailRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" },
  detailDate: { fontSize: 12, color: "var(--muted)" },
  detailValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--navy)" },
  profileRow: { display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid var(--line)" },
  profileLabel: { fontSize: 13, color: "var(--muted)", fontWeight: 600 }, profileValue: { fontSize: 13, color: "var(--navy)", fontWeight: 700 },
  tabBar: { display: "flex", borderTop: "1px solid var(--line)", background: "var(--surface)", padding: "12px 8px", position: "sticky", bottom: 0, boxShadow: "0 -4px 14px rgba(15,41,66,0.05)" },
  tabBarBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "transparent", border: "none", padding: "2px 0" },
  tabBarIconWrap: { width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  tabBarIconWrapActive: { background: "var(--navy)" },
  tabBarLabel: { fontSize: 10 },
  overlay: { position: "absolute", inset: 0, background: "rgba(10,26,44,0.55)", display: "flex", alignItems: "flex-end", zIndex: 10 },
  overlayCard: { background: "var(--surface)", width: "100%", maxHeight: "88%", overflowY: "auto", borderRadius: "24px 24px 0 0", padding: "12px 20px 20px" },
  overlayHandle: { width: 42, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 8px" },
  reportHero: { margin: "0 -20px 0", padding: "26px 20px 24px", color: "#fff" },
  reportHeroBadge: { fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.8 },
  reportHeroTitle: { fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, marginTop: 7 },
  overlayBody: { paddingTop: 20 },
  tipBoxNew: { background: "var(--fresh-light)", borderRadius: 16, padding: 16, marginTop: 14 },
  tipIconRow: { display: "flex", alignItems: "center", gap: 8 },
  tipIconCircle: { fontSize: 16 },
  issueCard: { background: "#FDF3E7", border: "1px solid #EED9BB", borderRadius: 16, padding: 16, marginTop: 14 },
  issueLabel: { fontSize: 11, fontWeight: 700, color: "#B8862E", letterSpacing: 0.5, marginBottom: 6 },
  issueText: { fontSize: 14, lineHeight: 1.5, color: "var(--navy)", fontWeight: 600 },
  drillCardNew: { display: "flex", gap: 12, border: "1px solid var(--line)", borderRadius: 16, padding: 14, marginBottom: 10, background: "var(--surface)" },
  drillNumber: { width: 26, height: 26, borderRadius: "50%", background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  drillTimeNew: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--fairway)", fontWeight: 700, background: "var(--fresh-light)", padding: "2px 8px", borderRadius: 10 },
  focusCard: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 14 },
  focusRow: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 },
  focusCheck: { width: 18, height: 18, borderRadius: "50%", background: "var(--fresh)", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  focusText: { fontSize: 13, color: "var(--ink)", lineHeight: 1.4 },
  coachNoteBoxNew: { background: "var(--bg)", borderRadius: 16, padding: "18px 16px 16px", marginTop: 14, border: "1px solid var(--line)" },
  quoteMark: { fontFamily: "'Fraunces', serif", fontSize: 40, color: "var(--fresh)", lineHeight: 0.5, marginBottom: 6 },
  coachNoteText: { fontSize: 14, lineHeight: 1.6, color: "var(--navy)", fontStyle: "italic" },
  videoCardNew: { display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: 14, padding: 12, background: "var(--surface)" },
  videoPlayNew: { width: 30, height: 30, borderRadius: "50%", background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 },
  videoArrow: { color: "var(--muted)", fontSize: 14, flexShrink: 0 },
  videoTitle: { fontSize: 13, fontWeight: 600, color: "var(--navy)" },
};