python - <<'PY'
from pathlib import Path
Path("public/app.js").write_text(r'''(function(){
  const $ = (id) => document.getElementById(id);

  const chat = $("chat");
  const form = $("form");
  const q = $("q");
  const status = $("status");
  const btnSend = $("btnSend");
  const btnExample = $("btnExample");
  const btnClear = $("btnClear");

  const audioArea = $("audioArea");
  const audio = $("audio");
  const voiceNote = $("voiceNote");

  const details = $("details");
  const voiceText = $("voiceText");
  const fullText = $("fullText");

  const examples = [
    "退職後に会社から損害賠償を請求されそうで不安です。どう整理すればいいですか？",
    "内容証明が届きました。まず何を確認すべきですか？",
    "知人にお金を貸したのに返してくれません。一般的にどんな手順がありますか？"
  ];

  function addMsg(role, text){
    const wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "ai");

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    wrap.appendChild(bubble);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  }

  function setBusy(on, msg){
    btnSend.disabled = on;
    btnExample.disabled = on;
    q.disabled = on;
    status.textContent = msg || "";
  }

  function safeErrorMessage(){
    // 内部エラー詳細は外に出さない方針に合わせる
    return "通信に失敗しました。時間をおいてもう一度お試しください。";
  }

  async function ask(question){
    setBusy(true, "整理しています…");
    audioArea.hidden = true;
    details.hidden = true;
    audio.pause();
    audio.removeAttribute("src");

    try{
      const r = await fetch("/api/ask-audio", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ question })
      });

      if(!r.ok){
        throw new Error("bad_status");
      }

      const data = await r.json();

      // テキスト表示（確認用：折りたたみ）
      voiceText.textContent = data.voiceText || "";
      fullText.textContent = data.fullText || "";
      details.hidden = false;

      // AIメッセージ（短い音声原稿を表示）
      addMsg("ai", data.voiceText || "（回答の生成に失敗しました）");

      // 音声セット
      if(data.audioBase64){
        const src = "data:audio/mpeg;base64," + data.audioBase64;
        audio.src = src;
        audioArea.hidden = false;
        voiceNote.textContent = "※音声は自動再生しません（操作ミス防止のため）";
      } else {
        audioArea.hidden = true;
      }

      setBusy(false, "");
    }catch(e){
      addMsg("ai", safeErrorMessage());
      setBusy(false, "");
    }
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const question = (q.value || "").trim();
    if(!question) return;
    addMsg("user", question);
    q.value = "";
    ask(question);
  });

  btnExample.addEventListener("click", () => {
    const x = examples[Math.floor(Math.random() * examples.length)];
    q.value = x;
    q.focus();
  });

  btnClear.addEventListener("click", () => {
    // 最初の挨拶だけ残す
    const nodes = Array.from(chat.querySelectorAll(".msg"));
    for(let i=1;i<nodes.length;i++) nodes[i].remove();
    audio.pause();
    audio.removeAttribute("src");
    audioArea.hidden = true;
    details.hidden = true;
    status.textContent = "";
  });
})();''', encoding="utf-8")
print("✅ wrote public/app.js")
PY
