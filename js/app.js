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

const current = () => stack[stack.length - 1];
const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
    await refresh();
  } catch (e) {
    setListError(`Kon de hoofdmap niet openen: ${e.message}`);
  }
}

async function refresh() {
  renderCrumb();
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
  show("camera");
});

$("#btn-back").addEventListener("click", () => show("browse"));
$("#btn-photo").addEventListener("click", () => $("#cameraInput").click());

$("#cameraInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // reset zodat je opnieuw kunt fotograferen
  if (file) await handlePhoto(file);
});

function buildFilename(folderName) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const safe = folderName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-") || "foto";
  return `${stamp}_${safe}.jpg`;
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
