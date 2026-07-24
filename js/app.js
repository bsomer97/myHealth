// myHealth app logic - single page, view-switching UI. No frameworks.

const state = {
  view: "schedule",         // schedule | sessionDetail | library | today
  addingForDay: null,       // day index (0-6) currently showing the "add workout" form
  openSessionId: null,      // session id shown in sessionDetail view
  libraryContext: null,     // session id we're adding exercises into, or null for free browsing
  libraryQuery: "",
  libraryLocation: "all",   // all | gym | home | both
  libraryMuscle: "all",
  libraryFavoritesOnly: false,
  pendingAddExercise: null, // exercise id currently being configured (sets/reps/weight) before adding
  expandedExercise: null,   // exercise id expanded to show instructions (free-browse mode)
  showTemplatePicker: false, // whether the "load saved workout" picker is open in session detail
  summaryWeekOffset: 0,      // 0 = this week, -1 = last week, etc. Never > 0 (no future weeks).
  showFoodPicker: false,     // whether the "add meal" picker is open on the Today tab
  foodQuery: "",             // search text inside the food picker
  showCustomMealForm: false, // whether the "new custom meal" mini form is open
  showMedForm: false,        // whether the add/edit medication form is open in Settings
  medFormEditingId: null,    // med id being edited, or null when adding a new one
  medFormTimes: ["08:00"],   // times currently in the med form being built
  medFormDays: [0, 1, 2, 3, 4, 5, 6], // days currently selected in the med form (default daily)
  editingSessionDetails: false // whether the start time/duration/location edit form is open in session detail
};

const root = () => document.getElementById("view-root");

// ---------- top-level render ----------

function render() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === topLevelTab());
  });

  let html = "";
  if (state.view === "schedule") html = viewSchedule();
  else if (state.view === "sessionDetail") html = viewSessionDetail();
  else if (state.view === "library") html = viewLibrary();
  else if (state.view === "today") html = viewToday();
  else if (state.view === "summary") html = viewSummary();
  else if (state.view === "settings") html = viewSettings();

  root().innerHTML = html;

  if (state.view === "library") renderLibraryResults();
  mountMuscleMaps();
  updateTabBadges();
}

function topLevelTab() {
  if (state.view === "sessionDetail") return "schedule";
  return state.view;
}

// ---------- helpers ----------

function exerciseLabel(row) {
  const parts = [`${row.targetSets || "?"} sets`, `${row.targetReps || "?"} reps`];
  if (row.targetWeight) parts.push(`${row.targetWeight}`);
  const t = timeLimitLabel(row.targetTimeLimitMin, row.targetTimeLimitSec);
  if (t) parts.push(`${t} limit`);
  return parts.join(" · ");
}

function locationBadge(loc) {
  const cls = loc === "gym" ? "badge-gym" : loc === "home" ? "badge-home" : "badge-both";
  return `<span class="badge ${cls}">${loc}</span>`;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

// Builds <option> markup for a 15-minute-increment time dropdown, 12am-11:45pm.
function timeOptions(selected) {
  let opts = "";
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const label = minutesToLabel(h * 60 + m);
      opts += `<option value="${val}" ${val === selected ? "selected" : ""}>${label}</option>`;
    }
  }
  return opts;
}

function imagePath(rel) {
  return `data/images/${rel}`;
}

function exerciseImages(ex) {
  return (ex && ex.images) ? ex.images.filter(Boolean) : [];
}

function imageGalleryHTML(ex) {
  const imgs = exerciseImages(ex);
  if (imgs.length === 0) return "";
  return `<div class="image-gallery">${imgs.map((rel) => `<img src="${imagePath(rel)}" loading="lazy" alt="${ex.name}">`).join("")}</div>`;
}

function thumbHTML(ex) {
  const imgs = exerciseImages(ex);
  if (imgs.length === 0) return `<div class="thumb-placeholder">no photo</div>`;
  return `<img class="lib-thumb" src="${imagePath(imgs[0])}" loading="lazy" alt="${ex.name}">`;
}

// Formats an optional time limit (minutes + seconds) as "1:05", or "" if unset.
function timeLimitLabel(min, sec) {
  const m = Number(min) || 0;
  const s = Number(sec) || 0;
  if (m === 0 && s === 0) return "";
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- muscle map helpers ----------

// Aggregates primary/secondary muscle names across every exercise in a list
// of rows (works for both session.exercises and live.items - anything with
// an exerciseId). Used to feed the whole-workout muscle diagram.
function collectMuscles(rows) {
  const primary = [];
  const secondary = [];
  (rows || []).forEach((row) => {
    const ex = Library.byId(row.exerciseId);
    if (!ex) return;
    primary.push(...(ex.primaryMuscles || []));
    secondary.push(...(ex.secondaryMuscles || []));
  });
  return { primary, secondary };
}

function muscleLegendHTML() {
  return `
    <div class="muscle-map-legend">
      <span><span class="swatch" style="background:#f87171;"></span>Primary</span>
      <span><span class="swatch" style="background:#fbbf24;"></span>Secondary</span>
      <span><span class="swatch" style="background:#334155;"></span>Untrained</span>
    </div>`;
}

function muscleMapCardHTML(containerId, title) {
  return `
    <div class="card">
      <h3>${title}</h3>
      <div id="${containerId}"></div>
      ${muscleLegendHTML()}
    </div>`;
}

// Finds every muscle-map placeholder currently in the DOM and renders into
// it. Safe to call any time - it's a no-op for containers that aren't
// present in the current view. Must run AFTER the relevant HTML has been
// written to the DOM (innerHTML assignment destroys any previous diagram).
function mountMuscleMaps() {
  if (!window.MuscleMap) return;

  const sessionMapEl = document.getElementById("session-muscle-map");
  if (sessionMapEl) {
    const session = Store.getSession(state.openSessionId);
    if (session) {
      const { primary, secondary } = collectMuscles(session.exercises);
      MuscleMap.render({ container: sessionMapEl, primaryMuscles: primary, secondaryMuscles: secondary });
    }
  }

  const liveMapEl = document.getElementById("live-muscle-map");
  if (liveMapEl) {
    const live = Store.getLiveSession();
    if (live) {
      const { primary, secondary } = collectMuscles(live.items);
      MuscleMap.render({ container: liveMapEl, primaryMuscles: primary, secondaryMuscles: secondary });
    }
  }

  const cfgMapEl = document.getElementById("configure-muscle-map");
  if (cfgMapEl && state.pendingAddExercise) {
    const ex = Library.byId(state.pendingAddExercise);
    if (ex) MuscleMap.render({ container: cfgMapEl, primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles, size: "small" });
  }

  const libMapEl = document.getElementById("lib-muscle-map");
  if (libMapEl && state.expandedExercise) {
    const ex = Library.byId(state.expandedExercise);
    if (ex) MuscleMap.render({ container: libMapEl, primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles, size: "small" });
  }
}

// ---------- diet / calorie helpers ----------
//
// Deficit model ("full deficit with resting burn", per user choice):
//   daily calories burned = BMR-based resting/activity burn (TDEE) + workout
//                            calories burned that day (MET-based, on top)
//   daily deficit = daily calories burned - daily calories eaten
// This mirrors "eat back your exercise" style tracking (MyFitnessPal etc.):
// the activity level picked in Settings should describe an ordinary day's
// movement WITHOUT workouts, since actual workout sessions are added
// separately from real logged duration.

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9
};

const ACTIVITY_LABELS = {
  sedentary: "Sedentary (desk job, little movement)",
  light: "Light (some walking/standing)",
  moderate: "Moderate (on your feet a lot)",
  active: "Active (physical job)",
  veryActive: "Very active (very physical job)"
};

// Rough MET (metabolic equivalent) values per exercise category, from
// standard published activity-intensity references. Used to estimate
// workout calorie burn as MET x bodyweight(kg) x duration(hours).
const MET_BY_CATEGORY = {
  strength: 5.0,
  powerlifting: 6.0,
  "olympic weightlifting": 6.0,
  strongman: 6.0,
  plyometrics: 8.0,
  cardio: 7.0,
  stretching: 2.5
};
const DEFAULT_MET = 5.0;

// Base profile fields needed for BMR (age/sex/height). Weight is handled
// separately via Store.getWeightForDate() so it can vary day to day.
function profileComplete(profile) {
  return !!(profile && profile.age && profile.sex && profile.heightCm);
}

// Mifflin-St Jeor equation - the standard modern BMR formula.
function computeBMR(profile) {
  if (!profileComplete(profile) || !profile.weightKg) return null;
  const { age, sex, heightCm, weightKg } = profile;
  const base = 10 * Number(weightKg) + 6.25 * Number(heightCm) - 5 * Number(age);
  return sex === "female" ? base - 161 : base + 5;
}

function computeTDEE(profile) {
  const bmr = computeBMR(profile);
  if (bmr == null) return null;
  const mult = ACTIVITY_MULTIPLIERS[profile.activityLevel] || ACTIVITY_MULTIPLIERS.sedentary;
  return bmr * mult;
}

// Same as computeTDEE, but resolves weight the way it stood on that
// specific date (via the weight log) rather than whatever the profile's
// weight field currently says. This is what keeps a given day's numbers
// from silently changing later just because you updated your weight.
function computeTDEEForDate(dateStr) {
  const profile = Store.getProfile();
  if (!profileComplete(profile)) return null;
  const weightKg = Store.getWeightForDate(dateStr);
  if (!weightKg) return null;
  return computeTDEE(Object.assign({}, profile, { weightKg }));
}

// Estimates calories burned for one completed workout history entry, using
// the average MET across its completed exercises' categories, applied to
// the session's effective duration (see effectiveDurationMs) and bodyweight.
function workoutCaloriesBurned(historyEntry, weightKg) {
  if (!weightKg) return 0;
  const hours = effectiveDurationMs(historyEntry) / 3600000;
  const doneItems = (historyEntry.items || []).filter((i) => i.done);
  if (doneItems.length === 0 || hours === 0) return 0;
  const mets = doneItems.map((item) => {
    const ex = Library.byId(item.exerciseId);
    return (ex && MET_BY_CATEGORY[ex.category]) || DEFAULT_MET;
  });
  const avgMet = mets.reduce((a, b) => a + b, 0) / mets.length;
  return Math.round(avgMet * Number(weightKg) * hours);
}

function totalCaloriesForDate(dateStr) {
  return Store.getFoodEntriesForDate(dateStr).reduce(
    (sum, e) => sum + e.caloriesPerServing * (e.quantity || 1), 0
  );
}

// Rolls up today's diet numbers: baseline TDEE, workout burn (from any
// session(s) finished today), calories eaten, and the resulting deficit.
// Returns null fields where the profile isn't filled in yet.
function todayDietSummary() {
  const dateStr = dateKey(new Date());
  const eaten = totalCaloriesForDate(dateStr);
  const tdee = computeTDEEForDate(dateStr);
  const workoutBurn = Store.getHistory()
    .filter((h) => h.date === dateStr && !h.excluded)
    .reduce((sum, h) => sum + workoutCaloriesBurned(h, Store.getWeightForDate(h.date)), 0);
  const complete = tdee != null;
  const burned = complete ? tdee + workoutBurn : null;
  return {
    complete,
    eaten,
    tdee,
    workoutBurn,
    burned,
    deficit: complete ? burned - eaten : null,
    weightToday: Store.getWeightForDate(dateStr)
  };
}

function getWeekDates() {
  const now = new Date();
  const idx = todayIndex();
  const monday = new Date(now);
  monday.setDate(now.getDate() - idx);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function completedToday(sessionId) {
  const key = dateKey(new Date());
  return Store.getHistory().some((h) => h.sessionId === sessionId && h.date === key && !h.excluded);
}

// ---------- weekly summary ----------

function capitalize(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(ms) {
  const totalMinutes = Math.round((ms || 0) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// A history entry's duration is normally finishedAt - startedAt, but that's
// raw wall-clock time: if a live session was ever left running (phone
// locked, forgot to tap Finish) it would otherwise inflate "time trained"
// by however long it sat open. durationOverrideMin lets that be corrected,
// either automatically (finishLiveSession prompts when the gap looks
// implausible) or manually (via the edit button in the Summary tab).
function effectiveDurationMs(h) {
  if (h.durationOverrideMin != null) return h.durationOverrideMin * 60000;
  if (h.startedAt && h.finishedAt) return Math.max(0, new Date(h.finishedAt) - new Date(h.startedAt));
  return 0;
}

// Monday-Sunday boundaries for the week `offsetWeeks` away from this week
// (0 = this week, -1 = last week, ...). Returned as both Date objects and
// dateKey() strings so callers can compare against Store.getHistory() dates
// with simple string comparison (safe since dateKey is zero-padded ISO).
function weekRange(offsetWeeks) {
  const now = new Date();
  const idx = todayIndex();
  const monday = new Date(now);
  monday.setDate(now.getDate() - idx + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday, mondayKey: dateKey(monday), sundayKey: dateKey(sunday) };
}

// Builds the weekly report: sessions completed (with gym/home split), total
// actual time trained, and a count of how many times each muscle was a
// PRIMARY target across the week's completed exercises (secondary muscles
// are intentionally excluded, per spec).
function weeklySummary(offsetWeeks) {
  const { monday, sunday, mondayKey, sundayKey } = weekRange(offsetWeeks);
  const entries = Store.getHistory().filter((h) => h.date >= mondayKey && h.date <= sundayKey && !h.excluded);

  let totalMs = 0;
  let gymCount = 0;
  let homeCount = 0;
  const muscleCounts = {};

  entries.forEach((h) => {
    totalMs += effectiveDurationMs(h);
    if (h.location === "gym") gymCount++;
    else if (h.location === "home") homeCount++;

    (h.items || []).forEach((item) => {
      if (!item.done) return;
      const ex = Library.byId(item.exerciseId);
      if (!ex) return;
      (ex.primaryMuscles || []).forEach((m) => {
        muscleCounts[m] = (muscleCounts[m] || 0) + 1;
      });
    });
  });

  const muscleList = Object.entries(muscleCounts).sort((a, b) => b[1] - a[1]);

  // --- weekly calories / deficit rollup (weight resolved per-day, see
  // Store.getWeightForDate, so this stays stable even as more weight
  // entries get logged or the profile is edited later) ---
  const profile = Store.getProfile();
  const dietComplete = profileComplete(profile);
  let totalEaten = 0;
  let weeklyBaselineBurn = 0;
  for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
    const dStr = dateKey(d);
    totalEaten += totalCaloriesForDate(dStr);
    const tdeeDay = computeTDEEForDate(dStr);
    if (tdeeDay != null) weeklyBaselineBurn += tdeeDay;
  }
  const weeklyWorkoutBurn = entries.reduce((sum, h) => sum + workoutCaloriesBurned(h, Store.getWeightForDate(h.date)), 0);
  const weeklyBurned = dietComplete ? weeklyBaselineBurn + weeklyWorkoutBurn : null;
  const weeklyDeficit = dietComplete ? weeklyBurned - totalEaten : null;

  // Individual sessions, most recent first - lets the Summary tab show a
  // per-session breakdown with a way to correct an implausible duration.
  const sessionEntries = entries.slice().sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));

  return {
    monday, sunday, sessionsCount: entries.length, gymCount, homeCount, totalMs, muscleList,
    dietComplete, totalEaten, weeklyBaselineBurn, weeklyWorkoutBurn, weeklyBurned, weeklyDeficit,
    sessionEntries
  };
}

function viewSummary() {
  const s = weeklySummary(state.summaryWeekOffset);
  const rangeLabel = `${s.monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${s.sunday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const maxCount = s.muscleList.length ? s.muscleList[0][1] : 0;

  const muscleRows = s.muscleList.map(([name, count]) => `
    <div class="summary-muscle-row">
      <div class="summary-muscle-name">${capitalize(name)}</div>
      <div class="summary-muscle-bar"><div class="fill" style="width:${maxCount ? Math.round((count / maxCount) * 100) : 0}%"></div></div>
      <div class="summary-muscle-count">${count}</div>
    </div>`).join("");

  const sessionsSub = (s.gymCount || s.homeCount) ? `${s.gymCount} gym, ${s.homeCount} home` : "workouts";

  return `
    <div class="summary-header">
      <button class="btn-icon" data-action="summary-week" data-dir="-1">‹</button>
      <h2>${state.summaryWeekOffset === 0 ? "This week" : "Week of " + s.monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</h2>
      <button class="btn-icon" data-action="summary-week" data-dir="1" ${state.summaryWeekOffset >= 0 ? "disabled" : ""}>›</button>
    </div>
    <div class="summary-range">${rangeLabel} (Mon–Sun)</div>
    <div class="wrap" style="margin-bottom:18px;">
      <div class="card summary-stat-card">
        <div class="summary-stat">${s.sessionsCount}</div>
        <div class="session-sub">${sessionsSub}</div>
      </div>
      <div class="card summary-stat-card">
        <div class="summary-stat">${formatDuration(s.totalMs)}</div>
        <div class="session-sub">time trained</div>
      </div>
    </div>
    <h3>Muscles trained (primary only)</h3>
    <div class="card">
      ${muscleRows || `<div class="empty-state">No completed workouts this week yet.</div>`}
    </div>

    <h3 class="section-gap">Sessions this week</h3>
    <div class="card">
      ${s.sessionEntries.length ? s.sessionEntries.map((h) => {
        const label = new Date(h.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        return `
        <div class="exercise-row">
          <div class="info">
            <div class="ex-name">${label}${h.location ? " · " + h.location : ""}</div>
            <div class="ex-target">${formatDuration(effectiveDurationMs(h))}${h.durationOverrideMin != null ? " (edited)" : ""}</div>
          </div>
          <button class="btn-icon" data-action="edit-session-duration" data-id="${h.id}" aria-label="Edit duration">✎</button>
        </div>`;
      }).join("") : `<div class="empty-state">No sessions logged this week.</div>`}
    </div>

    <h3 class="section-gap">Diet & calorie deficit</h3>
    <div class="card">
      ${s.dietComplete ? `
        <div class="wrap" style="margin-bottom:14px;">
          <div class="summary-stat-card">
            <div class="summary-stat">${Math.round(s.totalEaten)}</div>
            <div class="session-sub">kcal eaten</div>
          </div>
          <div class="summary-stat-card">
            <div class="summary-stat">${Math.round(s.weeklyWorkoutBurn)}</div>
            <div class="session-sub">kcal from workouts</div>
          </div>
        </div>
        <div class="session-sub" style="margin-bottom:10px;">Baseline burn (resting + daily activity × 7 days): ${Math.round(s.weeklyBaselineBurn)} kcal</div>
        <div class="summary-stat" style="text-align:center;${s.weeklyDeficit < 0 ? "color:var(--danger);" : ""}">${s.weeklyDeficit >= 0 ? "−" : "+"}${Math.abs(Math.round(s.weeklyDeficit))} kcal</div>
        <div class="session-sub" style="text-align:center;">${s.weeklyDeficit >= 0 ? "estimated deficit" : "estimated surplus"} this week</div>
      ` : `<div class="empty-state">Add your age, sex, height, and weight in Settings to see your calorie deficit.</div>`}
    </div>
  `;
}

// ---------- medications / vitamins ----------

function medDaysLabel(days) {
  if (!days || days.length === 7) return "Daily";
  if (days.length === 0) return "No days selected";
  return days.slice().sort().map((d) => DAY_SHORT[d]).join(", ");
}

function medsListHTML() {
  const meds = Store.getMeds();
  if (meds.length === 0) return `<div class="empty-state">No medications or vitamins added yet.</div>`;
  return meds.map((med) => `
    <div class="exercise-row">
      <div class="info">
        <div class="ex-name">${med.name}</div>
        <div class="ex-target">${med.times.map((t) => minutesToLabel(toMinutes(t))).join(", ")} · ${medDaysLabel(med.days)}</div>
      </div>
      <div class="actions">
        <button class="btn-icon" data-action="edit-med" data-id="${med.id}" aria-label="Edit">✎</button>
        <button class="btn-icon" data-action="delete-med" data-id="${med.id}" aria-label="Delete">✕</button>
      </div>
    </div>`).join("");
}

function medFormHTML() {
  const editing = state.medFormEditingId ? Store.getMeds().find((m) => m.id === state.medFormEditingId) : null;
  return `
    <div class="card" style="margin-top:10px;">
      <div class="form-field">
        <label>Name</label>
        <input id="med-name" type="text" placeholder="e.g. Vitamin D" value="${editing ? editing.name.replace(/"/g, "&quot;") : ""}">
      </div>
      <div class="form-field">
        <label>Time(s)</label>
        ${state.medFormTimes.map((t, i) => `
          <div class="row" style="margin-bottom:6px;">
            <select class="med-time-select" style="flex:1;">${timeOptions(t)}</select>
            ${state.medFormTimes.length > 1 ? `<button class="btn-icon" data-action="remove-med-time" data-index="${i}">✕</button>` : ""}
          </div>`).join("")}
        <button class="btn btn-secondary btn-sm" data-action="add-med-time">+ Add another time</button>
      </div>
      <div class="form-field">
        <label>Days</label>
        <div class="wrap">
          ${DAY_SHORT.map((d, i) => `<button class="chip ${state.medFormDays.includes(i) ? "active" : ""}" data-action="toggle-med-day" data-day="${i}">${d}</button>`).join("")}
        </div>
      </div>
      <div class="row">
        <button class="btn" data-action="save-med">Save</button>
        <button class="btn btn-secondary" data-action="cancel-med-form">Cancel</button>
      </div>
    </div>`;
}

// Today's due doses: every active reminder scheduled for today's weekday,
// one row per time. "In-app only" - there's no push, so this (plus the tab
// badge) is only ever seen when you actually open myHealth.
function medsSectionHTML() {
  const allMeds = Store.getMeds();
  if (allMeds.length === 0) return "";

  const dateStr = dateKey(new Date());
  const todayIdx = todayIndex();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const doses = [];
  allMeds.forEach((med) => {
    if (!med.active) return;
    if (!(med.days || []).includes(todayIdx)) return;
    (med.times || []).forEach((t) => {
      doses.push({
        medId: med.id,
        name: med.name,
        time: t,
        taken: Store.isMedTaken(med.id, dateStr, t),
        due: toMinutes(t) <= nowMin
      });
    });
  });
  doses.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  const rows = doses.length === 0
    ? `<div class="empty-state">Nothing scheduled for today.</div>`
    : doses.map((d) => `
      <div class="live-row ${d.taken ? "done" : ""}" style="padding:10px 12px;margin-bottom:8px;">
        <div class="row-between">
          <div>
            <div class="ex-name" style="margin-bottom:2px;">${d.name}</div>
            <div class="session-sub">${minutesToLabel(toMinutes(d.time))}${d.due && !d.taken ? " · due" : ""}</div>
          </div>
          <button class="btn ${d.taken ? "btn-secondary" : ""} btn-sm" data-action="toggle-med-taken" data-med-id="${d.medId}" data-time="${d.time}">${d.taken ? "Taken ✓" : "Mark taken"}</button>
        </div>
      </div>`).join("");

  return `<h3>Medications & vitamins today</h3><div class="card">${rows}</div>`;
}

// Count of doses due (scheduled time has passed) and not yet marked taken,
// for the Today tab badge - the closest thing to a "notification" this
// in-app-only reminder system can give without a push backend.
function dueMedsCount() {
  const dateStr = dateKey(new Date());
  const todayIdx = todayIndex();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let count = 0;
  Store.getMeds().forEach((med) => {
    if (!med.active) return;
    if (!(med.days || []).includes(todayIdx)) return;
    (med.times || []).forEach((t) => {
      if (toMinutes(t) > nowMin) return;
      if (!Store.isMedTaken(med.id, dateStr, t)) count++;
    });
  });
  return count;
}

function updateTabBadges() {
  const label = document.querySelector('.tab[data-view="today"] .tab-label');
  if (!label) return;
  let badge = label.querySelector(".tab-badge");
  const count = dueMedsCount();
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "tab-badge";
      label.appendChild(badge);
    }
    badge.textContent = String(count);
  } else if (badge) {
    badge.remove();
  }
}

// ---------- SETTINGS / BACKUP VIEW ----------

function formatTimestamp(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function viewSettings() {
  const profile = Store.getProfile();
  const lastBackupAt = formatTimestamp(Store.getLastBackupAt());
  const lastCsvExportAt = formatTimestamp(Store.getLastCsvExportAt());
  return `
    <h2>Settings</h2>

    <h3>Profile (for calorie estimates)</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">
        Used to roughly estimate your daily resting calorie burn and workout calorie burn, for the deficit shown in Today and Summary. Everything stays on this device.
      </div>
      <div class="live-inputs">
        <div class="field"><label>Age</label><input id="profile-age" type="number" min="1" value="${profile.age || ""}"></div>
        <div class="field">
          <label>Sex</label>
          <select id="profile-sex">
            <option value="male" ${profile.sex === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${profile.sex === "female" ? "selected" : ""}>Female</option>
          </select>
        </div>
      </div>
      <div class="live-inputs">
        <div class="field"><label>Height (cm)</label><input id="profile-height" type="number" min="1" value="${profile.heightCm || ""}"></div>
        <div class="field"><label>Starting weight (kg)</label><input id="profile-weight" type="number" min="1" step="0.1" value="${profile.weightKg || ""}"></div>
      </div>
      <div class="session-sub" style="margin-bottom:12px;">Log your weight day to day from the Today tab - it'll be used automatically instead of this once you do. This value is just the starting point.</div>
      <div class="form-field">
        <label>Daily activity level (outside of workouts)</label>
        <select id="profile-activity">
          ${Object.entries(ACTIVITY_LABELS).map(([val, label]) => `<option value="${val}" ${(profile.activityLevel || "sedentary") === val ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-block" data-action="save-profile">Save profile</button>
    </div>

    <h3 class="section-gap">Medications & vitamins</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">
        Add anything you take regularly. myHealth shows what's due today on the Today tab and badges the tab when something's waiting - but this is in-app only, no push notifications, so it only reminds you when you actually open the app.
      </div>
      ${medsListHTML()}
      <button class="btn btn-block" style="margin-top:10px;" data-action="toggle-med-form">${state.showMedForm ? "Cancel" : "+ Add medication/vitamin"}</button>
      ${state.showMedForm ? medFormHTML() : ""}
    </div>

    <h3 class="section-gap">Back up your data</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">
        Downloads everything - your schedule, workout history, favorites, saved workouts, and exercise memory - as one file. iPhones can clear app data if you don't open myHealth for a week or two, so keeping a recent backup is worth it. It's also how you can move your data to another device: back up here, then restore that file there.
      </div>
      <button class="btn btn-block" data-action="export-backup">Download backup</button>
      ${lastBackupAt ? `<div class="session-sub" style="margin-top:8px;">Last downloaded: ${lastBackupAt}</div>` : ""}
    </div>

    <h3 class="section-gap">Export daily data for analysis</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">
        Downloads a CSV with one row per day - sessions, minutes trained, exercises done, muscles trained, calories burned and eaten, weight, and estimated deficit. Opens in Excel, Numbers, Google Sheets, or any analysis tool. This is a read-only export - it's not used for restoring data (use the backup above for that).
      </div>
      <button class="btn btn-secondary btn-block" data-action="export-analytics-csv">Download CSV</button>
      ${lastCsvExportAt ? `<div class="session-sub" style="margin-top:8px;">Last downloaded: ${lastCsvExportAt}</div>` : ""}
    </div>

    <h3 class="section-gap">Restore from backup</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">
        Choose a myHealth backup file to restore. This replaces everything currently saved on this device - you'll be asked to confirm first.
      </div>
      <div class="form-field">
        <input type="file" id="restore-file-input" accept=".json,application/json">
      </div>
      <div id="restore-status" class="session-sub"></div>
    </div>
  `;
}

// A non-excluded history entry exists for this session on this exact date.
// Used both for the Schedule tab's completion indicator and by the toggle
// handler to decide what tapping it should do next.
function sessionCompletedOnDate(sessionId, dateStr) {
  return Store.getHistory().some((h) => h.sessionId === sessionId && h.date === dateStr && !h.excluded);
}

function viewSchedule() {
  const sessions = Store.getSessions();
  const weekDates = getWeekDates();
  const todayStr = dateKey(new Date());

  const days = DAY_NAMES.map((name, i) => {
    const daySessions = sessions.filter((s) => s.dayOfWeek === i);
    const dateForDay = weekDates[i];
    const dateStrForDay = dateKey(dateForDay);
    const dateLabel = dateForDay.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const isPastOrToday = dateStrForDay <= todayStr;

    const cards = daySessions.map((s) => {
      const conflict = conflictsWithWork(s.dayOfWeek, s.startTime, s.duration);
      const endLabel = minutesToLabel(toMinutes(s.startTime) + Number(s.duration));
      const completed = sessionCompletedOnDate(s.id, dateStrForDay);
      const completeToggle = isPastOrToday
        ? `<button class="badge ${completed ? "badge-home" : "badge-incomplete"}" data-action="toggle-session-complete" data-id="${s.id}" data-date="${dateStrForDay}">${completed ? "✓ Completed" : "Mark complete"}</button>`
        : "";
      return `
        <div class="card session-card tappable" data-action="open-session" data-id="${s.id}">
          <div class="session-meta">
            <div class="session-time">${minutesToLabel(toMinutes(s.startTime))} – ${endLabel}</div>
            <div class="session-sub">${s.duration} min · ${s.exercises.length} exercise${s.exercises.length === 1 ? "" : "s"}${conflict ? " · ⚠️ overlaps work" : ""}</div>
          </div>
          <div class="stack" style="align-items:flex-end;">
            ${locationBadge(s.location)}
            ${completeToggle}
          </div>
        </div>`;
    }).join("");

    const addForm = state.addingForDay === i ? `
      <form class="card" data-action="submit-session-form" data-day="${i}">
        <div class="form-field">
          <label>Start time</label>
          <select name="startTime">${timeOptions("18:00")}</select>
        </div>
        <div class="form-field">
          <label>Duration (minutes)</label>
          <input type="number" name="duration" value="60" min="10" step="5" required>
        </div>
        <div class="form-field">
          <label>Location</label>
          <select name="location">
            <option value="gym">Gym</option>
            <option value="home">Home</option>
          </select>
        </div>
        <div class="row">
          <button type="submit" class="btn">Add workout</button>
          <button type="button" class="btn btn-secondary" data-action="cancel-add-form">Cancel</button>
        </div>
      </form>` : "";

    return `
      <section class="day-section">
        <div class="day-header">
          <div>
            <span class="day-title">${name}</span>
            <span class="day-subtitle"> · ${dateLabel}</span>
          </div>
          ${state.addingForDay === i ? "" : `<button class="btn btn-secondary btn-sm" data-action="toggle-add-form" data-day="${i}">+ Add</button>`}
        </div>
        ${cards || (state.addingForDay === i ? "" : `<div class="session-sub">No workout scheduled</div>`)}
        ${addForm}
      </section>`;
  }).join("");

  return `<h2>This week</h2>${days}`;
}

// ---------- SESSION DETAIL VIEW ----------

function viewSessionDetail() {
  const session = Store.getSession(state.openSessionId);
  if (!session) {
    return `<button class="back-link" data-action="switch-view" data-view="schedule">← Back</button>
      <div class="empty-state">Workout not found.</div>`;
  }
  const conflict = conflictsWithWork(session.dayOfWeek, session.startTime, session.duration);
  const endLabel = minutesToLabel(toMinutes(session.startTime) + Number(session.duration));

  const rows = session.exercises.map((row, idx) => {
    const ex = Library.byId(row.exerciseId);
    const name = ex ? ex.name : row.exerciseId;
    const imgs = exerciseImages(ex);
    const thumb = imgs.length ? `<img class="ex-thumb" src="${imagePath(imgs[0])}" loading="lazy" alt="${name}">` : "";
    const count = Store.getCount(row.exerciseId);
    return `
      <div class="exercise-row">
        <div class="order-badge">${idx + 1}</div>
        ${thumb}
        <div class="info">
          <div class="ex-name">${name}</div>
          <div class="ex-target">${exerciseLabel(row)}${count > 0 ? ` · done ${count}×` : ""}</div>
        </div>
        <div class="actions">
          <button class="btn-icon" data-action="move-exercise" data-id="${session.id}" data-row="${row.id}" data-dir="-1" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="btn-icon" data-action="move-exercise" data-id="${session.id}" data-row="${row.id}" data-dir="1" ${idx === session.exercises.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn-icon" data-action="remove-exercise" data-id="${session.id}" data-row="${row.id}">✕</button>
        </div>
      </div>`;
  }).join("");

  const templatePicker = state.showTemplatePicker ? (() => {
    const templates = Store.getTemplates();
    if (templates.length === 0) {
      return `<div class="card"><div class="empty-state">No saved workouts yet. Add exercises, then tap "Save as workout".</div></div>`;
    }
    return `
      <div class="card">
        <h3>Load a saved workout</h3>
        ${templates.map((t) => `
          <div class="row-between" style="margin-bottom:10px;">
            <div>
              <div style="font-weight:600;">${t.name}</div>
              <div class="session-sub">${t.exercises.length} exercise${t.exercises.length === 1 ? "" : "s"}</div>
            </div>
            <div class="row">
              <button class="btn btn-sm" data-action="apply-template" data-id="${t.id}">Use</button>
              <button class="btn-icon" data-action="delete-template" data-id="${t.id}">✕</button>
            </div>
          </div>`).join("")}
      </div>`;
  })() : "";

  const editForm = state.editingSessionDetails ? `
    <div class="card" style="margin-bottom:12px;">
      <div class="form-field">
        <label>Start time</label>
        <select id="edit-session-start">${timeOptions(session.startTime)}</select>
      </div>
      <div class="form-field">
        <label>Duration (minutes)</label>
        <input id="edit-session-duration" type="number" min="10" step="5" value="${session.duration}">
      </div>
      <div class="form-field">
        <label>Location</label>
        <select id="edit-session-location">
          <option value="gym" ${session.location === "gym" ? "selected" : ""}>Gym</option>
          <option value="home" ${session.location === "home" ? "selected" : ""}>Home</option>
        </select>
      </div>
      <div class="row">
        <button class="btn" data-action="save-session-edit" data-id="${session.id}">Save</button>
        <button class="btn btn-secondary" data-action="cancel-session-edit">Cancel</button>
      </div>
    </div>` : "";

  return `
    <button class="back-link" data-action="switch-view" data-view="schedule">← Back to schedule</button>
    <h2>${DAY_NAMES[session.dayOfWeek]} · ${minutesToLabel(toMinutes(session.startTime))}</h2>
    <div class="row-between" style="margin-bottom:12px;">
      <div class="row">
        ${locationBadge(session.location)}
        <span class="session-sub">${session.duration} min · ends ${endLabel}</span>
      </div>
      <button class="btn-icon" data-action="toggle-session-edit" aria-label="Edit start time, duration, location">✎</button>
    </div>
    ${editForm}
    ${conflict ? `<div class="warning-banner">⚠️ This overlaps your 9am–5pm work hours. Kept it anyway since you can override — just flagging it.</div>` : ""}
    <h3>Exercises</h3>
    ${rows || `<div class="empty-state">No exercises yet. Add some from the library, or load a saved workout below.</div>`}
    ${session.exercises.length > 0 ? muscleMapCardHTML("session-muscle-map", "Muscles trained") : ""}
    <div class="row" style="margin-top:10px;">
      <button class="btn" style="flex:1;" data-action="open-library-for-session" data-id="${session.id}">+ Add exercise</button>
      <button class="btn btn-secondary" style="flex:1;" data-action="toggle-template-picker">${state.showTemplatePicker ? "Hide saved workouts" : "Load saved workout"}</button>
    </div>
    ${templatePicker}
    ${session.exercises.length > 0 ? `<button class="btn btn-secondary btn-block" data-action="save-template" data-id="${session.id}" style="margin-top:10px;">💾 Save as workout</button>` : ""}
    <button class="btn btn-danger btn-block" data-action="delete-session" data-id="${session.id}" style="margin-top:20px;">Delete workout</button>
  `;
}

// ---------- LIBRARY VIEW ----------

function viewLibrary() {
  const muscles = Array.from(new Set(Library.exercises.flatMap((e) => e.primaryMuscles))).sort();

  const contextBanner = state.libraryContext ? (() => {
    const s = Store.getSession(state.libraryContext);
    if (!s) return "";
    return `<div class="warning-banner" style="background:#132a3d;border-color:var(--accent);color:#bae6fd;">
      Adding exercises to your ${DAY_NAMES[s.dayOfWeek]} ${minutesToLabel(toMinutes(s.startTime))} workout.
      <button class="btn btn-secondary btn-sm" data-action="finish-adding" style="margin-top:8px;">Done adding</button>
    </div>`;
  })() : "";

  const configure = state.pendingAddExercise ? renderConfigurePanel() : "";

  return `
    <h2>Exercise library</h2>
    ${contextBanner}
    ${configure}
    <div class="form-field">
      <input id="library-search" type="search" placeholder="Search exercises…" value="${state.libraryQuery.replace(/"/g, "&quot;")}">
    </div>
    <div class="wrap" style="margin-bottom:10px;">
      ${["all", "gym", "home", "both"].map((loc) => `
        <button class="chip ${state.libraryLocation === loc ? "active" : ""}" data-action="set-lib-location" data-loc="${loc}">${loc}</button>
      `).join("")}
      <button class="chip ${state.libraryFavoritesOnly ? "active" : ""}" data-action="toggle-favorites-only">★ favorites</button>
    </div>
    <div class="form-field">
      <select id="muscle-filter">
        <option value="all" ${state.libraryMuscle === "all" ? "selected" : ""}>All muscle groups</option>
        ${muscles.map((m) => `<option value="${m}" ${state.libraryMuscle === m ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    </div>
    <div id="library-results"></div>
  `;
}

function filteredExercises() {
  const q = state.libraryQuery.trim().toLowerCase();
  return Library.exercises.filter((e) => {
    if (state.libraryLocation !== "all" && e.location !== state.libraryLocation) return false;
    if (state.libraryMuscle !== "all" && !e.primaryMuscles.includes(state.libraryMuscle)) return false;
    if (state.libraryFavoritesOnly && !Store.isFavorite(e.id)) return false;
    if (q && !e.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderLibraryResults() {
  const container = document.getElementById("library-results");
  if (!container) return;
  const results = filteredExercises();
  const shown = results.slice(0, 50);

  container.innerHTML = shown.map((e) => {
    const tappable = state.libraryContext ? `data-action="start-add-exercise" data-id="${e.id}"` : `data-action="toggle-library-item" data-id="${e.id}"`;
    const expanded = state.expandedExercise === e.id && !state.libraryContext;
    const fav = Store.isFavorite(e.id);
    const count = Store.getCount(e.id);
    return `
      <div class="lib-item tappable" ${tappable}>
        ${thumbHTML(e)}
        <div class="lib-text">
          <div class="ex-name">${e.name}</div>
          <div class="ex-tags">${e.equipment || "no equipment"} · ${e.primaryMuscles.join(", ")} · ${e.location}${count > 0 ? ` · done ${count}×` : ""}</div>
          ${expanded ? `${imageGalleryHTML(e)}<div id="lib-muscle-map"></div><div class="instructions"><ol>${e.instructions.map((s) => `<li>${s}</li>`).join("")}</ol></div>` : ""}
        </div>
        <button class="btn-icon" data-action="toggle-favorite" data-id="${e.id}" aria-label="Favorite">${fav ? "★" : "☆"}</button>
      </div>`;
  }).join("") + (results.length > 50 ? `<div class="empty-state">Showing 50 of ${results.length} — refine your search to see more.</div>` : "") +
  (shown.length === 0 ? `<div class="empty-state">No exercises match.</div>` : "");

  mountMuscleMaps();
}

function renderConfigurePanel() {
  const ex = Library.byId(state.pendingAddExercise);
  if (!ex) return "";
  const mem = Store.getExerciseMemory(ex.id);
  const sets = mem ? mem.sets : 3;
  const reps = mem ? mem.reps : 10;
  const weight = mem ? mem.weight : "";
  const timeMin = mem ? (mem.timeLimitMin || 0) : 0;
  const timeSec = mem ? (mem.timeLimitSec || 0) : 0;
  const memTime = mem ? timeLimitLabel(mem.timeLimitMin, mem.timeLimitSec) : "";
  const count = Store.getCount(ex.id);
  const fav = Store.isFavorite(ex.id);
  return `
    <div class="card">
      <div class="row-between">
        <h3>${ex.name}</h3>
        <button class="btn-icon" data-action="toggle-favorite" data-id="${ex.id}" aria-label="Favorite">${fav ? "★" : "☆"}</button>
      </div>
      ${count > 0 ? `<div class="session-sub" style="margin-bottom:8px;">Done ${count} time${count === 1 ? "" : "s"} so far</div>` : ""}
      ${imageGalleryHTML(ex)}
      <div id="configure-muscle-map"></div>
      ${mem ? `<div class="session-sub" style="margin-bottom:8px;">Last time: ${mem.sets} × ${mem.reps}${mem.weight ? " @ " + mem.weight : ""}${memTime ? " · " + memTime + " limit" : ""}</div>` : ""}
      <div class="live-inputs">
        <div class="field"><label>Sets</label><input id="cfg-sets" type="number" min="1" value="${sets}"></div>
        <div class="field"><label>Reps</label><input id="cfg-reps" type="number" min="1" value="${reps}"></div>
        <div class="field"><label>Weight (optional)</label><input id="cfg-weight" type="text" value="${weight}" placeholder="e.g. 25kg"></div>
      </div>
      <div class="form-field">
        <label>Time limit (optional — for holds, planks, intervals)</label>
        <div class="time-limit-group">
          <div class="field narrow"><input id="cfg-time-min" type="number" min="0" value="${timeMin}" placeholder="min"></div>
          <div class="colon">min</div>
          <div class="field narrow"><input id="cfg-time-sec" type="number" min="0" max="59" value="${timeSec}" placeholder="sec"></div>
          <div class="colon">sec</div>
        </div>
      </div>
      <div class="row">
        <button class="btn" data-action="confirm-add-exercise">Add to workout</button>
        <button class="btn btn-secondary" data-action="cancel-add-exercise">Cancel</button>
      </div>
    </div>`;
}

// ---------- TODAY / LIVE SESSION VIEW ----------

function viewToday() {
  const live = Store.getLiveSession();
  if (live) return medsSectionHTML() + viewLiveSession(live) + weightSectionHTML() + dietSectionHTML();

  const today = todayIndex();
  const sessions = Store.getSessions().filter((s) => s.dayOfWeek === today);

  if (sessions.length === 0) {
    return `<h2>Today · ${DAY_NAMES[today]}</h2>${medsSectionHTML()}<div class="empty-state">No workout scheduled today.<br>Add one from the Schedule tab.</div>${weightSectionHTML()}${dietSectionHTML()}`;
  }

  const cards = sessions.map((s) => {
    const done = completedToday(s.id);
    const endLabel = minutesToLabel(toMinutes(s.startTime) + Number(s.duration));
    return `
      <div class="card">
        <div class="row-between">
          <div class="session-meta">
            <div class="session-time">${minutesToLabel(toMinutes(s.startTime))} – ${endLabel}</div>
            <div class="session-sub">${s.exercises.length} exercises · ${locationBadgeText(s.location)}</div>
          </div>
          ${done ? `<span class="badge badge-home">done today</span>` : ""}
        </div>
        <button class="btn btn-block" style="margin-top:10px;" data-action="start-session" data-id="${s.id}">${done ? "Do it again" : "Start session"}</button>
      </div>`;
  }).join("");

  return `<h2>Today · ${DAY_NAMES[today]}</h2>${medsSectionHTML()}${cards}${weightSectionHTML()}${dietSectionHTML()}`;
}

function locationBadgeText(loc) { return loc; }

// ---------- weight section (shown at the bottom of the Today tab) ----------

function weightSectionHTML() {
  const dateStr = dateKey(new Date());
  const todayEntry = Store.getWeightLog().find((w) => w.date === dateStr);
  const current = Store.getWeightForDate(dateStr);
  return `
    <h3 class="section-gap">Weight</h3>
    <div class="card">
      <div class="row-between">
        <div class="session-sub">${todayEntry ? "Logged today" : current != null ? "Last known" : "Not logged yet"}</div>
        <div class="summary-stat" style="font-size:22px;">${current != null ? current + " kg" : "—"}</div>
      </div>
      <div class="row" style="margin-top:10px;">
        <input id="weight-input" type="number" min="1" step="0.1" placeholder="kg" style="flex:1;" value="${todayEntry ? todayEntry.weightKg : ""}">
        <button class="btn" data-action="log-weight">${todayEntry ? "Update" : "Log"}</button>
      </div>
    </div>`;
}

// ---------- diet section (shown at the bottom of the Today tab) ----------

function foodResultsHTML() {
  const q = state.foodQuery.trim().toLowerCase();
  const results = q ? FoodLibrary.foods.filter((f) => f.name.toLowerCase().includes(q)) : FoodLibrary.foods;
  const shown = results.slice(0, 40);
  if (shown.length === 0) return `<div class="empty-state">No foods match.</div>`;
  return shown.map((f) => `
    <div class="lib-item tappable" data-action="add-food-entry" data-id="${f.id}">
      <div class="lib-text">
        <div class="ex-name">${f.name}</div>
        <div class="ex-tags">${f.servingLabel} · ${f.calories} kcal</div>
      </div>
    </div>`).join("");
}

function renderFoodResults() {
  const container = document.getElementById("food-results");
  if (!container) return;
  container.innerHTML = foodResultsHTML();
}

function dietSectionHTML() {
  const dateStr = dateKey(new Date());
  const entries = Store.getFoodEntriesForDate(dateStr);
  const total = totalCaloriesForDate(dateStr);
  const diet = todayDietSummary();
  const savedMeals = Store.getCustomMeals();

  const entryRows = entries.map((e) => `
    <div class="exercise-row">
      <div class="info">
        <div class="ex-name">${e.name}${e.quantity > 1 ? ` × ${e.quantity}` : ""}</div>
        <div class="ex-target">${e.caloriesPerServing * e.quantity} kcal</div>
      </div>
      <button class="btn-icon" data-action="remove-food-entry" data-id="${e.id}">✕</button>
    </div>`).join("");

  const picker = state.showFoodPicker ? `
    <div class="card" style="margin-top:10px;">
      ${savedMeals.length ? `
        <div class="form-field">
          <label>Saved meals</label>
          <div class="wrap">
            ${savedMeals.map((m) => `<button class="chip" data-action="add-saved-meal" data-id="${m.id}">${m.name} · ${m.calories} kcal</button>`).join("")}
          </div>
        </div>` : ""}
      <button class="btn btn-secondary btn-block" data-action="toggle-custom-meal-form">${state.showCustomMealForm ? "Cancel" : "+ New custom meal"}</button>
      ${state.showCustomMealForm ? `
        <div class="form-field" style="margin-top:10px;">
          <label>Name</label>
          <input id="custom-meal-name" type="text" placeholder="e.g. Meze bowl">
        </div>
        <div class="form-field">
          <label>Calories</label>
          <input id="custom-meal-calories" type="number" min="0">
        </div>
        <button class="btn btn-block" data-action="save-custom-meal">Save & add to today</button>
      ` : ""}
      <div class="form-field" style="margin-top:${savedMeals.length ? "14px" : "0"};">
        <label>Search common foods</label>
        <input id="food-search" type="search" placeholder="e.g. cooked egg, coffee…" value="${state.foodQuery.replace(/"/g, "&quot;")}">
      </div>
      <div id="food-results">${foodResultsHTML()}</div>
    </div>` : "";

  return `
    <h3 class="section-gap">Diet today</h3>
    <div class="card">
      <div class="row-between">
        <div class="session-sub">Logged so far</div>
        <div class="summary-stat" style="font-size:22px;">${Math.round(total)} kcal</div>
      </div>
      ${entryRows || `<div class="empty-state">No meals logged yet today.</div>`}
      <button class="btn btn-block" style="margin-top:10px;" data-action="toggle-food-picker">${state.showFoodPicker ? "Close" : "+ Add meal"}</button>
      ${picker}
      ${diet.complete ? `
        <div class="session-sub" style="margin-top:12px;">Est. burned today (resting + activity + workouts): ${Math.round(diet.burned)} kcal</div>
        <div class="summary-stat" style="text-align:center;margin-top:4px;${diet.deficit < 0 ? "color:var(--danger);" : ""}">${diet.deficit >= 0 ? "−" : "+"}${Math.abs(Math.round(diet.deficit))} kcal</div>
        <div class="session-sub" style="text-align:center;">${diet.deficit >= 0 ? "estimated deficit" : "estimated surplus"} today</div>
      ` : `<div class="session-sub" style="margin-top:10px;">Add your profile in Settings to see today's calorie deficit.</div>`}
    </div>`;
}

function addOrIncrementFoodEntry(foodId, source, name, caloriesPerServing) {
  const dateStr = dateKey(new Date());
  const existing = Store.getFoodLog().find((e) => e.date === dateStr && e.foodId === foodId && e.source === source);
  if (existing) {
    Store.incrementFoodEntryQuantity(existing.id, 1);
  } else {
    Store.addFoodEntry({
      id: uid("food"),
      date: dateStr,
      foodId,
      source,
      name,
      caloriesPerServing,
      quantity: 1
    });
  }
}

function viewLiveSession(live) {
  const session = Store.getSession(live.sessionId);
  const total = live.items.length;
  const doneCount = live.items.filter((i) => i.done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const rows = live.items.map((item, idx) => {
    const ex = Library.byId(item.exerciseId);
    const name = ex ? ex.name : item.exerciseId;
    return `
      <div class="live-row ${item.done ? "done" : ""}">
        <div class="ex-name">${idx + 1}. ${name}</div>
        ${imageGalleryHTML(ex)}
        <div class="live-inputs">
          <div class="field"><label>Sets</label><input type="number" min="1" value="${item.sets}" data-live-field="sets" data-index="${idx}"></div>
          <div class="field"><label>Reps</label><input type="number" min="1" value="${item.reps}" data-live-field="reps" data-index="${idx}"></div>
          <div class="field"><label>Weight</label><input type="text" value="${item.weight || ""}" data-live-field="weight" data-index="${idx}" placeholder="optional"></div>
        </div>
        <div class="form-field">
          <label>Time limit (optional)</label>
          <div class="time-limit-group">
            <div class="field narrow"><input type="number" min="0" value="${item.timeLimitMin || 0}" data-live-field="timeLimitMin" data-index="${idx}"></div>
            <div class="colon">min</div>
            <div class="field narrow"><input type="number" min="0" max="59" value="${item.timeLimitSec || 0}" data-live-field="timeLimitSec" data-index="${idx}"></div>
            <div class="colon">sec</div>
          </div>
        </div>
        <button class="btn ${item.done ? "btn-secondary" : ""} btn-block" data-action="toggle-live-done" data-index="${idx}">${item.done ? "Mark not done" : "Mark done"}</button>
      </div>`;
  }).join("");

  return `
    <h2>${session ? DAY_NAMES[session.dayOfWeek] + " workout" : "Workout"} · in progress</h2>
    <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
    <div class="session-sub" style="margin-bottom:14px;">${doneCount} of ${total} done</div>
    ${total > 0 ? muscleMapCardHTML("live-muscle-map", "Muscles worked") : ""}
    ${rows}
    <div class="row section-gap">
      <button class="btn btn-block" data-action="finish-session">Finish session</button>
      <button class="btn btn-danger" data-action="cancel-live">Cancel</button>
    </div>
  `;
}

// ---------- EVENT HANDLING ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (action === "switch-view") {
    state.view = el.dataset.view;
    state.openSessionId = null;
    state.libraryContext = null;
    state.pendingAddExercise = null;
    state.showTemplatePicker = false;
    state.showFoodPicker = false;
    state.foodQuery = "";
    state.showCustomMealForm = false;
    state.showMedForm = false;
    state.medFormEditingId = null;
    state.editingSessionDetails = false;
    render();
  } else if (action === "toggle-add-form") {
    const day = Number(el.dataset.day);
    state.addingForDay = state.addingForDay === day ? null : day;
    render();
  } else if (action === "cancel-add-form") {
    state.addingForDay = null;
    render();
  } else if (action === "open-session") {
    state.view = "sessionDetail";
    state.openSessionId = el.dataset.id;
    state.editingSessionDetails = false;
    render();
  } else if (action === "toggle-session-complete") {
    const sessionId = el.dataset.id;
    const dateStr = el.dataset.date;
    const existing = Store.getHistoryEntry(sessionId, dateStr);
    if (existing && !existing.excluded) {
      // Already completed (from a real check-in or an earlier quick-mark) -
      // exclude it from Summary/CSV/deficit without deleting the record.
      Store.setHistoryExcluded(existing.id, true);
    } else if (existing && existing.excluded) {
      // Was excluded - re-include it.
      Store.setHistoryExcluded(existing.id, false);
    } else {
      // No record at all yet - quick-complete: log it as done using the
      // workout's planned exercises/sets/reps and its scheduled duration,
      // since there's no live check-in data to draw from.
      const session = Store.getSession(sessionId);
      if (!session) return;
      const items = session.exercises.map((row) => ({
        exerciseId: row.exerciseId,
        sets: row.targetSets,
        reps: row.targetReps,
        weight: row.targetWeight,
        timeLimitMin: row.targetTimeLimitMin || 0,
        timeLimitSec: row.targetTimeLimitSec || 0,
        done: true
      }));
      Store.addHistory({
        id: uid("hist"),
        sessionId,
        date: dateStr,
        location: session.location,
        startedAt: null,
        finishedAt: null,
        durationOverrideMin: session.duration,
        quickComplete: true,
        items
      });
    }
    render();
  } else if (action === "toggle-session-edit") {
    state.editingSessionDetails = !state.editingSessionDetails;
    render();
  } else if (action === "cancel-session-edit") {
    state.editingSessionDetails = false;
    render();
  } else if (action === "save-session-edit") {
    const session = Store.getSession(el.dataset.id);
    if (!session) return;
    const startTime = document.getElementById("edit-session-start").value;
    const duration = Number(document.getElementById("edit-session-duration").value);
    const location = document.getElementById("edit-session-location").value;
    if (!duration || duration < 5) {
      alert("Enter a valid duration.");
      return;
    }
    session.startTime = startTime;
    session.duration = duration;
    session.location = location;
    Store.upsertSession(session);
    state.editingSessionDetails = false;
    render();
  } else if (action === "delete-session") {
    if (confirm("Delete this workout?")) {
      Store.deleteSession(el.dataset.id);
      state.view = "schedule";
      state.openSessionId = null;
      render();
    }
  } else if (action === "open-library-for-session") {
    state.libraryContext = el.dataset.id;
    state.view = "library";
    state.libraryLocation = "all";
    render();
  } else if (action === "finish-adding") {
    const sessionId = state.libraryContext;
    state.libraryContext = null;
    state.pendingAddExercise = null;
    state.view = "sessionDetail";
    state.openSessionId = sessionId;
    render();
  } else if (action === "set-lib-location") {
    state.libraryLocation = el.dataset.loc;
    renderLibraryResults();
    document.querySelectorAll('[data-action="set-lib-location"]').forEach((c) => {
      c.classList.toggle("active", c.dataset.loc === state.libraryLocation);
    });
  } else if (action === "toggle-library-item") {
    state.expandedExercise = state.expandedExercise === el.dataset.id ? null : el.dataset.id;
    renderLibraryResults();
  } else if (action === "toggle-favorite") {
    Store.toggleFavorite(el.dataset.id);
    render();
  } else if (action === "toggle-favorites-only") {
    state.libraryFavoritesOnly = !state.libraryFavoritesOnly;
    render();
  } else if (action === "start-add-exercise") {
    state.pendingAddExercise = el.dataset.id;
    render();
  } else if (action === "cancel-add-exercise") {
    state.pendingAddExercise = null;
    render();
  } else if (action === "confirm-add-exercise") {
    const session = Store.getSession(state.libraryContext);
    if (session) {
      const sets = Number(document.getElementById("cfg-sets").value) || 1;
      const reps = Number(document.getElementById("cfg-reps").value) || 1;
      const weight = document.getElementById("cfg-weight").value.trim();
      const timeMin = Number(document.getElementById("cfg-time-min").value) || 0;
      const timeSec = Number(document.getElementById("cfg-time-sec").value) || 0;
      session.exercises.push({
        id: uid("row"),
        exerciseId: state.pendingAddExercise,
        targetSets: sets,
        targetReps: reps,
        targetWeight: weight,
        targetTimeLimitMin: timeMin,
        targetTimeLimitSec: timeSec
      });
      Store.upsertSession(session);
    }
    state.pendingAddExercise = null;
    render();
  } else if (action === "move-exercise") {
    const session = Store.getSession(el.dataset.id);
    const dir = Number(el.dataset.dir);
    const idx = session.exercises.findIndex((r) => r.id === el.dataset.row);
    const swapWith = idx + dir;
    if (swapWith >= 0 && swapWith < session.exercises.length) {
      const tmp = session.exercises[idx];
      session.exercises[idx] = session.exercises[swapWith];
      session.exercises[swapWith] = tmp;
      Store.upsertSession(session);
      render();
    }
  } else if (action === "remove-exercise") {
    const session = Store.getSession(el.dataset.id);
    session.exercises = session.exercises.filter((r) => r.id !== el.dataset.row);
    Store.upsertSession(session);
    render();
  } else if (action === "toggle-template-picker") {
    state.showTemplatePicker = !state.showTemplatePicker;
    render();
  } else if (action === "save-template") {
    const session = Store.getSession(el.dataset.id);
    if (session && session.exercises.length > 0) {
      const name = prompt("Name this workout (e.g. Push Day)");
      if (name && name.trim()) {
        Store.addTemplate({
          id: uid("tpl"),
          name: name.trim(),
          createdAt: new Date().toISOString(),
          exercises: session.exercises.map((row) => Object.assign({}, row, { id: uid("row") }))
        });
        alert(`Saved "${name.trim()}" — you can load it into any workout from now on.`);
        render();
      }
    }
  } else if (action === "apply-template") {
    const template = Store.getTemplates().find((t) => t.id === el.dataset.id);
    const session = Store.getSession(state.openSessionId);
    if (template && session) {
      const copies = template.exercises.map((row) => Object.assign({}, row, { id: uid("row") }));
      session.exercises = session.exercises.concat(copies);
      Store.upsertSession(session);
      state.showTemplatePicker = false;
      render();
    }
  } else if (action === "delete-template") {
    if (confirm("Delete this saved workout?")) {
      Store.deleteTemplate(el.dataset.id);
      render();
    }
  } else if (action === "start-session") {
    startLiveSession(el.dataset.id);
  } else if (action === "toggle-live-done") {
    const live = Store.getLiveSession();
    const idx = Number(el.dataset.index);
    live.items[idx].done = !live.items[idx].done;
    Store.setLiveSession(live);
    render();
  } else if (action === "finish-session") {
    finishLiveSession();
  } else if (action === "cancel-live") {
    if (confirm("Discard this session's progress?")) {
      Store.setLiveSession(null);
      render();
    }
  } else if (action === "summary-week") {
    const dir = Number(el.dataset.dir);
    state.summaryWeekOffset = Math.min(0, state.summaryWeekOffset + dir);
    render();
  } else if (action === "edit-session-duration") {
    const entry = Store.getHistory().find((h) => h.id === el.dataset.id);
    if (!entry) return;
    const currentMin = Math.round(effectiveDurationMs(entry) / 60000);
    const answer = prompt(`Minutes trained for this session (currently ${currentMin}):`, currentMin);
    if (answer === null) return;
    const mins = Number(answer);
    if (!mins || mins <= 0) {
      alert("Enter a valid number of minutes.");
      return;
    }
    Store.setHistoryDurationOverride(entry.id, mins);
    render();
  } else if (action === "export-backup") {
    exportBackup();
  } else if (action === "export-analytics-csv") {
    exportAnalyticsCSV();
  } else if (action === "toggle-med-taken") {
    const medId = el.dataset.medId;
    const time = el.dataset.time;
    const dateStr = dateKey(new Date());
    if (Store.isMedTaken(medId, dateStr, time)) Store.unmarkMedTaken(medId, dateStr, time);
    else Store.markMedTaken(medId, dateStr, time);
    render();
  } else if (action === "toggle-med-form") {
    state.showMedForm = !state.showMedForm;
    if (state.showMedForm) {
      state.medFormEditingId = null;
      state.medFormTimes = ["08:00"];
      state.medFormDays = [0, 1, 2, 3, 4, 5, 6];
    }
    render();
  } else if (action === "cancel-med-form") {
    state.showMedForm = false;
    render();
  } else if (action === "add-med-time") {
    state.medFormTimes.push("08:00");
    render();
  } else if (action === "remove-med-time") {
    const idx = Number(el.dataset.index);
    state.medFormTimes.splice(idx, 1);
    render();
  } else if (action === "toggle-med-day") {
    const day = Number(el.dataset.day);
    if (state.medFormDays.includes(day)) state.medFormDays = state.medFormDays.filter((d) => d !== day);
    else state.medFormDays = state.medFormDays.concat(day).sort((a, b) => a - b);
    render();
  } else if (action === "edit-med") {
    const med = Store.getMeds().find((m) => m.id === el.dataset.id);
    if (!med) return;
    state.showMedForm = true;
    state.medFormEditingId = med.id;
    state.medFormTimes = med.times.slice();
    state.medFormDays = med.days.slice();
    render();
  } else if (action === "delete-med") {
    if (confirm("Delete this reminder?")) {
      Store.deleteMed(el.dataset.id);
      render();
    }
  } else if (action === "save-med") {
    const nameInput = document.getElementById("med-name");
    const name = nameInput.value.trim();
    if (!name) {
      alert("Enter a name.");
      return;
    }
    if (state.medFormDays.length === 0) {
      alert("Select at least one day.");
      return;
    }
    const times = Array.from(document.querySelectorAll(".med-time-select")).map((s) => s.value);
    if (state.medFormEditingId) {
      Store.updateMed({ id: state.medFormEditingId, name, times, days: state.medFormDays.slice(), active: true });
    } else {
      Store.addMed({ id: uid("med"), name, times, days: state.medFormDays.slice(), active: true, createdAt: new Date().toISOString() });
    }
    state.showMedForm = false;
    render();
  } else if (action === "log-weight") {
    const input = document.getElementById("weight-input");
    const val = Number(input.value);
    if (!val || val <= 0) {
      alert("Enter a valid weight.");
      return;
    }
    Store.upsertWeightForDate(dateKey(new Date()), val);
    render();
  } else if (action === "save-profile") {
    Store.setProfile({
      age: Number(document.getElementById("profile-age").value) || null,
      sex: document.getElementById("profile-sex").value,
      heightCm: Number(document.getElementById("profile-height").value) || null,
      weightKg: Number(document.getElementById("profile-weight").value) || null,
      activityLevel: document.getElementById("profile-activity").value
    });
    render();
  } else if (action === "toggle-food-picker") {
    state.showFoodPicker = !state.showFoodPicker;
    if (!state.showFoodPicker) {
      state.foodQuery = "";
      state.showCustomMealForm = false;
    }
    render();
  } else if (action === "add-food-entry") {
    const food = FoodLibrary.byId(el.dataset.id);
    if (food) {
      addOrIncrementFoodEntry(food.id, "common", food.name, food.calories);
      render();
    }
  } else if (action === "add-saved-meal") {
    const meal = Store.getCustomMeals().find((m) => m.id === el.dataset.id);
    if (meal) {
      addOrIncrementFoodEntry(meal.id, "custom", meal.name, meal.calories);
      render();
    }
  } else if (action === "remove-food-entry") {
    Store.removeFoodEntry(el.dataset.id);
    render();
  } else if (action === "toggle-custom-meal-form") {
    state.showCustomMealForm = !state.showCustomMealForm;
    render();
  } else if (action === "save-custom-meal") {
    const nameEl = document.getElementById("custom-meal-name");
    const calEl = document.getElementById("custom-meal-calories");
    const name = nameEl.value.trim();
    const calories = Number(calEl.value);
    if (!name || !calories) {
      alert("Enter a name and a calorie amount.");
      return;
    }
    const meal = { id: uid("meal"), name, calories, createdAt: new Date().toISOString() };
    Store.addCustomMeal(meal);
    addOrIncrementFoodEntry(meal.id, "custom", meal.name, meal.calories);
    state.showCustomMealForm = false;
    render();
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.dataset.action === "submit-session-form") {
    e.preventDefault();
    const form = e.target;
    const day = Number(form.dataset.day);
    const startTime = form.querySelector('[name="startTime"]').value;
    const duration = Number(form.querySelector('[name="duration"]').value);
    const location = form.querySelector('[name="location"]').value;

    const session = {
      id: uid("session"),
      dayOfWeek: day,
      startTime,
      duration,
      location,
      exercises: []
    };
    Store.upsertSession(session);
    state.addingForDay = null;
    state.view = "sessionDetail";
    state.openSessionId = session.id;
    render();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "library-search") {
    state.libraryQuery = e.target.value;
    renderLibraryResults();
    return;
  }
  if (e.target.id === "food-search") {
    state.foodQuery = e.target.value;
    renderFoodResults();
    return;
  }
  if (e.target.dataset.liveField) {
    const live = Store.getLiveSession();
    if (!live) return;
    const idx = Number(e.target.dataset.index);
    const field = e.target.dataset.liveField;
    let val = e.target.value;
    if (field === "sets" || field === "reps" || field === "timeLimitMin" || field === "timeLimitSec") val = Number(val) || 0;
    live.items[idx][field] = val;
    Store.setLiveSession(live);
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "muscle-filter") {
    state.libraryMuscle = e.target.value;
    renderLibraryResults();
  } else if (e.target.id === "restore-file-input") {
    handleRestoreFile(e.target);
  }
});

// ---------- backup / restore ----------

// Triggers a browser download of a JSON snapshot of everything in local
// storage. Uses a Blob + <a download> link, which iOS Safari (13.4+)
// honors by opening the Share/Save-to-Files sheet, so it works the same
// way on an iPhone home-screen install as it does on desktop.
function exportBackup() {
  const dump = Store.exportAll();
  const json = JSON.stringify(dump, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);

  const a = document.createElement("a");
  a.href = url;
  a.download = `myhealth-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  Store.setLastBackupAt(new Date().toISOString());
  render();
}

function handleRestoreFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById("restore-status");

  const reader = new FileReader();
  reader.onload = () => {
    let dump;
    try {
      dump = JSON.parse(reader.result);
    } catch (err) {
      if (statusEl) statusEl.textContent = "That file isn't valid JSON - couldn't restore.";
      input.value = "";
      return;
    }
    // Note: this checks the internal "myBerk" marker on purpose - backups
    // downloaded before the app was renamed to myHealth still carry that
    // value, and they should keep restoring correctly after the rename.
    if (!dump || !dump._meta || dump._meta.app !== "myBerk") {
      if (statusEl) statusEl.textContent = "That doesn't look like a myHealth backup file.";
      input.value = "";
      return;
    }
    if (confirm("Restore this backup? This replaces your current schedule, history, favorites, and saved workouts on this device.")) {
      Store.importAll(dump);
      state.view = "schedule";
      state.summaryWeekOffset = 0;
      render();
      alert("Backup restored.");
    }
    input.value = "";
  };
  reader.onerror = () => {
    if (statusEl) statusEl.textContent = "Couldn't read that file.";
    input.value = "";
  };
  reader.readAsText(file);
}

// ---------- analytics export (CSV, one row per calendar day) ----------

function csvEscape(val) {
  const s = String(val === undefined || val === null ? "" : val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Builds one row per calendar day, from the earliest date with any data
// (workout history, food log, or weight log) through today. Gap days are
// still included with zeroed/blank fields, so the result is a continuous
// time series that's easy to chart or pivot outside the app.
function buildDailyAnalyticsRows() {
  const history = Store.getHistory();
  const foodLog = Store.getFoodLog();
  const weightLog = Store.getWeightLog();

  const allDates = new Set([
    ...history.map((h) => h.date),
    ...foodLog.map((e) => e.date),
    ...weightLog.map((w) => w.date)
  ]);
  if (allDates.size === 0) return [];

  const earliest = Array.from(allDates).sort()[0];
  const today = dateKey(new Date());
  const rows = [];

  for (let d = new Date(earliest + "T00:00:00"); dateKey(d) <= today; d.setDate(d.getDate() + 1)) {
    const dStr = dateKey(d);
    const dayHistory = history.filter((h) => h.date === dStr && !h.excluded);

    let exercisesCompleted = 0;
    let minutesTrained = 0;
    let workoutBurn = 0;
    const muscleSet = new Set();

    dayHistory.forEach((h) => {
      minutesTrained += Math.round(effectiveDurationMs(h) / 60000);
      workoutBurn += workoutCaloriesBurned(h, Store.getWeightForDate(h.date));
      (h.items || []).forEach((item) => {
        if (!item.done) return;
        exercisesCompleted++;
        const ex = Library.byId(item.exerciseId);
        if (ex) (ex.primaryMuscles || []).forEach((m) => muscleSet.add(m));
      });
    });

    const eaten = totalCaloriesForDate(dStr);
    const tdee = computeTDEEForDate(dStr);
    const weightVal = Store.getWeightForDate(dStr);
    const deficit = tdee != null ? Math.round(tdee + workoutBurn - eaten) : "";

    rows.push({
      date: dStr,
      sessionsCompleted: dayHistory.length,
      exercisesCompleted,
      minutesTrained,
      musclesTrained: Array.from(muscleSet).sort().join(";"),
      caloriesBurnedWorkout: Math.round(workoutBurn),
      caloriesBurnedBaseline: tdee != null ? Math.round(tdee) : "",
      caloriesEaten: Math.round(eaten),
      weightKg: weightVal != null ? weightVal : "",
      estimatedDeficit: deficit
    });
  }
  return rows;
}

function exportAnalyticsCSV() {
  const rows = buildDailyAnalyticsRows();
  if (rows.length === 0) {
    alert("No data yet to export - log a workout, meal, or weight entry first.");
    return;
  }
  const headers = ["date", "sessionsCompleted", "exercisesCompleted", "minutesTrained", "musclesTrained", "caloriesBurnedWorkout", "caloriesBurnedBaseline", "caloriesEaten", "weightKg", "estimatedDeficit"];
  const lines = [headers.join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => csvEscape(r[h])).join(",")));
  const csv = lines.join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `myhealth-daily-data-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  Store.setLastCsvExportAt(new Date().toISOString());
  render();
}

// ---------- live session lifecycle ----------

function startLiveSession(sessionId) {
  const session = Store.getSession(sessionId);
  if (!session) return;
  const items = session.exercises.map((row) => {
    const mem = Store.getExerciseMemory(row.exerciseId);
    return {
      exerciseId: row.exerciseId,
      targetSets: row.targetSets,
      targetReps: row.targetReps,
      targetWeight: row.targetWeight,
      sets: mem ? mem.sets : row.targetSets,
      reps: mem ? mem.reps : row.targetReps,
      weight: mem ? mem.weight : (row.targetWeight || ""),
      timeLimitMin: mem ? (mem.timeLimitMin || 0) : (row.targetTimeLimitMin || 0),
      timeLimitSec: mem ? (mem.timeLimitSec || 0) : (row.targetTimeLimitSec || 0),
      done: false
    };
  });
  Store.setLiveSession({ sessionId, startedAt: new Date().toISOString(), items });
  state.view = "today";
  render();
}

// Sessions rarely legitimately run this long - past this, the most likely
// explanation is the live session was left open (phone locked, app
// backgrounded, forgot to tap Finish) rather than 4+ real hours of training.
const LONG_SESSION_MS = 4 * 60 * 60 * 1000;

function finishLiveSession() {
  const live = Store.getLiveSession();
  if (!live) return;
  const session = Store.getSession(live.sessionId);

  const rawMs = Math.max(0, Date.now() - new Date(live.startedAt).getTime());
  let durationOverrideMin = null;
  if (rawMs > LONG_SESSION_MS) {
    const hours = (rawMs / 3600000).toFixed(1);
    const answer = prompt(
      `This session shows ${hours} hours elapsed since you tapped Start - that's unusually long, maybe the app was left open. Enter the actual minutes you trained, or leave blank to keep the full elapsed time.`,
      ""
    );
    if (answer && !isNaN(Number(answer)) && Number(answer) > 0) {
      durationOverrideMin = Number(answer);
    }
  }

  live.items.forEach((item) => {
    Store.setExerciseMemory(item.exerciseId, {
      sets: item.sets,
      reps: item.reps,
      weight: item.weight,
      timeLimitMin: item.timeLimitMin || 0,
      timeLimitSec: item.timeLimitSec || 0
    });
    if (item.done) Store.incrementCount(item.exerciseId);
  });
  Store.addHistory({
    id: uid("hist"),
    sessionId: live.sessionId,
    date: dateKey(new Date()),
    // Snapshot location at completion time so weekly stats stay correct
    // even if the source session is later edited or deleted.
    location: session ? session.location : null,
    startedAt: live.startedAt,
    finishedAt: new Date().toISOString(),
    durationOverrideMin,
    items: live.items
  });
  Store.setLiveSession(null);
  render();
}

// Tab bar buttons already carry data-action="switch-view" and are handled
// by the delegated click listener above - no separate listener needed here.

// ---------- init ----------

async function init() {
  await Promise.all([Library.load(), FoodLibrary.load()]);
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
  }
}

init();
