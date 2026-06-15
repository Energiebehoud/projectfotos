# Projectfoto's – Energiebehoud

Een installeerbare web-app (PWA) waarmee je op een tablet foto's maakt die
**direct in de juiste SharePoint-projectmap** worden opgeslagen.

- Inloggen met je `@energiebehoud.nl`-account (Microsoft)
- Project kiezen uit een lijst **of** een nieuw project aanmaken
- Foto maken → wordt meteen geüpload met een nette bestandsnaam
  (bijv. `2026-06-15_14-32-07_projectnaam.jpg`)

---

## 1. Azure-registratie (eenmalig)

De app logt namens jou in bij Microsoft. Daarvoor registreer je hem één keer in
**Microsoft Entra ID** (voorheen Azure AD).

1. Ga naar **https://entra.microsoft.com** → log in als beheerder.
2. Links: **Identity → Applications → App registrations** → **+ New registration**.
3. **Name:** `Projectfoto's`
4. **Supported account types:** *Accounts in this organizational directory only (Single tenant)*.
5. **Redirect URI:** kies platform **Single-page application (SPA)** en vul in:
   `http://localhost:8080/`  (voor lokaal testen — productie-URL voeg je later toe)
6. Klik **Register**.
7. Op de overzichtspagina (*Overview*) staan twee waarden — kopieer ze:
   - **Application (client) ID**  → in `js/config.js` bij `clientId`
   - **Directory (tenant) ID**    → in `js/config.js` bij `tenantId`
8. Links **API permissions → + Add a permission → Microsoft Graph →
   Delegated permissions**. Voeg toe (zoek en vink aan):
   - `User.Read`  (staat er meestal al)
   - `Files.ReadWrite.All`
   - `Sites.ReadWrite.All`
9. Klik **Grant admin consent for <organisatie>** en bevestig.
   (De vinkjes worden groen — nodig omdat deze rechten op organisatieniveau gelden.)

> Later, na publiceren op Azure: ga terug naar **Authentication** en voeg onder
> *Single-page application* je productie-URL toe (bijv.
> `https://projectfotos.azurestaticapps.net/`).

---

## 2. Configuratie invullen

Open `js/config.js` en vul in:

```js
clientId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   // Application (client) ID
tenantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   // Directory (tenant) ID
```

Controleer daarna de SharePoint-instellingen. Open je projecten-site in de browser
en kijk naar de URL, bijvoorbeeld:

`https://energiebehoud.sharepoint.com/sites/Projecten`

```js
sharepointHostname: "energiebehoud.sharepoint.com",
sitePath: "/sites/Projecten",
documentLibrary: "",        // leeg = standaardbibliotheek ("Documenten")
projectsRootFolder: "",     // leeg = projectmappen staan in de hoofdmap
```

> `clientId` en `tenantId` zijn **geen geheimen**: een SPA gebruikt PKCE (geen
> wachtwoord/secret). Ze mogen gerust in dit bestand staan.

---

## 3. Lokaal testen

Start een eenvoudige webserver **in de map `projectfotos-app`** (poort 8080,
zodat hij overeenkomt met de redirect-URI uit stap 1):

**Met Python:**
```powershell
python -m http.server 8080
```

**Of met Node.js:**
```powershell
npx --yes serve -l 8080
```

Open daarna **http://localhost:8080/** in de browser en log in.

> Een service worker cachet de app. Zie je na het wijzigen van bestanden geen
> verandering? Doe een harde herlaadbeurt (Ctrl+Shift+R), of schakel in de
> DevTools (F12 → Application → Service Workers) *"Update on reload"* in.

---

## 4. Publiceren op Azure Static Web Apps (gratis, zonder extra software)

**Stap 1 — Bestanden op GitHub zetten (via de website, geen Git-client nodig)**
1. Maak (indien nog niet) een gratis account op https://github.com.
2. Klik **+** rechtsboven → **New repository**. Naam bijv. `projectfotos`,
   zet op **Private**, klik **Create repository**.
3. Klik op **uploading an existing file** (of **Add file → Upload files**).
4. Sleep de **inhoud van de map `projectfotos-app`** in het venster
   (de bestanden + de submappen `css`, `js`, `icons`). Mappen blijven behouden.
   - `dev-server.ps1` mag je weglaten (alleen voor lokaal testen).
5. Klik **Commit changes**.

**Stap 2 — Static Web App aanmaken in Azure**
1. Ga naar https://portal.azure.com → zoek **Static Web Apps** → **+ Create**.
2. Kies je *Subscription* en *Resource group* (of maak er een).
3. **Name:** `projectfotos` · **Plan type:** Free · **Region:** West Europe.
4. **Source:** GitHub → log in → kies je *Organization*, de repo `projectfotos`
   en branch `main`.
5. **Build presets:** kies **Custom**.
   - **App location:** `/`
   - **Api location:** *(leeg laten)*
   - **Output location:** *(leeg laten — er is geen build-stap)*
6. **Review + create** → **Create**. Na ±1–2 minuten is hij klaar.
7. Op de overzichtspagina staat de **URL**, iets als
   `https://<willekeurig>.azurestaticapps.net/`.

**Stap 3 — Redirect-URI toevoegen in Azure (anders mislukt het inloggen)**
1. Ga naar **entra.microsoft.com → App registrations → Projectfoto's →
   Authentication**.
2. Onder **Single-page application** → **Add URI** → plak je nieuwe URL
   (met `/` op het eind), bijv. `https://<willekeurig>.azurestaticapps.net/`.
3. **Save**.

Klaar — open de URL op je tablet en installeer hem (zie hoofdstuk 5).
Toekomstige wijzigingen? Upload de gewijzigde bestanden opnieuw naar GitHub;
Azure publiceert ze dan automatisch.

> **Alternatief zonder GitHub:** *Azure Storage static website*. Maak een
> Storage-account, zet **Static website** aan (indexdocument `index.html`),
> en upload de bestanden (handig met de gratis app *Azure Storage Explorer*).
> Je krijgt dan een `…web.core.windows.net`-URL die je net zo als hierboven
> als redirect-URI toevoegt.

---

## 5. Installeren op de tablet

1. Open de (gepubliceerde) URL in de browser van de tablet.
2. **iPad/Safari:** Deel-knop → *Zet op beginscherm*.
   **Android/Chrome:** menu (⋮) → *App installeren* / *Toevoegen aan startscherm*.
3. Start voortaan via het app-icoon. De camera opent direct vanuit de app.

---

## 6. Problemen oplossen

| Probleem | Oplossing |
|---|---|
| `AADSTS50011: redirect URI mismatch` | De URL in de browser komt niet exact overeen met de redirect-URI in Azure. Voeg de exacte URL (incl. `http://` en eventuele `/`) toe bij *Authentication*. |
| `403 / Access denied` bij mappen | Rechten niet verleend: controleer *API permissions* en klik *Grant admin consent*. |
| `Bibliotheek niet gevonden` | `documentLibrary` in `config.js` klopt niet; laat leeg voor de standaardbibliotheek. |
| Mappen laden niet | Controleer `sharepointHostname` en `sitePath` (zie de site-URL). |
| Wijzigingen zijn niet zichtbaar | Service worker-cache: harde herlaadbeurt (Ctrl+Shift+R) of SW updaten in DevTools. |

---

## Bestanden

```
projectfotos-app/
├─ index.html              app-schermen
├─ css/style.css           opmaak
├─ js/
│  ├─ config.js            ← HIER je instellingen invullen
│  ├─ auth.js              Microsoft-login (MSAL)
│  ├─ graph.js             SharePoint via Microsoft Graph
│  └─ app.js               schermlogica
├─ manifest.webmanifest    PWA-manifest
├─ sw.js                   service worker (offline/installeerbaar)
├─ staticwebapp.config.json Azure Static Web Apps-config
└─ icons/                  app-iconen
```
