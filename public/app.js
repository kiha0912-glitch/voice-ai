(() => {
  const $ = (id) => document.getElementById(id);

  const connPill = $("connPill");
  const log = $("log");
  const form = $("form");
  const q = $("q");
  const count = $("count");
  const err = $("err");
  const btnClear = $("btnClear");
  const audio = $("audio");

  document.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => {
      q.value = b.getAttribute("data-preset") || "";
      q.focus();
      updateCount();
    });
  });

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

  function addMsg(role, name, htmlText) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (name) {
      const nm = document.createElement("div");
      nm.className = "bubble__name";
      nm.textContent = name;
      bubble.appendChild(nm);
    }

    const tx = document.createElement("div");
    tx.className = "bubble__text";
    tx.innerHTML = htmlText;
    bubble.appendChild(tx);

    wrap.appendChild(bubble);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function setBusy(on) {
    form.querySelectorAll("button, textarea, input").forEach((el) => (el.disabled = on));
    form.dataset.busy = on ? "1" : "0";
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
    audio.pause();
    audio.removeAttribute("src");

    try {
      const r = await fetch("/api/ask-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!r.ok) throw new Error("bad");
      const data = await r.json();

      const voice = data.voiceText || "（回答の生成に失敗しました）";
      addMsg("ai", "越水はるか", escapeHtml(voice).replaceAll("\n", "<br />"));

      if (data.audioBase64) {
        audio.src = "data:audio/mpeg;base64," + data.audioBase64;
      }
      setBusy(false);
    } catch {
      addMsg("ai", "越水はるか", "通信に失敗しました。時間をおいてもう一度お試しください。");
      showError("通信に失敗しました。");
      setBusy(false);
    }
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const question = (q.value || "").trim();
    if (!question) return;
    addMsg("user", "相談者", escapeHtml(question).replaceAll("\n", "<br />"));
    q.value = "";
    updateCount();
    ask(question);
  });

  btnClear.addEventListener("click", () => {
    const msgs = Array.from(log.querySelectorAll(".msg"));
    msgs.slice(1).forEach((m) => m.remove());
    audio.pause();
    audio.removeAttribute("src");
    showError("");
  });

  health();
})();