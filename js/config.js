// ============================================================================
//  CONFIGURATIE
// ============================================================================
//  De projecten staan in jouw OneDrive (energiebehoud-my.sharepoint.com),
//  in gedeelde mappen. De app gebruikt daarom rechtstreeks jouw OneDrive.
//
//  clientId en tenantId zijn GEEN geheimen (een SPA gebruikt PKCE, geen secret).
// ----------------------------------------------------------------------------

export const config = {
  // ----- Uit Azure (app-registratie) ------------------------------------------
  clientId: "265a29ca-f690-45a5-9d60-375a9ab6cc96",   // Application (client) ID
  tenantId: "ab81a85c-999b-4a6d-80dc-238143505131",   // Directory (tenant) ID

  // ----- OneDrive: startmap waarin de projecten staan -------------------------
  // {year} wordt automatisch vervangen door het huidige jaartal.
  // Bijv. in 2026 -> "0. Projecten 2026 shared".
  // Wil je een vaste map die niet per jaar wisselt? Zet hier de letterlijke naam
  // zonder {year}, bijv. "0. Projecten shared".
  rootFolderTemplate: "0. Projecten {year} shared",

  // ----- Waar komen de foto's binnen een (project)map -------------------------
  // Submapnaam waarin de foto's worden opgeslagen. De app maakt deze map aan
  // als die nog niet bestaat. Laat leeg ("") om direct in de gekozen map te
  // uploaden (zonder submap).
  photoSubfolder: "2. Foto's",
};

// ----------------------------------------------------------------------------
//  Afgeleide instellingen — hieronder niets aanpassen
// ----------------------------------------------------------------------------
export const msalConfig = {
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

// Rechten die de app aan Microsoft vraagt (lezen/schrijven in jouw OneDrive).
export const graphScopes = ["User.Read", "Files.ReadWrite.All"];

// Huidige hoofdmapnaam (met jaartal ingevuld).
export function rootFolderName() {
  return (config.rootFolderTemplate || "").replace("{year}", String(new Date().getFullYear()));
}
