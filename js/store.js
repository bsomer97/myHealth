// myHealth local storage layer.
// Everything lives in localStorage on-device. No network calls except
// loading the static exercise library on first run (cached by the service worker after).

const KEYS = {
  SESSIONS: "myberk_sessions_v1",     // weekly recurring session plan
  HISTORY: "myberk_history_v1",       // completed session logs
  MEMORY: "myberk_memory_v1",         // last used sets/reps/weight per exercise
  LIVE: "myberk_live_v1",             // in-progress session (survives refresh)
  COUNTS: "myberk_counts_v1",         // completed-count per exercise id
  FAVORITES: "myberk_favorites_v1",   // array of favorited exercise ids
  TEMPLATES: "myberk_templates_v1",   // saved, reusable exercise-list "workout packages"
  PROFILE: "myberk_profile_v1",       // age/sex/height/weight/activity level, for BMR
  FOODLOG: "myberk_foodlog_v1",       // logged meal entries, one per day per item
  CUSTOM_MEALS: "myberk_custom_meals_v1", // saved, reusable "brand meal" entries
  WEIGHTLOG: "myberk_weightlog_v1",   // dated bodyweight entries, one per day
  MEDS: "myberk_meds_v1",             // medication/vitamin reminders (name, times, days)
  MED_LOG: "myberk_med_log_v1"        // dated "taken" marks for scheduled doses
};

function uid(prefix) {
  return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error("Failed to read", key, e);
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const Store = {
  // --- Sessions (weekly plan) ---
  getSessions() {
    return readJSON(KEYS.SESSIONS, []);
  },
  saveSessions(sessions) {
    writeJSON(KEYS.SESSIONS, sessions);
  },
  getSession(id) {
    return this.getSessions().find((s) => s.id === id) || null;
  },
  upsertSession(session) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.push(session);
    this.saveSessions(sessions);
    return session;
  },
  deleteSession(id) {
    this.saveSessions(this.getSessions().filter((s) => s.id !== id));
  },

  // --- History (completed sessions) ---
  getHistory() {
    return readJSON(KEYS.HISTORY, []);
  },
  addHistory(entry) {
    const history = this.getHistory();
    history.unshift(entry);
    writeJSON(KEYS.HISTORY, history);
  },

  // --- Memory (last used values per exercise) ---
  getMemory() {
    return readJSON(KEYS.MEMORY, {});
  },
  getExerciseMemory(exerciseId) {
    const mem = this.getMemory();
    return mem[exerciseId] || null;
  },
  setExerciseMemory(exerciseId, data) {
    const mem = this.getMemory();
    mem[exerciseId] = Object.assign({}, data, { updatedAt: new Date().toISOString() });
    writeJSON(KEYS.MEMORY, mem);
  },

  // --- Live (in-progress) session ---
  getLiveSession() {
    return readJSON(KEYS.LIVE, null);
  },
  setLiveSession(live) {
    if (live === null) {
      localStorage.removeItem(KEYS.LIVE);
    } else {
      writeJSON(KEYS.LIVE, live);
    }
  },

  // --- Completion counts (how many times an exercise has been done) ---
  getCounts() {
    return readJSON(KEYS.COUNTS, {});
  },
  getCount(exerciseId) {
    return this.getCounts()[exerciseId] || 0;
  },
  incrementCount(exerciseId) {
    const counts = this.getCounts();
    counts[exerciseId] = (counts[exerciseId] || 0) + 1;
    writeJSON(KEYS.COUNTS, counts);
  },

  // --- Favorites ---
  getFavorites() {
    return readJSON(KEYS.FAVORITES, []);
  },
  isFavorite(exerciseId) {
    return this.getFavorites().includes(exerciseId);
  },
  toggleFavorite(exerciseId) {
    let favs = this.getFavorites();
    if (favs.includes(exerciseId)) favs = favs.filter((id) => id !== exerciseId);
    else favs.push(exerciseId);
    writeJSON(KEYS.FAVORITES, favs);
  },

  // --- Saved workout templates (reusable exercise-list "packages") ---
  getTemplates() {
    return readJSON(KEYS.TEMPLATES, []);
  },
  addTemplate(template) {
    const templates = this.getTemplates();
    templates.push(template);
    writeJSON(KEYS.TEMPLATES, templates);
  },
  deleteTemplate(id) {
    writeJSON(KEYS.TEMPLATES, this.getTemplates().filter((t) => t.id !== id));
  },

  // --- Profile (for BMR / calorie estimates) ---
  getProfile() {
    return readJSON(KEYS.PROFILE, {});
  },
  setProfile(profile) {
    writeJSON(KEYS.PROFILE, profile);
  },

  // --- Food log (logged meal/food entries, one row per add) ---
  getFoodLog() {
    return readJSON(KEYS.FOODLOG, []);
  },
  addFoodEntry(entry) {
    const log = this.getFoodLog();
    log.push(entry);
    writeJSON(KEYS.FOODLOG, log);
    return entry;
  },
  removeFoodEntry(id) {
    writeJSON(KEYS.FOODLOG, this.getFoodLog().filter((e) => e.id !== id));
  },
  incrementFoodEntryQuantity(id, delta) {
    const log = this.getFoodLog();
    const entry = log.find((e) => e.id === id);
    if (!entry) return;
    entry.quantity = Math.max(1, (entry.quantity || 1) + delta);
    writeJSON(KEYS.FOODLOG, log);
  },
  getFoodEntriesForDate(dateStr) {
    return this.getFoodLog().filter((e) => e.date === dateStr);
  },

  // --- Custom "brand meal" entries (user-named, saveable/reusable) ---
  getCustomMeals() {
    return readJSON(KEYS.CUSTOM_MEALS, []);
  },
  addCustomMeal(meal) {
    const meals = this.getCustomMeals();
    meals.push(meal);
    writeJSON(KEYS.CUSTOM_MEALS, meals);
    return meal;
  },
  deleteCustomMeal(id) {
    writeJSON(KEYS.CUSTOM_MEALS, this.getCustomMeals().filter((m) => m.id !== id));
  },

  // --- Weight log (dated bodyweight entries) ---
  getWeightLog() {
    return readJSON(KEYS.WEIGHTLOG, []);
  },
  // Insert-or-update: one entry per calendar date. Logging again on the same
  // day overwrites that day's value instead of creating a duplicate row.
  upsertWeightForDate(dateStr, weightKg) {
    const log = this.getWeightLog();
    const existing = log.find((w) => w.date === dateStr);
    if (existing) existing.weightKg = weightKg;
    else log.push({ id: uid("weight"), date: dateStr, weightKg });
    writeJSON(KEYS.WEIGHTLOG, log);
  },
  removeWeightEntry(id) {
    writeJSON(KEYS.WEIGHTLOG, this.getWeightLog().filter((w) => w.id !== id));
  },
  // Date-aware weight lookup: the most recently logged weight ON OR BEFORE
  // the given date, falling back to the fixed profile weight if nothing has
  // been logged yet. This keeps past days' calorie-burn math stable even as
  // new weight entries get added later or the profile is edited - a day's
  // number is always computed from what was true as-of that day.
  getWeightForDate(dateStr) {
    const prior = this.getWeightLog()
      .filter((w) => w.date <= dateStr)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (prior.length > 0) return prior[0].weightKg;
    const profile = this.getProfile();
    return profile.weightKg || null;
  },

  // --- Medication / vitamin reminders (in-app only, no push) ---
  getMeds() {
    return readJSON(KEYS.MEDS, []);
  },
  saveMeds(meds) {
    writeJSON(KEYS.MEDS, meds);
  },
  addMed(med) {
    const meds = this.getMeds();
    meds.push(med);
    this.saveMeds(meds);
  },
  updateMed(med) {
    const meds = this.getMeds();
    const idx = meds.findIndex((m) => m.id === med.id);
    if (idx >= 0) meds[idx] = med;
    this.saveMeds(meds);
  },
  deleteMed(id) {
    this.saveMeds(this.getMeds().filter((m) => m.id !== id));
  },

  // --- Taken-log for scheduled doses (one mark per medId+date+time) ---
  getMedLog() {
    return readJSON(KEYS.MED_LOG, []);
  },
  isMedTaken(medId, dateStr, time) {
    return this.getMedLog().some((l) => l.medId === medId && l.date === dateStr && l.time === time);
  },
  markMedTaken(medId, dateStr, time) {
    if (this.isMedTaken(medId, dateStr, time)) return;
    const log = this.getMedLog();
    log.push({ id: uid("medlog"), medId, date: dateStr, time });
    writeJSON(KEYS.MED_LOG, log);
  },
  unmarkMedTaken(medId, dateStr, time) {
    writeJSON(KEYS.MED_LOG, this.getMedLog().filter((l) => !(l.medId === medId && l.date === dateStr && l.time === time)));
  },

  // --- History entry corrections (e.g. a session left running too long) ---
  setHistoryDurationOverride(id, minutes) {
    const history = this.getHistory();
    const entry = history.find((h) => h.id === id);
    if (!entry) return;
    entry.durationOverrideMin = minutes;
    writeJSON(KEYS.HISTORY, history);
  },

  // --- Backup / restore (export everything as one JSON snapshot) ---
  // Generic over KEYS so any future store key is automatically included.
  // _meta.app is intentionally left as "myBerk" (the app's original name)
  // even after the myHealth rename - it's just an internal marker checked
  // on restore, never shown to the user, and changing it would break
  // restoring backups downloaded before the rename.
  exportAll() {
    const dump = { _meta: { app: "myBerk", exportedAt: new Date().toISOString(), version: 1 } };
    Object.entries(KEYS).forEach(([name, key]) => {
      const raw = localStorage.getItem(key);
      dump[name] = raw ? JSON.parse(raw) : null;
    });
    return dump;
  },
  importAll(dump) {
    if (!dump || typeof dump !== "object") return false;
    Object.entries(KEYS).forEach(([name, key]) => {
      if (Object.prototype.hasOwnProperty.call(dump, name) && dump[name] !== null && dump[name] !== undefined) {
        localStorage.setItem(key, JSON.stringify(dump[name]));
      }
    });
    return true;
  }
};

// --- Exercise library (static dataset, loaded once) ---
const Library = {
  exercises: [],
  loaded: false,
  async load() {
    if (this.loaded) return this.exercises;
    const res = await fetch("data/exercises.json");
    this.exercises = await res.json();
    this.loaded = true;
    return this.exercises;
  },
  byId(id) {
    return this.exercises.find((e) => e.id === id) || null;
  }
};

// --- Common foods database (static dataset, loaded once) ---
const FoodLibrary = {
  foods: [],
  loaded: false,
  async load() {
    if (this.loaded) return this.foods;
    const res = await fetch("data/foods.json");
    this.foods = await res.json();
    this.loaded = true;
    return this.foods;
  },
  byId(id) {
    return this.foods.find((f) => f.id === id) || null;
  }
};

// --- Time helpers ---
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Returns true if a session on the given day-of-week (0=Mon..6=Sun) starting at
// startTime ("HH:MM") for durationMinutes overlaps the 9am-5pm weekday work block.
function conflictsWithWork(dayOfWeek, startTime, durationMinutes) {
  if (dayOfWeek > 4) return false; // Sat/Sun - no work conflict
  const start = toMinutes(startTime);
  const end = start + Number(durationMinutes || 0);
  const workStart = 9 * 60;
  const workEnd = 17 * 60;
  return start < workEnd && end > workStart;
}

// Returns the JS getDay()-style weekday (0=Sun..6=Sat) converted to our
// Mon=0..Sun=6 scheme, for "today".
function todayIndex() {
  const jsDay = new Date().getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // 0=Mon..6=Sun
}
