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
  const btnPlay = $("btnPlay");
  const audioTime = $("audioTime");

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

  function resetAudioUI() {
    audio.pause();
    audio.removeAttribute("src");
    btnPlay.disabled = true;
    btnPlay.textContent = "▶ 再生";
    audioTime.textContent = "--:--";
  }

  function setBusy(on) {
    form.querySelectorAll("button, textarea, input").forEach((el) => (el.disabled = on));
    spinner.hidden = !on;
  }

  function addCard(role, name, htmlText, fullHtmlText) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role}`;

    const roleEl = document.createElement("div");
    roleEl.className = "msg__role";
    roleEl.textContent = name || (role === "ai" ? "越水はるか" : "相談者");
    wrap.appendChild(roleEl);

    const body = document.createElement("div");
    body.className = "msg__body";
    body.innerHTML = htmlText;
    wrap.appendChild(body);

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
    resetAudioUI();

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

      addCard("ai", "越水はるか", voiceHtml, fullHtml);

      if (data.audioBase64) {
        audio.src = "data:audio/mpeg;base64," + data.audioBase64;
        btnPlay.disabled = false;
      }

      setBusy(false);
    } catch {
      addCard("ai", "越水はるか", "通信に失敗しました。時間をおいてもう一度お試しください。");
      showError("通信に失敗しました。");
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
    resetAudioUI();
    showError("");
  });

  btnPlay.addEventListener("click", async () => {
    if (!audio.src) return;
    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {}
  });

  audio.addEventListener("play", () => {
    btnPlay.textContent = "⏸ 停止";
  });
  audio.addEventListener("pause", () => {
    btnPlay.textContent = "▶ 再生";
  });
  audio.addEventListener("loadedmetadata", () => {
    audioTime.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    // “バー”は出さないが、完了感のために残り秒だけ更新
    if (isFinite(audio.duration) && audio.duration > 0) {
      audioTime.textContent = fmtTime(audio.duration);
    }
  });

  health();
})();