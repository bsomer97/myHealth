// myHealth muscle map integration.
//
// Wraps the vendored "body-highlighter" library (MIT license, see
// js/vendor/body-highlighter.LICENSE.txt) to render a front+back body
// diagram colored by INTENSITY TIER (red/orange/yellow/gray), computed by
// the intensity engine in app.js - NOT by primary/secondary role anymore.
//
// This is a native ES module. It exposes window.MuscleMap so the rest of
// the (non-module) app.js can call it without needing a bundler.

import createBodyHighlighter, { ModelType } from "./vendor/body-highlighter.esm.js";

// Our exercise dataset (free-exercise-db) uses everyday gym vocabulary that
// doesn't always line up with the library's anatomical labels, so we map
// every muscle name that appears in data/exercises.json explicitly rather
// than relying on its built-in fuzzy alias matching.
const MUSCLE_NAME_MAP = {
  abdominals: ["abs"],
  abductors: ["abductors"],
  adductors: ["adductor"],
  biceps: ["biceps"],
  calves: ["calves"],
  chest: ["chest"],
  forearms: ["forearm"],
  glutes: ["gluteal"],
  hamstrings: ["hamstring"],
  lats: ["upper-back"],
  "lower back": ["lower-back"],
  "middle back": ["upper-back"],
  neck: ["neck"],
  quadriceps: ["quadriceps"],
  shoulders: ["front-deltoids", "back-deltoids"],
  traps: ["trapezius"],
  triceps: ["triceps"]
};

const TIER_ORDER = ["yellow", "orange", "red"];

const BODY_COLOR = "#334155";    // matches --border, gray = untrained
const YELLOW_COLOR = "#fde047";  // low intensity
const ORANGE_COLOR = "#fb923c";  // medium intensity
const RED_COLOR = "#f87171";     // matches --danger, high intensity

// Builds the highlighter's "data" buckets from a {muscleName: tier} map
// (tier is "yellow" | "orange" | "red"). Body-highlighter colors a muscle
// by SUMMING frequency across every bucket it appears in and indexing into
// highlightedColors - so to get correct "max tier wins" behavior we resolve
// each muscle to exactly ONE tier (and therefore one bucket) ourselves
// before calling it, rather than letting the library do any summing.
function buildBuckets(muscleTiers) {
  const slugTierIndex = {}; // internal body-highlighter slug -> tier index (0/1/2)

  Object.entries(muscleTiers || {}).forEach(([name, tier]) => {
    const idx = TIER_ORDER.indexOf(tier);
    if (idx === -1) return;
    const mapped = MUSCLE_NAME_MAP[String(name).toLowerCase()];
    if (!mapped) return;
    mapped.forEach((slug) => {
      // Two different source muscles (e.g. "lats" and "middle back") can
      // map to the same anatomical slug ("upper-back") - take the higher
      // tier so nothing gets under-colored.
      if (slugTierIndex[slug] === undefined || idx > slugTierIndex[slug]) {
        slugTierIndex[slug] = idx;
      }
    });
  });

  const buckets = { yellow: [], orange: [], red: [] };
  Object.entries(slugTierIndex).forEach(([slug, idx]) => {
    buckets[TIER_ORDER[idx]].push(slug);
  });

  const data = [];
  if (buckets.yellow.length) data.push({ name: "yellow", muscles: buckets.yellow, frequency: 1 });
  if (buckets.orange.length) data.push({ name: "orange", muscles: buckets.orange, frequency: 2 });
  if (buckets.red.length) data.push({ name: "red", muscles: buckets.red, frequency: 3 });
  return data;
}

// Renders an empty (or colored) front+back diagram pair into `container`.
// muscleTiers uses the same vocabulary as data/exercises.json (e.g.
// "chest", "lats", "lower back") mapped to "yellow" | "orange" | "red".
// Returns an object with an `update(muscleTiers)` method so callers can
// refresh the same diagram without rebuilding it.
function render({ container, muscleTiers = {}, size = "normal" }) {
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = size === "small" ? "muscle-map-wrap mini" : "muscle-map-wrap";

  const frontLabel = document.createElement("div");
  frontLabel.className = "muscle-map-label";
  frontLabel.textContent = "Front";
  const backLabel = document.createElement("div");
  backLabel.className = "muscle-map-label";
  backLabel.textContent = "Back";

  const frontHolder = document.createElement("div");
  frontHolder.className = "muscle-map-figure";
  const backHolder = document.createElement("div");
  backHolder.className = "muscle-map-figure";

  frontHolder.appendChild(frontLabel);
  backHolder.appendChild(backLabel);
  wrap.appendChild(frontHolder);
  wrap.appendChild(backHolder);
  container.appendChild(wrap);

  const data = buildBuckets(muscleTiers);
  const sharedOptions = {
    bodyColor: BODY_COLOR,
    highlightedColors: [YELLOW_COLOR, ORANGE_COLOR, RED_COLOR],
    data
  };

  const front = createBodyHighlighter({
    container: frontHolder,
    type: ModelType.ANTERIOR,
    style: { width: "100%", maxWidth: "160px" },
    ...sharedOptions
  });
  const back = createBodyHighlighter({
    container: backHolder,
    type: ModelType.POSTERIOR,
    style: { width: "100%", maxWidth: "160px" },
    ...sharedOptions
  });

  return {
    update(newMuscleTiers) {
      const newData = buildBuckets(newMuscleTiers);
      front.update({ data: newData });
      back.update({ data: newData });
    },
    destroy() {
      front.destroy();
      back.destroy();
    }
  };
}

window.MuscleMap = { render, MUSCLE_NAME_MAP, YELLOW_COLOR, ORANGE_COLOR, RED_COLOR, BODY_COLOR };
