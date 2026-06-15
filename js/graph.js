// Microsoft Graph op jouw OneDrive: mappen bladeren/maken en foto's uploaden.
import { getToken } from "./auth.js";
import { config, rootFolderName } from "./config.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

function encodePath(p) {
  return String(p).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

async function graphFetch(path, options = {}) {
  const token = await getToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(GRAPH + path, { ...options, headers });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch { /* geen JSON */ }
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res;
}

// De startmap (hoofdmap) openen in OneDrive op basis van de padnaam uit config.
export async function getRootFolder() {
  const name = rootFolderName();
  const item = await graphFetch(`/me/drive/root:/${encodePath(name)}`);
  return { id: item.id, name: item.name };
}

// Submappen van een map ophalen (op item-id).
export async function listFolders(itemId) {
  const data = await graphFetch(
    `/me/drive/items/${itemId}/children?$select=id,name,folder&$top=400&$orderby=name`
  );
  return (data.value || [])
    .filter((x) => x.folder)
    .map((f) => ({ id: f.id, name: f.name }));
}

// Nieuwe submap aanmaken onder een map (op item-id).
export async function createFolder(parentId, name) {
  return graphFetch(`/me/drive/items/${parentId}/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
}

// Zorg dat de foto-submap (bijv. "2. Foto's") bestaat binnen een map; geef de id.
// Als config.photoSubfolder leeg is, worden foto's direct in de map gezet.
export async function ensurePhotoFolder(folderId) {
  const sub = (config.photoSubfolder || "").trim();
  if (!sub) return folderId;
  const kids = await listFolders(folderId);
  const found = kids.find((k) => k.name.toLowerCase() === sub.toLowerCase());
  if (found) return found.id;
  const created = await createFolder(folderId, sub);
  return created.id;
}

// Foto uploaden naar een map (op item-id). Klein bestand direct, groot bestand
// via een upload-sessie in stukken.
export async function uploadPhoto(folderId, filename, blob, onProgress) {
  const SMALL = 4 * 1024 * 1024; // 4 MB

  if (blob.size <= SMALL) {
    const result = await graphFetch(
      `/me/drive/items/${folderId}:/${encodeURIComponent(filename)}:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      }
    );
    if (onProgress) onProgress(100);
    return result;
  }

  const session = await graphFetch(
    `/me/drive/items/${folderId}:/${encodeURIComponent(filename)}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    }
  );

  const uploadUrl = session.uploadUrl;
  const total = blob.size;
  const chunkSize = 10 * 320 * 1024; // ~3,2 MB
  let start = 0;
  let result;

  while (start < total) {
    const end = Math.min(start + chunkSize, total);
    const chunk = blob.slice(start, end);
    // Geen Authorization-header: de uploadUrl is al voorzien van toegang.
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${total}` },
      body: chunk,
    });
    if (!res.ok && res.status !== 202) {
      throw new Error(`Upload mislukt (${res.status})`);
    }
    if (res.status === 200 || res.status === 201) {
      result = await res.json();
    }
    start = end;
    if (onProgress) onProgress(Math.round((start / total) * 100));
  }
  return result;
}
