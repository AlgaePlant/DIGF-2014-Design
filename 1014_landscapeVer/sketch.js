/* =====================================================================
   Collaborative Poem – one phone = one line
   Open with ?role=1, ?role=2 or ?role=3
   ===================================================================== */

/* ---------- 1. POETRY CONTENT (edit these!) ---------- */
// Each array holds the alternatives for one position in the poem.
// Add or remove lines freely; keep at least 2 per array.
const line1Options = [
  "The morning arrives quietly",
  "Somewhere a window opens",
  "Before the city wakes",
  "We carry small lights",
  "The river keeps its secrets",
  "Under a borrowed sky",
];

const line2Options = [
  "and everything we lost comes back as light",
  "while the old streets learn our names",
  "holding what the wind forgot",
  "the way a stranger's kindness lingers",
  "soft as footsteps in the snow",
  "and the silence says enough",
];

const line3Options = [
  "and we begin again",
  "until the night remembers us",
  "this is how we stay",
  "and nothing is ever finished",
  "somehow we are home",
  "and the distance becomes a song",
];

const OPTIONS_BY_ROLE = { 1: line1Options, 2: line2Options, 3: line3Options };

/* ---------- 2. TILT SETTINGS ---------- */
// Tilt axis: gamma (left/right roll, -90..90 degrees in portrait).
const NEUTRAL_ZONE = 10;   // |gamma| below this = phone is "level"; re-arms navigation
const TILT_THRESHOLD = 25; // |gamma| above this = trigger next/previous
const COOLDOWN_MS = 500;   // minimum time between two line changes

/* ---------- 3. STATE ---------- */
let role = 1;
let options = line1Options;
let index = 0;          // currently displayed line (kept when locking / unlocking)
let locked = false;     // State A (false) / State B (true)
let armed = true;       // tilt must return to neutral before the next change
let lastChange = 0;     // timestamp of last line change
let gotOrientationEvent = false;
let motionActive = false;

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

  noLoop();   // only redraw when something changes
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
    stroke("#1a1a1a");
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
  text((index + 1) + " of " + options.length + (locked ? "  \u2022  selected" : ""), width / 2, 24 + 34);

  // Poem line, centred in the area between the header and the buttons
  const landscape = width > height;
  const top = landscape ? 80 : 90;
  const bottom = height - (landscape ? 100 : 190);
  drawWrappedLine(options[index], width / 2, top, width * 0.84, bottom - top);
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

/* Move to the next (+1) or previous (-1) line, wrapping around. */
function step(dir, fromButton) {
  if (locked) return;
  index = (index + dir + options.length) % options.length;
  lastChange = millis();
  if (!fromButton) armed = false; // tilt must return to neutral before next change
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
  let angle = 0;
  if (screen.orientation && typeof screen.orientation.angle === "number") {
    angle = screen.orientation.angle;
  } else if (typeof window.orientation === "number") {
    angle = (360 - window.orientation) % 360;
  }
  if (angle === 90) return e.beta;
  if (angle === 270) return -e.beta;
  return e.gamma; // portrait (0 or 180)
}

/* Called for every deviceorientation event (~60 times per second). */
function handleOrientation(e) {
  if (e.gamma === null || e.gamma === undefined) return;
  gotOrientationEvent = true;

  if (locked) return; // State B: ignore tilt completely

  const g = getTilt(e);                    // left/right tilt in degrees
  if (g === null || g === undefined) return;
  if (abs(g) < NEUTRAL_ZONE) { armed = true; return; } // back in neutral -> re-arm
  if (!armed) return;                      // still waiting for neutral
  if (millis() - lastChange < COOLDOWN_MS) return;     // cooldown

  if (g >= TILT_THRESHOLD) step(1, false);        // tilt right -> next
  else if (g <= -TILT_THRESHOLD) step(-1, false); // tilt left  -> previous
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
