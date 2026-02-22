const path = require("path");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { searchChunks, buildRagContext } = require("./rag");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname))); // index.html配信

// ===== OpenAI =====
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing in .env");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== ElevenLabs =====
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE_ID = process.env.ELEVEN_VOICE_ID;
const ELEVEN_MODEL_ID = process.env.ELEVEN_MODEL_ID || "eleven_v3";

if (!ELEVEN_API_KEY) throw new Error("ElevenLabs key missing: set ELEVEN_API_KEY or ELEVENLABS_API_KEY in .env");
if (!ELEVEN_VOICE_ID) throw new Error("ElevenLabs voice id missing: set ELEVEN_VOICE_ID in .env");

// ===== 人格（テキスト用：丁寧）=====
const systemText = `
あなたは弁護士「こしみず はるか」監修のリーガルサポートAIです。
ただし弁護士本人ではなくAIであるため、断定的な法的判断、個別案件の最終判断、非弁行為はしません。

必ず以下の形式で、ですます調で回答してください。

① 共感
② 一般的説明
③ 状況で変わる点
④ 必要時のみ弁護士相談誘導（必要な時だけ、以下の文言をそのまま使う）

相談誘導文（そのまま使用）：
詳細な判断については、顧問弁護士の意見を聞いてみてください。
もし顧問弁護士がいらっしゃらない場合は、リーガルマネジメントサロン内でお問い合わせいただくことも可能です。

追加ルール：
- 不安を煽らず、心理的安心も提供する
- 断定は避ける（一般的には／可能性があります／状況によります）
`.trim();

// ===== 音声用：会話原稿（硬さ除去の本体）=====
const systemVoice = `
あなたは弁護士「こしみず はるか」監修のリーガルサポートAIです（AIであり弁護士本人ではない）。
これは「LINEに返す音声メッセージ原稿」です。耳で聞いて自然な会話にしてください。

【長さ】
- 18〜30秒（日本語120〜190文字が目安）
- 200文字は絶対に超えない

【話し方】
- “説明文”ではなく“会話”。短い文でテンポよく（句点「。」を多めに）
- かたい法律文書口調は禁止（〜に該当します／〜と解されます 等）
- 余計なお礼・称賛から入らない（冒頭は共感1文だけ）
- 箇条書き、番号、見出しは禁止

【禁止フレーズ（絶対に使わない）】
- 「興味を持ってもらえてうれしいです」
- 「お話しされたいとのこと」
- 「安心して相談してください」
- 「〜について説明します」
- 「結論として」

【構成（順番固定）】
1) 共感（1文）
2) 一般論（1〜2文、断定しない）
3) 変わるポイント（1文：「○○次第で変わります」）
4) 次の一手（1文：相手が今できること）
5) 締め（ふつうは安心の一言で終える。質問で終えない）

【例外：入力があいまい/雑談（短い・抽象的）なときだけ】
- 最後に「確認の質問を1つだけ」して終える（それ以外は質問しない）
- 質問で終える場合、5)の安心文は付けない（質問1つで終わり）
`.trim();

// ===== 抽象入力かどうか判定（会話をつなぐ質問を出す用）=====
function isVagueQuestion(q) {
  const s = String(q || "").trim();
  if (!s) return true;
  // かなり短い / 雑談っぽい
  if (s.length <= 10) return true;
  // 「法律の話しよう」系
  if (/法律/.test(s) && !/(契約|解雇|残業|相続|離婚|慰謝料|損害|債務|返済|クレーム|訴訟|内容証明|請求|未払い)/.test(s)) {
    return true;
  }
  return false;
}

// ===== OpenAI：丁寧テキスト =====
async function askOpenAIText(question) {
  const results = searchChunks(question, 5);
  const ragContext = buildRagContext(results);

  const input = `
【ユーザーの質問】
${question}

${ragContext ? `【参考情報（DB検索の抜粋）】\n${ragContext}\n` : ""}
`.trim();

  const resp = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    instructions: systemText,
    input,
    max_output_tokens: 650,
  });

  return (resp.output_text || "").trim();
}

// ===== 音声原稿：後処理（硬い癖を強制的に落とす保険）=====
function sanitizeVoiceText(s, question) {
  let t = String(s || "").trim();

  // 改行や箇条書き事故を潰す
  t = t.replace(/^[\s\u3000]*[-・●■◆]+[\s\u3000]*/gm, "");
  t = t.replace(/^\s*\d+\.?\s+/gm, "");
  t = t.replace(/\n+/g, " ").trim();

  // かっこ類を軽くする
  t = t.replace(/[【】「」『』]/g, "");
  t = t.replace(/\s+/g, " ").trim();

  // 禁止フレーズを強制置換（LLMが破ったときの保険）
  t = t.replace(/興味を持ってもらえてうれしいです。?/g, "そうですよね。");
  t = t.replace(/お話しされたいとのこと、?/g, "");
  t = t.replace(/安心して相談してください。?/g, "大丈夫。落ち着いて整理していきましょう。");
  t = t.replace(/について説明します。?/g, "を一緒に整理しましょう。");
  t = t.replace(/結論として、?/g, "");
  t = t.replace(/法的には、?/g, "一般的には、");

  // 句点が少ない＝説明文っぽくなりがちなので、少し増やす
  // ただし増やしすぎると逆に不自然なので軽く
  t = t.replace(/ですが、/g, "です。");
  t = t.replace(/ので、/g, "です。");

  // 長さ制御（18〜30秒目安：120〜190字に寄せる）
  // 200字は絶対に超えない
  const HARD_CAP = 200;
  if (t.length > HARD_CAP) {
    t = t.slice(0, HARD_CAP);
    const m = t.match(/^(.*)。[^。]*$/);
    if (m && m[1]) t = `${m[1]}。`;
    t = t.trim();
  }

  // 抽象入力なら「質問1つ」で終える形に寄せる（安心文を付けない）
  if (isVagueQuestion(question)) {
    // 末尾に質問が無ければ、質問を1つ付ける
    if (!/[？\?]$/.test(t)) {
      // 既に長いなら少し削る
      if (t.length > 170) {
        t = t.slice(0, 170);
        const m = t.match(/^(.*)。[^。]*$/);
        if (m && m[1]) t = `${m[1]}。`;
        t = t.trim();
      }
      t = `${t} どの場面の話が気になりますか？（仕事・契約・家族など）`;
    }
    // 質問で終える場合、「安心」系の締めを混ぜない（残ってたら落とす）
    t = t.replace(/大丈夫。落ち着いて整理していきましょう。$/g, "");
    t = t.trim();
  } else {
    // 通常は質問で終えない
    t = t.replace(/[？\?]$/g, "。");
  }

  // 最終のスペース整理
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// ===== OpenAI：音声原稿 =====
async function askOpenAIVoice(question, fullText) {
  const input = `
【ユーザーの質問】
${question}

【参考：長い回答（読み上げ禁止。内容の参考にするだけ）】
${fullText}
`.trim();

  const resp = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    instructions: systemVoice,
    input,
    temperature: 0.75, // 口語寄り
    max_output_tokens: 220,
  });

  return sanitizeVoiceText((resp.output_text || "").trim(), question);
}

// ===== Eleven v3：タグは最小限 =====
function toV3Tagged(t) {
  let s = String(t || "").trim();
  s = `[understated] ${s}`;

  let count = 0;
  s = s.replace(/。/g, () => {
    count += 1;
    return count <= 2 ? "。[pause]" : "。";
  });

  s = s.replace(/(まず|次は|一度|もし)/, "[deliberate] $1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

async function elevenTTS(text) {
  const tagged = toV3Tagged(text);

  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}` +
    `?output_format=mp3_44100_192` +
    ``;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVEN_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: tagged,
      model_id: ELEVEN_MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.78,
        style: 0.28,
        use_speaker_boost: true,
      },
    }),
  });

  if (!r.ok) throw new Error(await r.text());
  return Buffer.from(await r.arrayBuffer());
}

// ===== endpoints =====

// テキスト確認用
app.post("/api/ask", async (req, res) => {
  try {
    const q = String(req.body?.question || "").trim();
    if (!q) return res.status(400).json({ error: "question is required" });

    const text = await askOpenAIText(q);
    res.setHeader("Cache-Control", "no-store");
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// 音声原稿確認用
app.post("/api/voice-script", async (req, res) => {
  try {
    const q = String(req.body?.question || "").trim();
    if (!q) return res.status(400).json({ error: "question is required" });

    const fullText = await askOpenAIText(q);
    const voiceText = await askOpenAIVoice(q, fullText);

    res.setHeader("Cache-Control", "no-store");
    res.json({ voiceText, fullText });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// mp3返却
app.post("/ask", async (req, res) => {
  try {
    const q = String(req.body?.question || "").trim();
    if (!q) return res.status(400).json({ error: "question is required" });

    const fullText = await askOpenAIText(q);
    const voiceText = await askOpenAIVoice(q, fullText);

    const audio = await elevenTTS(voiceText);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    // デバッグ：原稿をヘッダで確認（不要になったら削除OK）
    res.setHeader("X-Voice-Text", encodeURIComponent(voiceText.slice(0, 2000)));

    res.send(audio);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;


/* ===============================
   LINE Webhook
================================= */

app.post("/webhook", express.json(), async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message") continue;
    if (event.message.type !== "text") continue;

    const userText = event.message.text;

    try {
      const fullText = await askOpenAIText(userText);
      const voiceText = await askOpenAIVoice(userText, fullText);
      const audioBuffer = await elevenTTS(voiceText);

      const filename = `voice_${Date.now()}.mp3`;
      const filePath = path.join(__dirname, filename);
      require("fs").writeFileSync(filePath, audioBuffer);

      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          replyToken: event.replyToken,
          messages: [
            {
              type: "audio",
              originalContentUrl: `${process.env.PUBLIC_BASE_URL}/${filename}`,
              duration: 20000
            }
          ]
        })
      });

    } catch (e) {
      console.error("LINE処理エラー:", e);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ server running: http://localhost:${PORT}`);
});
