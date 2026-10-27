/**
 * AlexGherra Mobile Player (Cloud Google Drive Opzione C + Local Hybrid)
 * - Nessuna Waveform (zero download inutile su rete mobile)
 * - Solo sorgenti Beatport (!!!BeatportDownload) e Muzpa (!!!MuzpaDownload)
 * - Sincronizzazione ascoltati.txt e Cestino direttamente su Google Drive
 */

const CAMELOT_COLORS = {
  "1A": "#00d2be", "1B": "#00d2be",
  "2A": "#2ecc71", "2B": "#2ecc71",
  "3A": "#7cd924", "3B": "#7cd924",
  "4A": "#f1c40f", "4B": "#f1c40f",
  "5A": "#e67e22", "5B": "#e67e22",
  "6A": "#e74c3c", "6B": "#e74c3c",
  "7A": "#d63031", "7B": "#d63031",
  "8A": "#fd79a8", "8B": "#fd79a8",
  "9A": "#a29bfe", "9B": "#a29bfe",
  "10A": "#6c5ce7", "10B": "#6c5ce7",
  "11A": "#0984e3", "11B": "#0984e3",
  "12A": "#00cec9", "12B": "#00cec9"
};

const MUSICAL_TO_CAMELOT = {
  "abm": "1A", "g#m": "1A", "ebm": "2A", "d#m": "2A", "bbm": "3A", "a#m": "3A",
  "fm": "4A", "cm": "5A", "gm": "6A", "dm": "7A", "am": "8A", "em": "9A",
  "bm": "10A", "f#m": "11A", "gbm": "11A", "c#m": "12A", "dbm": "12A",
  "b": "1B", "f#": "2B", "gb": "2B", "c#": "3B", "db": "3B", "g#": "4B", "ab": "4B",
  "d#": "5B", "eb": "5B", "a#": "6B", "bb": "6B", "f": "7B", "c": "8B",
  "g": "9B", "d": "10B", "a": "11B", "e": "12B"
};

const DEFAULT_GDRIVE_CLIENT_ID = "31946341227-cf4lhvor1dfgnh5tubdm79hon7vr3906.apps.googleusercontent.com";

function getStoredToken() {
  const tok = localStorage.getItem("ag_gdrive_token") || "";
  const exp = parseInt(localStorage.getItem("ag_gdrive_token_exp") || "0", 10);
  if (tok && exp > Date.now()) return tok;
  return "";
}

const state = {
  mode: "local", // "cloud" (Google Drive API) oppure "local" (player_server.py)
  accessToken: getStoredToken(),
  clientId: localStorage.getItem("ag_gdrive_client_id") || DEFAULT_GDRIVE_CLIENT_ID,
  activeSource: "beatport", // "beatport" | "muzpa"
  activeSubfolder: "ALL",
  localRootPaths: {
    beatport: "",
    muzpa: ""
  },
  cloudRootIds: {
    beatport: null,
    muzpa: null
  },
  cloudSessionFileId: null,
  confirmedSet: new Set(),
  allTracks: [],
  filteredTracks: [],
  currentFilter: "all", // "all" | "pending" | "confirmed"
  currentIndex: -1,
  currentObjectUrl: null
};

// DOM Elements
const audioEl = document.getElementById("audioEl");
const pillBeatport = document.getElementById("pillBeatport");
const pillMuzpa = document.getElementById("pillMuzpa");
const subfolderSelect = document.getElementById("subfolderSelect");
const btnRefresh = document.getElementById("btnRefresh");
const btnCloudConfig = document.getElementById("btnCloudConfig");
const modeIcon = document.getElementById("modeIcon");
const modeText = document.getElementById("modeText");

const deckSubfolder = document.getElementById("deckSubfolder");
const deckPos = document.getElementById("deckPos");
const deckTitle = document.getElementById("deckTitle");
const deckArtist = document.getElementById("deckArtist");
const deckGenre = document.getElementById("deckGenre");
const deckCamelot = document.getElementById("deckCamelot");
const deckBpm = document.getElementById("deckBpm");
const deckEnergy = document.getElementById("deckEnergy");

const scrubberSlider = document.getElementById("scrubberSlider");
const timeElapsed = document.getElementById("timeElapsed");
const timeDuration = document.getElementById("timeDuration");

const btnPrev = document.getElementById("btnPrev");
const btnBack10 = document.getElementById("btnBack10");
const btnPlayPause = document.getElementById("btnPlayPause");
const btnFwd10 = document.getElementById("btnFwd10");
const btnFwd30 = document.getElementById("btnFwd30");
const btnNext = document.getElementById("btnNext");

const btnTrashNext = document.getElementById("btnTrashNext");
const btnConfirmNext = document.getElementById("btnConfirmNext");

const tabAll = document.getElementById("tabAll");
const tabPending = document.getElementById("tabPending");
const tabConfirmed = document.getElementById("tabConfirmed");
const btnResume = document.getElementById("btnResume");
const trackListEl = document.getElementById("trackList");

const cloudModal = document.getElementById("cloudModal");
const gdriveClientIdInput = document.getElementById("gdriveClientIdInput");
const btnCloseModal = document.getElementById("btnCloseModal");
const btnGoogleLogin = document.getElementById("btnGoogleLogin");
const mToast = document.getElementById("mToast");

function showToast(msg) {
  if (!mToast) return;
  mToast.textContent = msg;
  mToast.style.display = "block";
  clearTimeout(window._agToastTimer);
  window._agToastTimer = setTimeout(() => {
    mToast.style.display = "none";
  }, 2600);
}

function formatSec(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeCamelot(raw) {
  if (!raw || raw === "--") return "--";
  const clean = String(raw).trim();
  const m = clean.match(/\b([1-9]|1[0-2])[ABab]\b/);
  if (m) return m[0].toUpperCase();
  const low = clean.toLowerCase().replace(/\s+/g, "");
  return MUSICAL_TO_CAMELOT[low] || clean.toUpperCase();
}

/**
 * Estrae metadati dal nome file Picard:
 * es. FunkyHouse-E6-[2025]-Crazibiza-Let's Play House.mp3
 */
function parseMetadataFromFilename(filename) {
  const stem = filename.replace(/\.[^/.]+$/, "");
  let genre = "DJ Track";
  let energy = "--";
  let year = "";
  let artist = "Artista";
  let title = stem;
  let bpm = "--";
  let camelot = "--";

  // Pattern Picard: Genre-E6-[2026]-Artist-Title
  const picardMatch = stem.match(/^([^-]+)-E(10|[1-9])-\[(\d{4})\]-([^-]+)-(.+)$/i);
  if (picardMatch) {
    genre = picardMatch[1].trim();
    energy = `E${picardMatch[2]}`;
    year = picardMatch[3];
    artist = picardMatch[4].trim();
    title = picardMatch[5].trim();
  } else {
    const enMatch = stem.match(/(?:^|[-_\s\[])E(10|[1-9])(?:[-_\s\]]|$)/i);
    if (enMatch) energy = `E${enMatch[1]}`;
    const cleanStem = stem.replace(/^\d+[\.\-_\s]+/, "");
    if (cleanStem.includes(" - ")) {
      const parts = cleanStem.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  const keyMatch = stem.match(/\b([1-9]|1[0-2])[AB]\b/);
  if (keyMatch) camelot = keyMatch[0].toUpperCase();

  const bpmMatch = stem.match(/\b(1[1-3]\d)\s*(?:bpm)?\b/i);
  if (bpmMatch) bpm = bpmMatch[1];

  return { title, artist, genre, year, energy, bpm, camelot };
}

/**
 * Legge i primi 64 KB di un MP3 su Google Drive via Range header per estrarre ID3v2 (TKEY, TBPM, Energy)
 */
async function enrichTrackId3FromCloud(track) {
  if (!state.accessToken || !track.cloudId || track._id3Loaded) return;
  track._id3Loaded = true;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${track.cloudId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        Range: "bytes=0-65535"
      }
    });
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return;

    const decoder = new TextDecoder("latin1");
    const rawStr = decoder.decode(bytes);

    const readFrame = (id) => {
      const idx = rawStr.indexOf(id);
      if (idx === -1 || idx + 10 >= bytes.length) return "";
      const size = (bytes[idx + 4] << 21) | (bytes[idx + 5] << 14) | (bytes[idx + 6] << 7) | bytes[idx + 7];
      if (size <= 1 || size > 256 || idx + 10 + size > bytes.length) return "";
      const slice = bytes.slice(idx + 11, idx + 10 + size);
      return new TextDecoder("utf-8", { fatal: false }).decode(slice).replace(/\0/g, "").trim();
    };

    const tkey = readFrame("TKEY");
    if (tkey) track.camelot = normalizeCamelot(tkey);

    const tbpm = readFrame("TBPM");
    if (tbpm && !isNaN(parseFloat(tbpm))) {
      track.bpm = String(Math.round(parseFloat(tbpm)));
    }

    const tpub = readFrame("TPUB");
    if (tpub && (!track.energy || track.energy === "--")) {
      const m = tpub.match(/Energy\s*(10|[1-9])/i);
      if (m) track.energy = `E${m[1]}`;
    }

    if (state.filteredTracks[state.currentIndex] === track) {
      updateDeckUI(track);
    }
    renderTrackList();
  } catch (e) {
    // silenzioso
  }
}

// ── INIZIALIZZAZIONE MODALITÀ (LOCAL vs CLOUD GOOGLE DRIVE) ──
async function initApp() {
  if (gdriveClientIdInput && state.clientId) {
    gdriveClientIdInput.value = state.clientId;
  }

  // Se abbiamo già un token Google Drive attivo in sessione, usa Cloud
  if (state.accessToken) {
    setModeUI("cloud");
    await loadCloudSource(state.activeSource);
    return;
  }

  // Altrimenti verifica se siamo collegati al server locale Python
  try {
    const res = await fetch("/api/folders", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      const defaults = data.default_folders || [];
      const bp = defaults.find(f => f.path.includes("!!!BeatportDownload"));
      const mz = defaults.find(f => f.path.includes("!!!MuzpaDownload"));
      if (bp) state.localRootPaths.beatport = bp.path;
      if (mz) state.localRootPaths.muzpa = mz.path;

      setModeUI("local");
      await loadLocalSource(state.activeSource);
      return;
    }
  } catch (e) {
    // Server locale non raggiungibile: siamo fuori casa in modalità Cloud pura
  }

  setModeUI("cloud-disconnected");
  trackListEl.innerHTML = `
    <div style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; display: flex; flex-direction: column; align-items: center; gap: 14px;">
      <div>☁️ <strong>Modalità Fuori Casa (Google Drive Cloud)</strong><br>Accedi con un tocco alle tue cartelle <strong>Beatport</strong> e <strong>Muzpa</strong> anche a Mac spenti.</div>
      <button id="btnQuickGoogleLogin" type="button" style="background: var(--cyan); color: #050811; border: none; font-weight: 800; font-size: 0.92rem; padding: 12px 22px; border-radius: 12px; cursor: pointer; box-shadow: 0 0 18px rgba(0,240,255,0.28);">
        ☁️ Accedi con Google Drive
      </button>
    </div>
  `;
  const quickBtn = document.getElementById("btnQuickGoogleLogin");
  if (quickBtn) {
    quickBtn.addEventListener("click", () => startGoogleOAuthFlow());
  }
}

function setModeUI(mode) {
  if (mode === "cloud") {
    state.mode = "cloud";
    btnCloudConfig.classList.add("cloud-connected");
    modeIcon.textContent = "☁️";
    modeText.textContent = "Google Drive Attivo";
  } else if (mode === "local") {
    state.mode = "local";
    btnCloudConfig.classList.remove("cloud-connected");
    modeIcon.textContent = "🏠";
    modeText.textContent = "Rete Locale / Connetti Cloud";
  } else {
    state.mode = "cloud";
    btnCloudConfig.classList.remove("cloud-connected");
    modeIcon.textContent = "☁️";
    modeText.textContent = "Connetti Google Drive";
  }
}

// ── CARICAMENTO DA SERVER LOCALE (SOLO BEATPORT E MUZPA) ──
async function loadLocalSource(sourceKey) {
  const folderPath = state.localRootPaths[sourceKey];
  if (!folderPath) {
    trackListEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted);">Cartella ${sourceKey} non trovata.</div>`;
    return;
  }

  trackListEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted);">Caricamento brani ${sourceKey === "beatport" ? "Beatport" : "Muzpa"}...</div>`;
  try {
    const res = await fetch(`/api/scan?folder=${encodeURIComponent(folderPath)}`);
    const data = await res.json();
    state.allTracks = (data.tracks || []).map(t => ({
      ...t,
      camelot: normalizeCamelot(t.camelot)
    }));
    populateSubfoldersDropdown();
    applyFiltersAndRender(true);
  } catch (err) {
    trackListEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--red);">Errore caricamento: ${err.message}</div>`;
  }
}

// ── CARICAMENTO DA GOOGLE DRIVE CLOUD (OPZIONE C — SENZA MAC ACCESI) ──
async function gdriveFetchJson(url, options = {}) {
  const headers = {
    Authorization: `Bearer ${state.accessToken}`,
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    state.accessToken = "";
    localStorage.removeItem("ag_gdrive_token");
    localStorage.removeItem("ag_gdrive_token_exp");
    setModeUI("cloud-disconnected");
    throw new Error("Sessione Google scaduta. Premi Connetti Google Drive.");
  }
  if (!res.ok) {
    throw new Error(`Google Drive API HTTP ${res.status}`);
  }
  return res.json();
}

async function resolveCloudRootFolders() {
  if (state.cloudRootIds.beatport && state.cloudRootIds.muzpa) return;

  const q = encodeURIComponent(
    "mimeType = 'application/vnd.google-apps.folder' and (name = '!!!BeatportDownload' or name = '!!!MuzpaDownload') and trashed = false"
  );
  const data = await gdriveFetchJson(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  for (const f of data.files || []) {
    if (f.name === "!!!BeatportDownload") state.cloudRootIds.beatport = f.id;
    if (f.name === "!!!MuzpaDownload") state.cloudRootIds.muzpa = f.id;
  }
}

async function loadCloudSource(sourceKey) {
  trackListEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted);">☁️ Scansione Google Drive (${sourceKey === "beatport" ? "Beatport" : "Muzpa"})...</div>`;
  try {
    await resolveCloudRootFolders();
    const rootId = state.cloudRootIds[sourceKey];
    if (!rootId) {
      throw new Error(`Cartella ${sourceKey === "beatport" ? "!!!BeatportDownload" : "!!!MuzpaDownload"} non trovata su Google Drive.`);
    }

    // 1. Cerca sottocartelle e file nella cartella radice
    const qSub = encodeURIComponent(`'${rootId}' in parents and trashed = false`);
    const rootListing = await gdriveFetchJson(
      `https://www.googleapis.com/drive/v3/files?q=${qSub}&pageSize=1000&fields=files(id,name,mimeType,size)`
    );

    const subfolders = [];
    const directAudioFiles = [];
    state.cloudSessionFileId = null;
    state.confirmedSet = new Set();

    for (const item of rootListing.files || []) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        subfolders.push(item);
      } else if (item.name === "ascoltati.txt" || item.name === ".ascoltati.txt") {
        state.cloudSessionFileId = item.id;
      } else if (/\.(mp3|m4a|wav|flac|aiff)$/i.test(item.name)) {
        directAudioFiles.push({ ...item, subfolderName: "" });
      }
    }

    // 2. Scarica ascoltati.txt se esiste
    if (state.cloudSessionFileId) {
      try {
        const txtRes = await fetch(`https://www.googleapis.com/drive/v3/files/${state.cloudSessionFileId}?alt=media`, {
          headers: { Authorization: `Bearer ${state.accessToken}` }
        });
        if (txtRes.ok) {
          const txt = await txtRes.text();
          txt.split("\n").map(l => l.trim()).filter(Boolean).forEach(l => state.confirmedSet.add(l));
        }
      } catch (e) {}
    }

    // 3. Cerca i file audio nelle sottocartelle (in parallelo)
    const subResults = await Promise.all(
      subfolders.map(async (sf) => {
        const q = encodeURIComponent(`'${sf.id}' in parents and trashed = false`);
        const r = await gdriveFetchJson(
          `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=files(id,name,mimeType,size)`
        );
        return (r.files || [])
          .filter(f => /\.(mp3|m4a|wav|flac|aiff)$/i.test(f.name))
          .map(f => ({ ...f, subfolderName: sf.name }));
      })
    );

    const allCloudFiles = [...directAudioFiles, ...subResults.flat()];
    allCloudFiles.sort((a, b) => {
      const sa = `${a.subfolderName}/${a.name}`.toLowerCase();
      const sb = `${b.subfolderName}/${b.name}`.toLowerCase();
      return sa.localeCompare(sb);
    });

    state.allTracks = allCloudFiles.map((f, idx) => {
      const meta = parseMetadataFromFilename(f.name);
      const relPath = f.subfolderName ? `${f.subfolderName}/${f.name}` : f.name;
      const isConfirmed = state.confirmedSet.has(relPath) || state.confirmedSet.has(f.name);
      return {
        id: idx,
        cloudId: f.id,
        filename: f.name,
        filepath: relPath,
        subfolder: f.subfolderName,
        subfolder_name: f.subfolderName,
        title: meta.title,
        artist: meta.artist,
        genre: meta.genre,
        bpm: meta.bpm,
        camelot: meta.camelot,
        energy: meta.energy,
        duration: 0,
        duration_formatted: "--:--",
        confirmed: isConfirmed
      };
    });

    populateSubfoldersDropdown();
    applyFiltersAndRender(true);
  } catch (err) {
    trackListEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--red);">⚠️ ${err.message}</div>`;
  }
}

async function saveCloudConfirmedTracks(sourceKey) {
  if (!state.accessToken) return;
  const rootId = state.cloudRootIds[sourceKey];
  if (!rootId) return;
  const content = Array.from(state.confirmedSet).sort().join("\n") + "\n";

  if (state.cloudSessionFileId) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${state.cloudSessionFileId}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        "Content-Type": "text/plain; charset=utf-8"
      },
      body: content
    });
  } else {
    const metadata = {
      name: "ascoltati.txt",
      parents: [rootId],
      mimeType: "text/plain"
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([content], { type: "text/plain" }));
    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.accessToken}` },
      body: form
    });
    if (res.ok) {
      const d = await res.json();
      state.cloudSessionFileId = d.id;
    }
  }
}

// ── FILTRI SOTTOCARTELLE E STATO ASCOLTO ──
function populateSubfoldersDropdown() {
  const subs = new Set();
  state.allTracks.forEach(t => {
    if (t.subfolder_name) subs.add(t.subfolder_name);
  });
  const sorted = Array.from(subs).sort();
  subfolderSelect.innerHTML = `<option value="ALL">Tutte le sottocartelle (${state.allTracks.length} brani)</option>` +
    sorted.map(s => {
      const count = state.allTracks.filter(t => t.subfolder_name === s).length;
      return `<option value="${s.replace(/"/g, "&quot;")}">${s} (${count})</option>`;
    }).join("");
  state.activeSubfolder = "ALL";
}

function applyFiltersAndRender(autoSelectFirst = false) {
  const bySub = state.activeSubfolder === "ALL"
    ? state.allTracks
    : state.allTracks.filter(t => t.subfolder_name === state.activeSubfolder);

  const totalCount = bySub.length;
  const confirmedCount = bySub.filter(t => t.confirmed).length;
  const pendingCount = totalCount - confirmedCount;

  tabAll.textContent = `Tutti (${totalCount})`;
  tabPending.textContent = `Da Ascoltare (${pendingCount})`;
  tabConfirmed.textContent = `Ascoltati (${confirmedCount})`;

  if (state.currentFilter === "pending") {
    state.filteredTracks = bySub.filter(t => !t.confirmed);
  } else if (state.currentFilter === "confirmed") {
    state.filteredTracks = bySub.filter(t => t.confirmed);
  } else {
    state.filteredTracks = bySub;
  }

  renderTrackList();

  if (autoSelectFirst && state.filteredTracks.length > 0) {
    const firstUnlistened = state.filteredTracks.findIndex(t => !t.confirmed);
    const startIdx = firstUnlistened !== -1 ? firstUnlistened : 0;
    loadTrack(startIdx, false);
  } else if (state.filteredTracks.length === 0) {
    state.currentIndex = -1;
    updateDeckUI(null);
  }
}

function renderTrackList() {
  if (state.filteredTracks.length === 0) {
    trackListEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 0.84rem;">Nessun brano in questa vista.</div>`;
    return;
  }

  trackListEl.innerHTML = state.filteredTracks.map((t, idx) => {
    const isCurrent = idx === state.currentIndex;
    const camColor = CAMELOT_COLORS[t.camelot] || "#475569";
    return `
      <div class="track-row ${isCurrent ? "active" : ""} ${t.confirmed ? "confirmed" : ""}" data-idx="${idx}">
        <div class="row-badges">
          <span class="row-camelot" style="background: ${camColor};">${t.camelot || "--"}</span>
          <span class="row-bpm-en">${t.bpm || "--"} • ${t.energy || "--"}</span>
        </div>
        <div class="row-main">
          <div class="row-title">${t.title}</div>
          <div class="row-sub">${t.artist}${t.subfolder_name ? ` • ${t.subfolder_name}` : ""}</div>
        </div>
        <div class="row-status">${t.confirmed ? "✅" : "🎵"}</div>
      </div>
    `;
  }).join("");

  trackListEl.querySelectorAll(".track-row").forEach(row => {
    row.addEventListener("click", () => {
      const idx = parseInt(row.getAttribute("data-idx"), 10);
      loadTrack(idx, true);
    });
  });
}

// ── RIPRODUZIONE AUDIO & MEDIA SESSION (LOCK SCREEN / AIRPODS / CARPLAY) ──
function updateDeckUI(track) {
  if (!track) {
    deckSubfolder.textContent = "--";
    deckPos.textContent = "0 / 0";
    deckTitle.textContent = "Nessun brano";
    deckArtist.textContent = "--";
    deckGenre.textContent = "--";
    deckCamelot.textContent = "--";
    deckCamelot.style.background = "#64748b";
    deckBpm.textContent = "--";
    deckEnergy.textContent = "--";
    return;
  }

  deckSubfolder.textContent = track.subfolder_name || (state.activeSource === "beatport" ? "Beatport" : "Muzpa");
  deckPos.textContent = `${state.currentIndex + 1} / ${state.filteredTracks.length}`;
  deckTitle.textContent = track.title;
  deckArtist.textContent = track.artist;
  deckGenre.textContent = track.genre || "DJ Track";

  const cam = normalizeCamelot(track.camelot);
  deckCamelot.textContent = cam;
  deckCamelot.style.background = CAMELOT_COLORS[cam] || "#64748b";
  deckBpm.textContent = track.bpm || "--";
  deckEnergy.textContent = track.energy || "--";

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `[${cam} • ${track.bpm || "--"} • ${track.energy || "--"}] ${track.title}`,
      artist: track.artist,
      album: track.subfolder_name || "AlexGherra Mobile Deck"
    });
    navigator.mediaSession.setActionHandler("play", () => audioEl.play());
    navigator.mediaSession.setActionHandler("pause", () => audioEl.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrev());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNext());
    navigator.mediaSession.setActionHandler("seekbackward", () => seekRelative(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => seekRelative(30));
  }
}

async function loadTrack(index, autoPlay = true) {
  if (index < 0 || index >= state.filteredTracks.length) return;
  state.currentIndex = index;
  const track = state.filteredTracks[index];

  updateDeckUI(track);
  renderTrackList();

  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = null;
  }

  scrubberSlider.value = 0;
  timeElapsed.textContent = "00:00";
  timeDuration.textContent = track.duration_formatted || "--:--";

  if (state.mode === "local") {
    audioEl.src = `/api/stream?file=${encodeURIComponent(track.filepath)}`;
    if (autoPlay) {
      audioEl.play().catch(() => {});
    }
  } else {
    // Cloud Google Drive: arricchisci tag ID3 (64KB) e avvia stream autenticato
    enrichTrackId3FromCloud(track);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${track.cloudId}?alt=media`, {
        headers: { Authorization: `Bearer ${state.accessToken}` }
      });
      if (!res.ok) throw new Error("Impossibile riprodurre file da Google Drive");
      const blob = await res.blob();
      state.currentObjectUrl = URL.createObjectURL(blob);
      audioEl.src = state.currentObjectUrl;
      if (autoPlay) {
        audioEl.play().catch(() => {});
      }
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  }
}

function playNext() {
  if (state.currentIndex + 1 < state.filteredTracks.length) {
    loadTrack(state.currentIndex + 1, true);
  } else {
    showToast("Fine della lista raggiunta");
  }
}

function playPrev() {
  if (state.currentIndex - 1 >= 0) {
    loadTrack(state.currentIndex - 1, true);
  }
}

function seekRelative(deltaSec) {
  if (!audioEl.duration) return;
  audioEl.currentTime = Math.max(0, Math.min(audioEl.duration, audioEl.currentTime + deltaSec));
}

// ── AZIONI DJ: OK ASCOLTATO & CESTINA ──
async function confirmCurrentAndNext() {
  const track = state.filteredTracks[state.currentIndex];
  if (!track) return;

  track.confirmed = true;
  if (state.mode === "local") {
    const folderPath = state.localRootPaths[state.activeSource];
    await fetch("/api/confirm_track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folder: folderPath,
        file: track.filepath,
        confirmed: true
      })
    });
  } else {
    state.confirmedSet.add(track.filepath);
    saveCloudConfirmedTracks(state.activeSource).catch(() => {});
  }

  showToast("✅ Confermato come ascoltato");
  if (state.currentFilter === "pending") {
    const prevIdx = state.currentIndex;
    applyFiltersAndRender(false);
    if (state.filteredTracks.length > 0) {
      loadTrack(Math.min(prevIdx, state.filteredTracks.length - 1), true);
    }
  } else {
    renderTrackList();
    playNext();
  }
}

async function trashCurrentAndNext() {
  const track = state.filteredTracks[state.currentIndex];
  if (!track) return;

  const prevIdx = state.currentIndex;
  try {
    if (state.mode === "local") {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: track.filepath })
      });
      if (!res.ok) throw new Error("Errore eliminazione file");
    } else {
      await gdriveFetchJson(`https://www.googleapis.com/drive/v3/files/${track.cloudId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true })
      });
      state.confirmedSet.delete(track.filepath);
      saveCloudConfirmedTracks(state.activeSource).catch(() => {});
    }

    state.allTracks = state.allTracks.filter(t => t !== track);
    showToast(`🗑️ Cestinato: ${track.title}`);
    applyFiltersAndRender(false);
    if (state.filteredTracks.length > 0) {
      loadTrack(Math.min(prevIdx, state.filteredTracks.length - 1), true);
    }
  } catch (err) {
    showToast(`⚠️ ${err.message}`);
  }
}

// ── EVENT LISTENERS ──
pillBeatport.addEventListener("click", () => {
  state.activeSource = "beatport";
  pillBeatport.classList.add("active");
  pillMuzpa.classList.remove("active");
  if (state.mode === "local") loadLocalSource("beatport");
  else if (state.accessToken) loadCloudSource("beatport");
});

pillMuzpa.addEventListener("click", () => {
  state.activeSource = "muzpa";
  pillMuzpa.classList.add("active");
  pillBeatport.classList.remove("active");
  if (state.mode === "local") loadLocalSource("muzpa");
  else if (state.accessToken) loadCloudSource("muzpa");
});

subfolderSelect.addEventListener("change", () => {
  state.activeSubfolder = subfolderSelect.value;
  applyFiltersAndRender(true);
});

btnRefresh.addEventListener("click", () => {
  if (state.mode === "local") loadLocalSource(state.activeSource);
  else if (state.accessToken) loadCloudSource(state.activeSource);
});

[tabAll, tabPending, tabConfirmed].forEach(btn => {
  btn.addEventListener("click", () => {
    [tabAll, tabPending, tabConfirmed].forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentFilter = btn.getAttribute("data-filter");
    applyFiltersAndRender(false);
  });
});

btnResume.addEventListener("click", () => {
  const firstUnlistened = state.filteredTracks.findIndex(t => !t.confirmed);
  if (firstUnlistened !== -1) {
    loadTrack(firstUnlistened, true);
    showToast("▶ Ripreso dal primo brano non ascoltato");
  } else {
    showToast("Tutti i brani in questa vista sono già ascoltati!");
  }
});

btnPlayPause.addEventListener("click", () => {
  if (!audioEl.src && state.filteredTracks.length > 0) {
    loadTrack(0, true);
    return;
  }
  if (audioEl.paused) audioEl.play();
  else audioEl.pause();
});

audioEl.addEventListener("play", () => { btnPlayPause.textContent = "⏸"; });
audioEl.addEventListener("pause", () => { btnPlayPause.textContent = "▶"; });
audioEl.addEventListener("ended", () => { playNext(); });
audioEl.addEventListener("timeupdate", () => {
  if (!audioEl.duration) return;
  scrubberSlider.value = ((audioEl.currentTime / audioEl.duration) * 100).toFixed(2);
  timeElapsed.textContent = formatSec(audioEl.currentTime);
  timeDuration.textContent = formatSec(audioEl.duration);
});

scrubberSlider.addEventListener("input", () => {
  if (!audioEl.duration) return;
  audioEl.currentTime = (parseFloat(scrubberSlider.value) / 100) * audioEl.duration;
});

btnPrev.addEventListener("click", playPrev);
btnNext.addEventListener("click", playNext);
btnBack10.addEventListener("click", () => seekRelative(-10));
btnFwd10.addEventListener("click", () => seekRelative(10));
btnFwd30.addEventListener("click", () => seekRelative(30));

btnConfirmNext.addEventListener("click", confirmCurrentAndNext);
btnTrashNext.addEventListener("click", trashCurrentAndNext);

// Google Drive OAuth Direct Flow & Modal
function startGoogleOAuthFlow(customClientId) {
  const cid = (customClientId || state.clientId || DEFAULT_GDRIVE_CLIENT_ID).trim();
  if (!cid) {
    cloudModal.classList.add("active");
    return;
  }
  state.clientId = cid;
  localStorage.setItem("ag_gdrive_client_id", cid);

  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    showToast("Libreria Google Identity in caricamento, riprova tra 2 secondi");
    return;
  }

  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: cid,
    scope: "https://www.googleapis.com/auth/drive",
    callback: async (resp) => {
      if (resp && resp.access_token) {
        state.accessToken = resp.access_token;
        const expiresSec = parseInt(resp.expires_in || "3500", 10);
        localStorage.setItem("ag_gdrive_token", resp.access_token);
        localStorage.setItem("ag_gdrive_token_exp", String(Date.now() + (expiresSec - 60) * 1000));
        cloudModal.classList.remove("active");
        setModeUI("cloud");
        showToast("☁️ Connesso a Google Drive!");
        await loadCloudSource(state.activeSource);
      }
    }
  });
  tokenClient.requestAccessToken({ prompt: "" });
}

btnCloudConfig.addEventListener("click", () => {
  if (!state.accessToken && state.clientId) {
    startGoogleOAuthFlow(state.clientId);
  } else {
    cloudModal.classList.add("active");
  }
});

btnCloseModal.addEventListener("click", () => {
  cloudModal.classList.remove("active");
});

btnGoogleLogin.addEventListener("click", () => {
  const cid = gdriveClientIdInput.value.trim() || DEFAULT_GDRIVE_CLIENT_ID;
  startGoogleOAuthFlow(cid);
});

initApp();

