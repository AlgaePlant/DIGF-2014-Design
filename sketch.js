/* =====================================================================
   Collaborative Poem – one phone = one line
   Open with ?role=1, ?role=2 or ?role=3
   ===================================================================== */

/* ---------- 1. POETRY CONTENT (edit these!) ---------- */
// Each array holds the alternatives for one position in the poem.
// Add or remove lines freely; keep at least 2 per array.
const line1Options = [
"I hear a heartbeat ringing in my ears",
"I hear a faint heartbeat beneath the floor",
"The heartbeat is so loud that the entire room can hear it"
];

const line2Options = [
"He gave me a friendly smile, for he suspects nothing",
"He sat across the room, smiling",
"He smiles at me mockingly, for he knows what I've done"
];

const line3Options = [
"I speak calmly, as if nothing has happened",
"I notice my voice growing louder as I speak",
"My shrieking voice must have given me away"
];

const OPTIONS_BY_ROLE = { 1: line1Options, 2: line2Options, 3: line3Options };

/* ---------- 2. TILT SETTINGS (CHANGED: adjust these to fine-tune) ---------- */
// Landscape tilt: left of neutral = State A, neutral = State B, right = State C.
const LEFT_THRESHOLD  = 20;  // degrees of LEFT tilt needed to enter State A
const RIGHT_THRESHOLD = 20;  // degrees of RIGHT tilt needed to enter State C
const HYSTERESIS      = 5;   // degrees: must come back this far inside the threshold
                             //   before A or C is released (e.g. enter A at -20, leave at -15)
const TILT_SMOOTHING  = 0.3; // 0..1. Lower = smoother but slower; 1 = no smoothing
const MIN_DWELL_MS    = 200; // minimum time between two state changes
const TILT_OFFSET     = 0;   // degrees. If "neutral" reads e.g. +8 in the debug box, set 8
const SWAP_TILT_DIRECTION = false; // set true if left/right feel reversed
const SHOW_DEBUG      = true; // set false to hide the debug box

/* ---------- 3. STATE ---------- */
let role = 1;
let options = line1Options;
let index = 0;          // (unused for now) poetry line index, kept for later
let locked = false;     // false = unlocked (tilt works), true = locked (tilt ignored)
let armed = true;       // (unused for now) old poetry-navigation logic
let lastChange = 0;     // timestamp of last state change
let gotOrientationEvent = false;
let motionActive = false;

// CHANGED: three-state tilt interaction
let tiltState = "B";    // "A" (left), "B" (neutral), "C" (right)
let currentTilt = 0;    // smoothed tilt in degrees (negative = left, positive = right)
let lastBeta = 0, lastGamma = 0; // raw sensor values, for the debug box

/* ---------- 4. SETUP / DRAW (p5) ---------- */
function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Georgia");

  // Read role from URL: index.html?role=2
  const param = parseInt(new URLSearchParams(window.location.search).get("role"), 10);
  if (param === 1 || param === 2 || param === 3) {
    role = param;
  } else {
    showBanner("No valid ?role=1/2/3 in the URL. Showing Line 1.");
  }
  options = OPTIONS_BY_ROLE[role];
  document.getElementById("startTitle").textContent = "Line " + role + " / 3";

  // Wire up buttons
  document.getElementById("enableBtn").addEventListener("click", enableMotion);
  document.getElementById("buttonsOnlyBtn").addEventListener("click", () => {
    goFullscreen();
    enterApp();
    enableManualNav("Using buttons to browse lines.", false);
  });
  document.getElementById("actionBtn").addEventListener("click", toggleLock);
  document.getElementById("prevBtn").addEventListener("click", () => step(-1, true));
  document.getElementById("nextBtn").addEventListener("click", () => step(1, true));

  frameRate(30);   // CHANGED: keep drawing so the debug tilt value updates live
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}

function draw() {
  // Subtle feedback: pale tint + frame when a line is locked
  background(locked ? "#e8f0e6" : "#ffffff");
  if (locked) {
    noFill();
    stroke("#1a");
    strokeWeight(6);
    rect(3, 3, width - 6, height - 6);
  }
  noStroke();

  // Small role indicator at the top, plus option counter
  fill("#555");
  textAlign(CENTER, TOP);
  textSize(16);
  text("Line " + role + " / 3", width / 2, 24 + 10);
  textSize(13);
  fill("#888");
  text(locked ? "selected" : "tilt to change", width / 2, 24 + 34);

  // CHANGED: show the current tilt state (A / B / C) instead of a poem line.
  // The old poem drawing is disabled: drawWrappedLine(options[index], ...)
  const landscape = width > height;
  const top = landscape ? 80 : 90;
  const bottom = height - (landscape ? 100 : 190);
 const stateIndex = { A: 0, B: 1, C: 2 }[tiltState];

drawWrappedLine(
  options[stateIndex],
  width / 2,
  top,
  width - 48,
  bottom - top
);

  if (SHOW_DEBUG) drawDebug();
}

/* TEMPORARY debug box (top-left). Turn off with SHOW_DEBUG = false. */
function drawDebug() {
  textFont("monospace");
  textSize(13);
  textAlign(LEFT, TOP);
  noStroke();
  fill("#b3261e");
  text(
    "tilt:   " + nf(currentTilt, 1, 1) + " deg\n" +
    "state:  " + tiltState + "\n" +
    "lock:   " + (locked ? "LOCKED" : "unlocked") + "\n" +
    "screen: " + getScreenAngle() + " deg\n" +
    "beta:   " + nf(lastBeta, 1, 1) + "\n" +
    "gamma:  " + nf(lastGamma, 1, 1),
    12, 12
  );
  textFont("Georgia");
}

/* Draws text centred in a box, shrinking the font until it fits. */
function drawWrappedLine(str, cx, boxTop, boxW, boxH) {
  // Landscape: start large and shrink until the verse fits on ONE line.
  // Portrait: wrap onto several lines as needed.
  const landscape = width > height;
  let size = landscape
    ? constrain(width * 0.06, 22, 64)
    : constrain(min(width, height) * 0.095, 22, 56);
  const minSize = landscape ? 20 : 16;
  let lines;
  while (true) {
    textSize(size);
    lines = wrapText(str, boxW);
    const fitsHeight = lines.length * size * 1.3 <= boxH;
    const fitsOneLine = !landscape || lines.length === 1;
    if ((fitsHeight && fitsOneLine) || size <= minSize) break;
    size -= 2;
  }
  const lh = size * 1.3;
  const startY = boxTop + boxH / 2 - (lines.length * lh) / 2;
  fill("#1a1a1a");
  textAlign(CENTER, TOP);
  for (let i = 0; i < lines.length; i++) text(lines[i], cx, startY + i * lh);
}

/* Splits a string into lines that fit maxW at the current text size. */
function wrapText(str, maxW) {
  const words = str.split(" ");
  const lines = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (textWidth(test) <= maxW || !current) current = test;
    else { lines.push(current); current = w; }
  }
  if (current) lines.push(current);
  return lines;
}

/* ---------- 5. LINE NAVIGATION + LOCKING ---------- */

/* CHANGED: manual fallback buttons now move between states A <-> B <-> C.
   (The old poetry-line stepping with wrap-around is disabled for now.) */
function step(dir, fromButton) {
  if (locked) return;
  const order = ["A", "B", "C"];
  const i = constrain(order.indexOf(tiltState) + dir, 0, 2);
  tiltState = order[i];
  lastChange = millis();
  redraw();
}

/* Select <-> Back button. The index is never reset, so the line is preserved. */
function toggleLock() {
  locked = !locked;
  armed = false; // after Back, require a return to neutral before tilt navigation resumes
  const btn = document.getElementById("actionBtn");
  btn.textContent = locked ? "Back" : "Select";
  btn.classList.toggle("secondary", locked);
  document.getElementById("manualNav").style.visibility = locked ? "hidden" : "visible";
  redraw();
}

/* ---------- 6. DEVICE ORIENTATION ---------- */

/* Hides the browser address bar and Android navigation buttons, and asks for
   landscape. Must be called from a tap. Silently does nothing where unsupported
   (e.g. iPhone Safari). */
async function goFullscreen() {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      await el.requestFullscreen({ navigationUI: "hide" });
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (err) { /* unsupported or refused: ignore */ }
}

/* Returns the "left/right" tilt in degrees for the current screen rotation.
   Portrait uses gamma; landscape uses beta. If tilt directions feel reversed
   in landscape, swap the two minus signs below. */
function getTilt(e) {
  const angle = getScreenAngle();
  if (angle === 90) return e.beta;
  if (angle === 270) return -e.beta;
  return e.gamma; // portrait (0 or 180)
}

/* Current screen rotation in degrees: 0 / 90 / 180 / 270. */
function getScreenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === "number") {
    return screen.orientation.angle;
  }
  if (typeof window.orientation === "number") {
    return (360 - window.orientation) % 360;
  }
  return 0;
}

/* Called for every deviceorientation event (~60 times per second). */
function handleOrientation(e) {
  if ((e.gamma === null || e.gamma === undefined) &&
      (e.beta === null || e.beta === undefined)) return;
  gotOrientationEvent = true;
  lastBeta = e.beta || 0;
  lastGamma = e.gamma || 0;

  // Tilt in degrees for the current screen rotation (negative = left, positive = right)
  let raw = getTilt(e);
  if (raw === null || raw === undefined) return;
  if (SWAP_TILT_DIRECTION) raw = -raw;
  raw -= TILT_OFFSET;

  // Low-pass filter to remove hand jitter. The angle keeps updating while locked
  // (so the debug box stays live), but the state is frozen.
  currentTilt += TILT_SMOOTHING * (raw - currentTilt);

  if (locked) return;            // locked: tilt no longer changes the state
  updateTiltState(currentTilt);
}

/* CHANGED: three-state logic with hysteresis.
   Enter A/C at the threshold; only leave them once the tilt has come back
   HYSTERESIS degrees inside it. The area in between is the neutral dead zone. */
function updateTiltState(t) {
  const leaveLeft  = LEFT_THRESHOLD  - HYSTERESIS;
  const leaveRight = RIGHT_THRESHOLD - HYSTERESIS;

  if (tiltState === "B") {
    if (t <= -LEFT_THRESHOLD) setTiltState("A");
    else if (t >= RIGHT_THRESHOLD) setTiltState("C");
  } else if (tiltState === "A") {
    if (t > -leaveLeft) setTiltState("B");
  } else if (tiltState === "C") {
    if (t < leaveRight) setTiltState("B");
  }
}

/* Changes state, but not more often than MIN_DWELL_MS. */
function setTiltState(s) {
  if (millis() - lastChange < MIN_DWELL_MS) return;
  tiltState = s;
  lastChange = millis();
}

/* Runs on the "Enable Motion Controls" tap (required by iOS 13+). */
async function enableMotion() {
  goFullscreen(); // first, while the tap still counts as a user gesture
  const startMsg = document.getElementById("startMsg");
  startMsg.textContent = "";

  if (!window.isSecureContext) {
    startMsg.textContent = "Motion sensors need HTTPS (or localhost). Use buttons instead.";
    return;
  }
  if (typeof DeviceOrientationEvent === "undefined") {
    startMsg.textContent = "This browser has no motion sensor support. Use buttons instead.";
    return;
  }

  // iOS Safari: permission must be requested from a user gesture
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== "granted") {
        startMsg.textContent = "Motion permission was denied. Use buttons instead, or reload to try again.";
        return;
      }
    } catch (err) {
      startMsg.textContent = "Could not request motion permission. Use buttons instead.";
      return;
    }
  }

  window.addEventListener("deviceorientation", handleOrientation);
  motionActive = true;
  enterApp();

  // If no sensor data arrives shortly, fall back to manual buttons
  setTimeout(() => {
    if (!gotOrientationEvent) {
      enableManualNav("No motion data received. Use the buttons to browse lines.", true);
    }
  }, 1500);
}

/* ---------- 7. UI HELPERS ---------- */
function enterApp() {
  document.getElementById("start").hidden = true;
  document.getElementById("ui").hidden = false;
  redraw();
}

function enableManualNav(message, isError) {
  document.getElementById("manualNav").hidden = false;
  if (message) showBanner(message, isError);
}

// sticky = true keeps the banner visible; false hides it after 3 seconds
function showBanner(message, sticky = true) {
  const b = document.getElementById("banner");
  b.textContent = message;
  b.hidden = false;
  if (!sticky) setTimeout(() => (b.hidden = true), 3000);
}
