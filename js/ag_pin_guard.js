/**
 * AG PIN Guard — Protezione Crittografica PBKDF2-SHA256 + SHA256-CTR (256-bit)
 * Blocca l'accesso alle Web App GitHub Pages di DJ Alex Gherra e decifra i dati solo dopo inserimento PIN.
 * Nessun PIN in chiaro è mai presente nel codice sorgente.
 */
(function () {
  const SALT_ASCII = "AG_DJ_SALT_2026!";
  const PBKDF2_ITERATIONS = 25000;
  const EXPECTED_VERIFIER = "898ec2e847ff1978f7a5bca1bc77c707d96e2b603ef28da8238f131533ccb882";
  const STORAGE_KEY = "ag_dj_unlocked_key_v1";

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    body.ag-pin-locked > *:not(#agPinLockOverlay) {
      display: none !important;
    }
    #agPinLockOverlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: radial-gradient(circle at 50% 0%, #131c33 0%, #06080f 65%);
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      user-select: none;
    }
    #agPinLockOverlay[hidden] {
      display: none !important;
    }
    .ag-pin-card {
      width: 100%;
      max-width: 350px;
      background: rgba(15, 21, 35, 0.92);
      border: 1px solid rgba(0, 210, 190, 0.3);
      border-radius: 20px;
      padding: 26px 22px 22px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75);
      text-align: center;
      backdrop-filter: blur(14px);
    }
    .ag-pin-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(0, 210, 190, 0.14);
      border: 1px solid rgba(0, 210, 190, 0.4);
      font-size: 1.35rem;
      margin-bottom: 10px;
    }
    .ag-pin-title {
      font-size: 1.12rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      margin-bottom: 4px;
    }
    .ag-pin-sub {
      font-size: 0.78rem;
      color: #94a3b8;
      margin-bottom: 18px;
    }
    .ag-pin-dots {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .ag-pin-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(148, 163, 184, 0.45);
      background: transparent;
      transition: all 0.14s ease;
    }
    .ag-pin-dot.filled {
      background: #00d2be;
      border-color: #00d2be;
      box-shadow: 0 0 10px rgba(0, 210, 190, 0.65);
      transform: scale(1.1);
    }
    .ag-pin-dot.error {
      background: #ef4444;
      border-color: #ef4444;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.65);
    }
    .ag-pin-msg {
      min-height: 18px;
      font-size: 0.76rem;
      color: #fca5a5;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .ag-pin-pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .ag-pin-key {
      height: 52px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: #f8fafc;
      font-size: 1.2rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.12s ease, transform 0.1s ease;
    }
    .ag-pin-key:hover {
      background: rgba(0, 210, 190, 0.15);
      border-color: rgba(0, 210, 190, 0.4);
    }
    .ag-pin-key:active {
      transform: scale(0.96);
    }
    .ag-pin-key.fn {
      font-size: 0.88rem;
      color: #94a3b8;
    }
    .ag-pin-remember {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 0.78rem;
      color: #cbd5e1;
      cursor: pointer;
    }
    @keyframes agShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .ag-shake {
      animation: agShake 0.35s ease;
    }
  `;
  document.head.appendChild(styleEl);

  function hexToBytes(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function deriveKeyFromPin(pin) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(pin),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc.encode(SALT_ASCII),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      baseKey,
      256
    );
    return new Uint8Array(bits);
  }

  async function verifyKeyBytes(keyBytes) {
    const prefix = new TextEncoder().encode("VERIFY:");
    const combined = new Uint8Array(prefix.length + keyBytes.length);
    combined.set(prefix, 0);
    combined.set(keyBytes, prefix.length);
    const hashBuf = await crypto.subtle.digest("SHA-256", combined);
    const hex = bytesToHex(new Uint8Array(hashBuf));
    return hex === EXPECTED_VERIFIER;
  }

  async function applyUnlock() {
    document.body.classList.remove("ag-pin-locked");
    const overlay = document.getElementById("agPinLockOverlay");
    if (overlay) overlay.hidden = true;
    window.dispatchEvent(new CustomEvent("ag-pin-unlocked"));
  }

  window.agLockSession = function () {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  function buildLockUi() {
    document.body.classList.add("ag-pin-locked");

    const overlay = document.createElement("div");
    overlay.id = "agPinLockOverlay";
    overlay.innerHTML = `
      <div class="ag-pin-card" id="agPinCard">
        <div class="ag-pin-badge">🔒</div>
        <div class="ag-pin-title">Accesso Riservato</div>
        <div class="ag-pin-sub">Inserisci il PIN personale di DJ Alex Gherra</div>

        <div class="ag-pin-dots" id="agPinDots">
          <span class="ag-pin-dot"></span>
          <span class="ag-pin-dot"></span>
          <span class="ag-pin-dot"></span>
          <span class="ag-pin-dot"></span>
          <span class="ag-pin-dot"></span>
          <span class="ag-pin-dot"></span>
        </div>

        <div class="ag-pin-msg" id="agPinMsg"></div>

        <div class="ag-pin-pad">
          <button type="button" class="ag-pin-key" data-digit="1">1</button>
          <button type="button" class="ag-pin-key" data-digit="2">2</button>
          <button type="button" class="ag-pin-key" data-digit="3">3</button>
          <button type="button" class="ag-pin-key" data-digit="4">4</button>
          <button type="button" class="ag-pin-key" data-digit="5">5</button>
          <button type="button" class="ag-pin-key" data-digit="6">6</button>
          <button type="button" class="ag-pin-key" data-digit="7">7</button>
          <button type="button" class="ag-pin-key" data-digit="8">8</button>
          <button type="button" class="ag-pin-key" data-digit="9">9</button>
          <button type="button" class="ag-pin-key fn" data-action="clear">C</button>
          <button type="button" class="ag-pin-key" data-digit="0">0</button>
          <button type="button" class="ag-pin-key fn" data-action="back">⌫</button>
        </div>

        <label class="ag-pin-remember">
          <input type="checkbox" id="agPinRememberChk" checked>
          <span>Ricorda su questo dispositivo</span>
        </label>
      </div>
    `;
    document.body.prepend(overlay);

    let entered = "";
    const dots = Array.from(overlay.querySelectorAll(".ag-pin-dot"));
    const msgEl = overlay.querySelector("#agPinMsg");
    const cardEl = overlay.querySelector("#agPinCard");
    const rememberChk = overlay.querySelector("#agPinRememberChk");

    function updateDots(isError = false) {
      dots.forEach((d, idx) => {
        d.classList.toggle("filled", idx < entered.length && !isError);
        d.classList.toggle("error", isError);
      });
    }

    async function checkPinNow() {
      if (entered.length < 6) return;
      const pinCandidate = entered;
      try {
        const keyBytes = await deriveKeyFromPin(pinCandidate);
        const valid = await verifyKeyBytes(keyBytes);
        if (valid) {
          if (rememberChk.checked) {
            localStorage.setItem(STORAGE_KEY, bytesToHex(keyBytes));
          }
          await applyUnlock();
        } else {
          updateDots(true);
          msgEl.textContent = "PIN non valido. Riprova.";
          cardEl.classList.remove("ag-shake");
          void cardEl.offsetWidth;
          cardEl.classList.add("ag-shake");
          setTimeout(() => {
            entered = "";
            updateDots(false);
          }, 550);
        }
      } catch (err) {
        msgEl.textContent = "Errore verifica crittografica.";
      }
    }

    function pushDigit(d) {
      if (entered.length >= 6) return;
      msgEl.textContent = "";
      entered += d;
      updateDots(false);
      if (entered.length === 6) {
        checkPinNow();
      }
    }

    overlay.querySelectorAll(".ag-pin-key").forEach(btn => {
      btn.addEventListener("click", () => {
        const digit = btn.dataset.digit;
        const action = btn.dataset.action;
        if (digit !== undefined) {
          pushDigit(digit);
        } else if (action === "clear") {
          entered = "";
          msgEl.textContent = "";
          updateDots(false);
        } else if (action === "back") {
          entered = entered.slice(0, -1);
          msgEl.textContent = "";
          updateDots(false);
        }
      });
    });

    window.addEventListener("keydown", (e) => {
      if (overlay.hidden) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        entered = entered.slice(0, -1);
        updateDots(false);
      } else if (e.key === "Escape") {
        entered = "";
        updateDots(false);
      }
    });
  }

  async function initPinGuard() {
    buildLockUi();
    const savedKeyHex = localStorage.getItem(STORAGE_KEY);
    if (savedKeyHex && savedKeyHex.length === 64) {
      try {
        const keyBytes = hexToBytes(savedKeyHex);
        if (await verifyKeyBytes(keyBytes)) {
          await applyUnlock();
          return;
        }
      } catch (_) {}
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPinGuard);
  } else {
    initPinGuard();
  }
})();
