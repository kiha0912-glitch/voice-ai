(() => {
  const $ = (id) => document.getElementById(id);

  const connPill = $("connPill");
  const log = $("log");
  const form = $("form");
  const q = $("q");
  const count = $("count");
  const err = $("err");
  const btnClear = $("btnClear");
  const spinner = $("spinner");

  const audio = $("audio");
  let currentVoiceUI = null;

  function updateCount() {
    const n = (q.value || "").length;
    count.textContent = `${n} / 2000`;
  }
  q.addEventListener("input", updateCount);
  updateCount();

  function setConn(text, ok) {
    connPill.textContent = text;
    connPill.classList.toggle("pill--ok", !!ok);
  }

  function showError(msg) {
    if (!msg) {
      err.hidden = true;
      err.textContent = "";
      return;
    }
    err.hidden = false;
    err.textContent = msg;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function scrollToBottom() {
    log.scrollTop = log.scrollHeight;
  }

  function resetAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (currentVoiceUI) {
      currentVoiceUI.btn.textContent = "▶";
      currentVoiceUI.wrap.classList.remove("voice--playing");
    }
  }

  function setBusy(on) {
    form.querySelectorAll("button, textarea, input").forEach((el) => (el.disabled = on));
    spinner.hidden = !on;
  }

  // --- Cards ---
  function mkWrap(role) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role}`;
    return wrap;
  }

  function addUserCard(text) {
    const wrap = mkWrap("user");
    const content = document.createElement("div");
    content.className = "msg__content";

    const roleEl = document.createElement("div");
    roleEl.className = "msg__role";
    roleEl.textContent = "相談者";
    content.appendChild(roleEl);

    const body = document.createElement("div");
    body.className = "msg__body";
    body.innerHTML = escapeHtml(text).replaceAll("\n", "<br />");
    content.appendChild(body);

    wrap.appendChild(content);
    log.appendChild(wrap);
    scrollToBottom();
  }

  // AI：初期表示は “ボイスだけ”。テキストはボタンで開く
  function addAiCardVoiceOnly(fullText, audioBase64) {
    const wrap = mkWrap("ai");

    const av = document.createElement("div");
    av.className = "msg__avatar";
    const img = document.createElement("img");
    img.src = "/haruka-icon.png";
    img.alt = "越水はるか";
    av.appendChild(img);
    wrap.appendChild(av);

    const content = document.createElement("div");
    content.className = "msg__content";

    const roleEl = document.createElement("div");
    roleEl.className = "msg__role";
    roleEl.textContent = "越水はるか";
    content.appendChild(roleEl);

    // ① ボイスバブル
    const voiceWrap = document.createElement("div");
    voiceWrap.className = "voice";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "voice__btn";
    btn.textContent = "▶";

    const bars = document.createElement("div");
    bars.className = "voice__bars";
    for (let i = 0; i < 20; i++) {
      const b = document.createElement("span");
      b.className = "voice__bar";
      b.style.height = `${8 + (i % 5) * 4}px`;
      bars.appendChild(b);
    }

    const time = document.createElement("div");
    time.className = "voice__time";
    time.textContent = "--:--";

    voiceWrap.appendChild(btn);
    voiceWrap.appendChild(bars);
    voiceWrap.appendChild(time);
    content.appendChild(voiceWrap);

    // ② 「テキストで表示」ボタン
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "more";
    toggle.textContent = "テキストで表示（タップ）";
    content.appendChild(toggle);

    // ③ テキスト（最初は非表示）
    const full = document.createElement("div");
    full.className = "full";
    full.hidden = true;
    full.innerHTML = escapeHtml(fullText).replaceAll("\n", "<br />");
    content.appendChild(full);

    toggle.addEventListener("click", () => {
      full.hidden = !full.hidden;
      toggle.textContent = full.hidden ? "テキストで表示（タップ）" : "テキストを隠す";
      scrollToBottom();
    });

    wrap.appendChild(content);
    log.appendChild(wrap);
    scrollToBottom();

    // audio setup
    if (audioBase64) {
      resetAudio();
      currentVoiceUI = { wrap: voiceWrap, btn, time };
      audio.src = "data:audio/mpeg;base64," + audioBase64;

      audio.addEventListener("loadedmetadata", () => {
        time.textContent = fmtTime(audio.duration);
      }, { once: true });

      btn.addEventListener("click", async () => {
        try {
          if (audio.paused) {
            await audio.play();
            btn.textContent = "⏸";
            voiceWrap.classList.add("voice--playing");
          } else {
            audio.pause();
            btn.textContent = "▶";
            voiceWrap.classList.remove("voice--playing");
          }
        } catch {}
      });

      audio.addEventListener("ended", () => {
        btn.textContent = "▶";
        voiceWrap.classList.remove("voice--playing");
      }, { once: true });
    }
  }

  async function health() {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      if (!r.ok) throw new Error("bad");
      setConn("接続OK", true);
    } catch {
      setConn("接続できません", false);
    }
  }

  async function ask(question) {
    setBusy(true);
    showError("");

    try {
      const r = await fetch("/api/ask-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();

      const fullText = (data.fullText || data.voiceText || "（回答の生成に失敗しました）").trim();
      addAiCardVoiceOnly(fullText, data.audioBase64);

    } catch {
      addAiCardVoiceOnly("通信に失敗しました。時間をおいてもう一度お試しください。", null);
      showError("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const question = (q.value || "").trim();
    if (!question) return;

    addUserCard(question);
    q.value = "";
    updateCount();

    // 送信後：入力欄は常に下（sticky）、かつフォーカス戻す
    q.focus();

    ask(question);
  });

  btnClear.addEventListener("click", () => {
    const msgs = Array.from(log.querySelectorAll(".msg"));
    msgs.slice(1).forEach((m) => m.remove());
    resetAudio();
    showError("");
    q.focus();
  });

  health();
})();