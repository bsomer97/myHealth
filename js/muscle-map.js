// myHealth muscle map integration.
//
// Wraps the vendored "body-highlighter" library (MIT license, see
// js/vendor/body-highlighter.LICENSE.txt) to render a front+back body
// diagram that highlights primary muscles (red) and secondary-only
// muscles (yellow) for a given workout.
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

const BODY_COLOR = "#334155";     // matches --border, neutral/untrained
const SECONDARY_COLOR = "#fbbf24"; // matches --warn, yellow
const PRIMARY_COLOR = "#f87171";   // matches --danger, red

function mapMuscleNames(names) {
  const out = new Set();
  (names || []).forEach((n) => {
    const mapped = MUSCLE_NAME_MAP[String(n).toLowerCase()];
    if (mapped) mapped.forEach((m) => out.add(m));
  });
  return out;
}

// Builds the two-bucket highlighter dataset described to the user:
// - a "primary" bucket at frequency 2 -> always resolves to the last
//   (red) color in highlightedColors
// - a "secondary" bucket at frequency 1 -> resolves to the first
//   (yellow) color, but only for muscles not already claimed by primary
function buildBuckets(primaryMuscleNames, secondaryMuscleNames) {
  const primary = mapMuscleNames(primaryMuscleNames);
  const secondaryRaw = mapMuscleNames(secondaryMuscleNames);
  const secondary = new Set([...secondaryRaw].filter((m) => !primary.has(m)));

  const data = [];
  if (primary.size) data.push({ name: "primary", muscles: [...primary], frequency: 2 });
  if (secondary.size) data.push({ name: "secondary", muscles: [...secondary], frequency: 1 });
  return data;
}

// Renders an empty (or highlighted) front+back diagram pair into `container`.
// primaryMuscleNames / secondaryMuscleNames use the same vocabulary as
// data/exercises.json (e.g. "chest", "lats", "lower back").
// Returns an object with an `update(primaryNames, secondaryNames)` method so
// callers can refresh the same diagram without rebuilding it.
function render({ container, primaryMuscles = [], secondaryMuscles = [], size = "normal" }) {
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

  const data = buildBuckets(primaryMuscles, secondaryMuscles);
  const sharedOptions = {
    bodyColor: BODY_COLOR,
    highlightedColors: [SECONDARY_COLOR, PRIMARY_COLOR],
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
    update(newPrimary, newSecondary) {
      const newData = buildBuckets(newPrimary, newSecondary);
      front.update({ data: newData });
      back.update({ data: newData });
    },
    destroy() {
      front.destroy();
      back.destroy();
    }
  };
}

window.MuscleMap = { render, MUSCLE_NAME_MAP, PRIMARY_COLOR, SECONDARY_COLOR, BODY_COLOR };
