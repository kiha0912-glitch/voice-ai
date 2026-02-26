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

  function resetAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (currentVoiceUI) {
      currentVoiceUI.btn.textContent = "▶";
      currentVoiceUI.wrap.classList.remove("voice--playing");
      currentVoiceUI.time.textContent = "--:--";
    }
  }

  function setBusy(on) {
    form.querySelectorAll("button, textarea, input").forEach((el) => (el.disabled = on));
    spinner.hidden = !on;
  }

  function addCard(role, name, htmlText, fullHtmlText) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role}`;

    // avatar (AIのみ)
    if (role === "ai") {
      const av = document.createElement("div");
      av.className = "msg__avatar";
      const img = document.createElement("img");
      img.src = "/haruka-icon.png";
      img.alt = "越水はるか";
      av.appendChild(img);
      wrap.appendChild(av);
    }

    const content = document.createElement("div");
    content.className = "msg__content";

    const roleEl = document.createElement("div");
    roleEl.className = "msg__role";
    roleEl.textContent = name || (role === "ai" ? "越水はるか" : "相談者");
    content.appendChild(roleEl);

    const body = document.createElement("div");
    body.className = "msg__body";
    body.innerHTML = htmlText;
    content.appendChild(body);

    wrap.appendChild(content);

    if (role === "ai" && fullHtmlText && fullHtmlText !== htmlText) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "more";
      more.textContent = "全文を表示（タップ）";

      const full = document.createElement("div");
      full.className = "full";
      full.hidden = true;
      full.innerHTML = fullHtmlText;

      more.addEventListener("click", () => {
        full.hidden = !full.hidden;
        more.textContent = full.hidden ? "全文を表示（タップ）" : "全文を隠す";
      });

      wrap.appendChild(more);
      wrap.appendChild(full);
    }

    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  // LINEっぽい音声バブルを追加（AI発話に紐づけ）
  function addVoiceBubble(afterEl) {
    const wrap = document.createElement("div");
    wrap.className = "voice";

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

    wrap.appendChild(btn);
    wrap.appendChild(bars);
    wrap.appendChild(time);

    afterEl.appendChild(wrap);

    currentVoiceUI = { wrap, btn, time };
    return currentVoiceUI;
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
    resetAudio();

    try {
      const r = await fetch("/api/ask-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();

      const voice = data.voiceText || "（回答の生成に失敗しました）";
      const full = data.fullText || voice;

      const voiceHtml = escapeHtml(voice).replaceAll("\n", "<br />");
      const fullHtml = escapeHtml(full).replaceAll("\n", "<br />");

      const aiCard = addCard("ai", "越水はるか", voiceHtml, fullHtml);

      if (data.audioBase64) {
        // バブルを表示
        const ui = addVoiceBubble(aiCard);

        audio.src = "data:audio/mpeg;base64," + data.audioBase64;

        audio.addEventListener("loadedmetadata", () => {
          ui.time.textContent = fmtTime(audio.duration);
        }, { once: true });

        ui.btn.addEventListener("click", async () => {
          try {
            if (audio.paused) {
              await audio.play();
              ui.btn.textContent = "⏸";
              ui.wrap.classList.add("voice--playing");
            } else {
              audio.pause();
              ui.btn.textContent = "▶";
              ui.wrap.classList.remove("voice--playing");
            }
          } catch {}
        });

        audio.addEventListener("ended", () => {
          ui.btn.textContent = "▶";
          ui.wrap.classList.remove("voice--playing");
        }, { once: true });
      }

    } catch {
      addCard("ai", "越水はるか", "通信に失敗しました。時間をおいてもう一度お試しください。");
      showError("通信に失敗しました。");
    } finally {
      // ← これで「ぐるぐる残る」事故を確実に止める
      setBusy(false);
    }
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const question = (q.value || "").trim();
    if (!question) return;

    addCard("user", "相談者", escapeHtml(question).replaceAll("\n", "<br />"));
    q.value = "";
    updateCount();
    ask(question);
  });

  btnClear.addEventListener("click", () => {
    const msgs = Array.from(log.querySelectorAll(".msg"));
    msgs.slice(1).forEach((m) => m.remove());
    resetAudio();
    showError("");
  });

  health();
})();