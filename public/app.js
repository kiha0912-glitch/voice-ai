(() => {
  const $ = (id) => document.getElementById(id);

  const connPill = $("connPill");
  const log = $("log");
  const form = $("form");
  const q = $("q");
  const count = $("count");
  const err = $("err");
  const btnClear = $("btnClear");
  const btnSend = $("btnSend");
  const suggestions = $("suggestions");
  const audio = $("audio");

  // Profile collapse (mobile)
  const profileToggle = $("profileToggle");
  const profileBody = $("profileBody");
  const toggleBtn = profileToggle?.querySelector(".profile__toggle");

  function initProfile() {
    // Desktop: always open. Mobile: collapsed by default.
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      profileBody.classList.add("open");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
    }
  }

  profileToggle?.addEventListener("click", () => {
    const isOpen = profileBody.classList.toggle("open");
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", String(isOpen));
  });

  // Listen for resize to auto-open on desktop
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth >= 768) {
        profileBody.classList.add("open");
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
      }
    }, 150);
  });

  initProfile();

  // ===== Auto-resize textarea =====
  function autoResize() {
    q.style.height = "auto";
    q.style.height = Math.min(q.scrollHeight, 120) + "px";
  }

  function updateCount() {
    const n = (q.value || "").length;
    count.textContent = `${n} / 2000`;
  }

  q.addEventListener("input", () => {
    updateCount();
    autoResize();
  });
  updateCount();

  // Enter to submit (Shift+Enter for newline)
  q.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  // ===== Connection pill =====
  function setConn(text, ok) {
    const dot = connPill.querySelector(".pill__dot");
    connPill.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) n.textContent = "";
    });
    // Set text after dot
    const span = connPill.querySelector("span:last-of-type") || connPill;
    if (span === connPill) {
      connPill.append(" " + text);
    } else {
      // Rebuild text content
      while (connPill.lastChild && connPill.lastChild.nodeType === Node.TEXT_NODE) {
        connPill.removeChild(connPill.lastChild);
      }
      connPill.append(" " + text);
    }
    connPill.classList.toggle("pill--ok", !!ok);
  }

  function showError(msg) {
    if (!msg) { err.hidden = true; err.textContent = ""; return; }
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
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }

  let currentVoiceUI = null;

  function resetAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (currentVoiceUI) {
      currentVoiceUI.btn.innerHTML = playIcon;
      currentVoiceUI.wrap.classList.remove("voice--playing");
      if (currentVoiceUI.progressFill) currentVoiceUI.progressFill.style.width = "0%";
    }
  }

  function setBusy(on) {
    btnSend.disabled = on;
    q.disabled = on;

    // Show/remove thinking bubble
    if (on) {
      addThinkingBubble();
    } else {
      removeThinkingBubble();
    }
  }

  // ===== Icons (SVG) =====
  const playIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>`;

  // ===== Thinking bubble =====
  function addThinkingBubble() {
    removeThinkingBubble();
    const wrap = document.createElement("div");
    wrap.className = "msg msg--ai msg--thinking";
    wrap.id = "thinkingMsg";

    const av = document.createElement("div");
    av.className = "msg__avatar";
    const img = document.createElement("img");
    img.src = "/haruka-icon.png";
    img.alt = "越水はるか";
    av.appendChild(img);
    wrap.appendChild(av);

    const content = document.createElement("div");
    content.className = "msg__content";

    const body = document.createElement("div");
    body.className = "msg__body";
    const dots = document.createElement("div");
    dots.className = "thinking-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(dots);
    content.appendChild(body);

    wrap.appendChild(content);
    log.appendChild(wrap);
    scrollToBottom();
  }

  function removeThinkingBubble() {
    const el = $("thinkingMsg");
    if (el) el.remove();
  }

  // ===== Suggested questions =====
  if (suggestions) {
    suggestions.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".suggestion-chip");
      if (!chip) return;
      const question = chip.dataset.q;
      if (!question) return;

      // Hide suggestions
      suggestions.remove();

      q.value = question;
      updateCount();
      autoResize();
      form.requestSubmit();
    });
  }

  // ===== Cards =====
  function addUserCard(text) {
    // Hide suggestions on first question
    if (suggestions && suggestions.parentNode) suggestions.remove();

    const wrap = document.createElement("div");
    wrap.className = "msg msg--user";

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

  // AI card: voice bubble + expandable text
  function addAiCardVoiceOnly(fullText, audioBase64) {
    const wrap = document.createElement("div");
    wrap.className = "msg msg--ai";

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

    // ① Voice bubble (redesigned with progress bar)
    if (audioBase64) {
      const voiceWrap = document.createElement("div");
      voiceWrap.className = "voice";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "voice__btn";
      btn.innerHTML = playIcon;

      const track = document.createElement("div");
      track.className = "voice__track";

      // Waveform bars
      const bars = document.createElement("div");
      bars.className = "voice__bars";
      for (let i = 0; i < 24; i++) {
        const b = document.createElement("span");
        b.className = "voice__bar";
        b.style.height = `${4 + Math.random() * 14}px`;
        bars.appendChild(b);
      }

      // Progress bar
      const progress = document.createElement("div");
      progress.className = "voice__progress";
      const progressFill = document.createElement("div");
      progressFill.className = "voice__progress-fill";
      progress.appendChild(progressFill);

      // Time display
      const meta = document.createElement("div");
      meta.className = "voice__meta";
      const timeCurrent = document.createElement("span");
      timeCurrent.textContent = "0:00";
      const timeDuration = document.createElement("span");
      timeDuration.textContent = "--:--";
      meta.appendChild(timeCurrent);
      meta.appendChild(timeDuration);

      track.appendChild(bars);
      track.appendChild(progress);
      track.appendChild(meta);

      voiceWrap.appendChild(btn);
      voiceWrap.appendChild(track);
      content.appendChild(voiceWrap);

      // Audio setup
      resetAudio();
      currentVoiceUI = { wrap: voiceWrap, btn, progressFill, timeCurrent, timeDuration };
      audio.src = "data:audio/mpeg;base64," + audioBase64;

      audio.addEventListener("loadedmetadata", () => {
        timeDuration.textContent = fmtTime(audio.duration);
      }, { once: true });

      // Progress update
      audio.addEventListener("timeupdate", () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = pct + "%";
        timeCurrent.textContent = fmtTime(audio.currentTime);
      });

      // Click progress bar to seek
      progress.addEventListener("click", (ev) => {
        if (!audio.duration) return;
        const rect = progress.getBoundingClientRect();
        const ratio = (ev.clientX - rect.left) / rect.width;
        audio.currentTime = ratio * audio.duration;
      });

      btn.addEventListener("click", async () => {
        try {
          if (audio.paused) {
            await audio.play();
            btn.innerHTML = pauseIcon;
            voiceWrap.classList.add("voice--playing");
          } else {
            audio.pause();
            btn.innerHTML = playIcon;
            voiceWrap.classList.remove("voice--playing");
          }
        } catch {}
      });

      audio.addEventListener("ended", () => {
        btn.innerHTML = playIcon;
        voiceWrap.classList.remove("voice--playing");
        progressFill.style.width = "100%";
      }, { once: true });
    }

    // ② Toggle button for text
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "more";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `テキストで表示 <span class="more__icon">▼</span>`;
    content.appendChild(toggle);

    // ③ Full text (hidden initially)
    const full = document.createElement("div");
    full.className = "full";
    full.hidden = true;
    full.innerHTML = escapeHtml(fullText).replaceAll("\n", "<br />");
    content.appendChild(full);

    toggle.addEventListener("click", () => {
      full.hidden = !full.hidden;
      toggle.setAttribute("aria-expanded", String(!full.hidden));
      toggle.innerHTML = full.hidden
        ? `テキストで表示 <span class="more__icon">▼</span>`
        : `テキストを隠す <span class="more__icon">▼</span>`;
      scrollToBottom();
    });

    wrap.appendChild(content);
    log.appendChild(wrap);
    scrollToBottom();
  }

  // ===== Health check =====
  async function health() {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      if (!r.ok) throw new Error("bad");
      setConn("接続OK", true);
    } catch {
      setConn("接続できません", false);
    }
  }

  // ===== Ask =====
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

  // ===== Form submit =====
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const question = (q.value || "").trim();
    if (!question) return;

    addUserCard(question);
    q.value = "";
    updateCount();
    q.style.height = "auto";

    q.focus();
    ask(question);
  });

  // ===== Clear =====
  btnClear.addEventListener("click", () => {
    const msgs = Array.from(log.querySelectorAll(".msg"));
    // Keep the first welcome message
    msgs.slice(1).forEach((m) => m.remove());
    resetAudio();
    showError("");
    q.focus();
  });

  // ===== Init =====
  health();
})();
