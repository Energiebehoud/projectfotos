// UI: inloggen, door mappen bladeren, map aanmaken, foto's maken en uploaden.
import { initAuth, getAccount, signIn, signOut } from "./auth.js";
import { getRootFolder, listFolders, createFolder, ensurePhotoFolder, uploadPhoto } from "./graph.js";
import { config } from "./config.js";

const $ = (sel) => document.querySelector(sel);

const screens = {
  loading: $("#screen-loading"),
  login: $("#screen-login"),
  browse: $("#screen-browse"),
  camera: $("#screen-camera"),
};
function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

let stack = [];           // [{id,name}] van hoofdmap t/m huidige map
let currentFolders = [];  // submappen van de huidige map
let targetFolder = null;  // map gekozen om foto's in te maken
let photoTargetId = null; // gecachete id van de foto-submap
let mediaStream = null;   // actieve camerastream (ingebouwde camera)
let currentAddress = "";  // adres uit GPS (PDOK), voor in de bestandsnaam

const current = () => stack[stack.length - 1];
const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sanitize = (s) => String(s).replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-");

// Favoriete startmap (per apparaat in de browser opgeslagen): pad van namen vanaf de hoofdmap.
const FAV_KEY = "pf_favorite_path";
const getFavorite = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; } };
const setFavorite = (pathNames) => localStorage.setItem(FAV_KEY, JSON.stringify(pathNames));
const currentPath = () => stack.slice(1).map((s) => s.name);
const isCurrentFavorite = () => {
  const fav = getFavorite(), path = currentPath();
  return fav.length > 0 && fav.length === path.length && fav.every((n, i) => n === path[i]);
};

// ---- Opstarten -------------------------------------------------------------
async function boot() {
  show("loading");
  try {
    await initAuth();
  } catch (e) {
    alert("Inloggen kon niet worden gestart: " + e.message);
  }
  if (getAccount()) {
    $("#btn-logout").hidden = false;
    await openRoot();
  } else {
    show("login");
  }
}

$("#btn-login").addEventListener("click", () => signIn());
$("#btn-logout").addEventListener("click", () => signOut());

// ---- Mappen bladeren -------------------------------------------------------
const setListMessage = (t) => ($("#folder-list").innerHTML = `<li class='muted'>${t}</li>`);
const setListError = (t) => ($("#folder-list").innerHTML = `<li class='error'>${t}</li>`);

async function openRoot() {
  show("browse");
  setListMessage("Hoofdmap openen…");
  try {
    const root = await getRootFolder();
    stack = [root];
    // Ga, indien ingesteld, direct naar de favoriete startmap.
    for (const name of getFavorite()) {
      const kids = await listFolders(current().id);
      const match = kids.find((k) => k.name === name);
      if (!match) break; // startmap niet (meer) gevonden -> stop waar we zijn
      stack.push(match);
    }
    await refresh();
  } catch (e) {
    setListError(`Kon de hoofdmap niet openen: ${e.message}`);
  }
}

async function refresh() {
  renderCrumb();
  updateFavButton();
  setListMessage("Mappen laden…");
  try {
    currentFolders = await listFolders(current().id);
    renderFolders($("#folder-search").value || "");
  } catch (e) {
    setListError(`Kon mappen niet laden: ${e.message}`);
  }
}

function renderCrumb() {
  $("#crumb").textContent = stack.map((s) => s.name).join("  ›  ");
  $("#btn-up").style.visibility = stack.length > 1 ? "visible" : "hidden";
}

function updateFavButton() {
  const btn = $("#btn-fav");
  if (!btn) return;
  if (isCurrentFavorite()) {
    btn.textContent = "★ Dit is je startmap — tik om te wissen";
    btn.classList.add("is-fav");
  } else {
    btn.textContent = "☆ Maak deze map de startmap";
    btn.classList.remove("is-fav");
  }
}

function renderFolders(filter) {
  const list = $("#folder-list");
  const needle = filter.toLowerCase();
  const items = currentFolders.filter((f) => f.name.toLowerCase().includes(needle));
  list.innerHTML = "";
  if (!items.length) {
    setListMessage(currentFolders.length ? "Geen submap gevonden." : "Deze map heeft geen submappen.");
    return;
  }
  for (const folder of items) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ic">📁</span>${escapeHtml(folder.name)}`;
    li.addEventListener("click", () => {
      stack.push(folder);
      $("#folder-search").value = "";
      refresh();
    });
    list.appendChild(li);
  }
}

$("#btn-up").addEventListener("click", () => {
  if (stack.length > 1) {
    stack.pop();
    $("#folder-search").value = "";
    refresh();
  }
});

$("#folder-search").addEventListener("input", (e) => renderFolders(e.target.value));

$("#btn-fav").addEventListener("click", () => {
  if (isCurrentFavorite()) {
    setFavorite([]); // wissen -> voortaan starten op de hoofdmap
  } else {
    setFavorite(currentPath()); // huidige map als startmap
  }
  updateFavButton();
});

$("#btn-create-folder").addEventListener("click", async () => {
  const input = $("#new-folder-name");
  const name = input.value.trim();
  if (!name) return;
  const btn = $("#btn-create-folder");
  btn.disabled = true;
  try {
    await createFolder(current().id, name);
    input.value = "";
    await refresh();
  } catch (e) {
    const exists = /nameAlreadyExists/i.test(e.message) || /\b409\b/.test(e.message);
    alert(exists ? "Er bestaat al een map met deze naam." : "Map aanmaken mislukt: " + e.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- Naar camera -----------------------------------------------------------
$("#btn-photos-here").addEventListener("click", () => {
  targetFolder = current();
  photoTargetId = null;
  $("#current-project").textContent = targetFolder.name;
  $("#target-note").textContent = config.photoSubfolder
    ? `Opslaan in:  ${targetFolder.name}  ›  ${config.photoSubfolder}`
    : `Opslaan in:  ${targetFolder.name}`;
  $("#upload-log").innerHTML = "";
  $("#meta-label").value = "";
  show("camera");
  startCamera();
  fetchLocation();
});

$("#btn-back").addEventListener("click", () => {
  stopCamera();
  show("browse");
});

// ---- Ingebouwde camera (live zoeker, meerdere foto's achter elkaar) --------
async function startCamera() {
  const wrap = $("#cam-wrap");
  const video = $("#cam-preview");
  const shutter = $("#btn-shutter");
  const hint = $("#cam-hint");
  const altBtn = $("#btn-photo");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return fallbackToFilePicker();
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 4096 },
        height: { ideal: 2160 },
      },
      audio: false,
    });
    video.srcObject = mediaStream;
    await video.play().catch(() => {});
    wrap.hidden = false;
    shutter.hidden = false;
    hint.hidden = false;
    // De apparaat-camera/galerij wordt het secundaire (alternatieve) knopje.
    altBtn.className = "secondary big";
    altBtn.textContent = "📁 Camera-app / galerij gebruiken";
  } catch (e) {
    // Geen toegang of niet ondersteund -> terugvallen op de camera-app.
    fallbackToFilePicker();
  }
}

function fallbackToFilePicker() {
  $("#cam-wrap").hidden = true;
  $("#btn-shutter").hidden = true;
  $("#cam-hint").hidden = true;
  const altBtn = $("#btn-photo");
  altBtn.className = "primary big";
  altBtn.textContent = "📸 Maak foto";
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  $("#cam-preview").srcObject = null;
}

// Locatie ophalen en via PDOK omzetten naar een adres (voor in de bestandsnaam).
async function fetchLocation() {
  const statusEl = $("#loc-status");
  currentAddress = "";
  if (!navigator.geolocation) {
    statusEl.textContent = "📍 locatie niet beschikbaar";
    return;
  }
  statusEl.textContent = "📍 locatie ophalen…";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      try {
        const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${lat}&lon=${lon}&rows=1&type=adres`;
        const data = await (await fetch(url)).json();
        const doc = data && data.response && data.response.docs && data.response.docs[0];
        if (doc && doc.weergavenaam) {
          currentAddress = sanitize(doc.weergavenaam.split(",")[0]); // "Straat 61"
          statusEl.textContent = `📍 ${doc.weergavenaam}`;
          return;
        }
      } catch (e) { /* val terug op coördinaten */ }
      currentAddress = `${lat.toFixed(5)}-${lon.toFixed(5)}`;
      statusEl.textContent = `📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    },
    () => { currentAddress = ""; statusEl.textContent = "📍 locatie niet beschikbaar"; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function flash() {
  const f = $("#cam-flash");
  f.classList.remove("go");
  void f.offsetWidth; // forceer herstart van de animatie
  f.classList.add("go");
}

$("#btn-shutter").addEventListener("click", () => {
  const video = $("#cam-preview");
  if (!video.videoWidth) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  flash();
  canvas.toBlob((blob) => { if (blob) handlePhoto(blob); }, "image/jpeg", 0.92);
});

// ---- Apparaat-camera / galerij (alternatief, ondersteunt meerdere) ---------
$("#btn-photo").addEventListener("click", () => $("#cameraInput").click());

$("#cameraInput").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = ""; // reset zodat je opnieuw kunt kiezen
  for (const file of files) await handlePhoto(file);
});

// ---- Uploaden --------------------------------------------------------------
function buildFilename(folderName) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const parts = [stamp, sanitize(folderName) || "foto"];
  const label = sanitize($("#meta-label").value);
  if (label) parts.push(label);
  if (currentAddress) parts.push(currentAddress);
  parts.push(Math.random().toString(36).slice(2, 5)); // uniek bij snelle reeks
  return parts.join("_") + ".jpg";
}

async function handlePhoto(file) {
  const log = $("#upload-log");
  const filename = buildFilename(targetFolder.name);
  const entry = document.createElement("div");
  entry.className = "log-item";
  entry.textContent = `Uploaden ${filename}…`;
  log.prepend(entry);
  try {
    if (photoTargetId === null) {
      photoTargetId = await ensurePhotoFolder(targetFolder.id);
    }
    await uploadPhoto(photoTargetId, filename, file, (pct) => {
      entry.textContent = `Uploaden ${filename}… ${pct}%`;
    });
    entry.textContent = `✓ ${filename} opgeslagen`;
    entry.classList.add("ok");
  } catch (err) {
    entry.textContent = `✗ ${filename} mislukt: ${err.message}`;
    entry.classList.add("error");
  }
}

// ---- Service worker (alleen in productie; op localhost zou caching hinderen) -
const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if ("serviceWorker" in navigator && !isLocalhost) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW:", e));
  });
}

boot();
