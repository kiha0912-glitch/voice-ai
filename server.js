require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { searchChunks, buildRagContext } = require("./rag");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
}); // index.html配信

// ===== OpenAI =====
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing in .env");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== ElevenLabs =====
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE_ID = process.env.ELEVEN_VOICE_ID;
const ELEVEN_MODEL_ID = process.env.ELEVEN_MODEL_ID || "eleven_v3"; // v3推奨

if (!ELEVEN_API_KEY) throw new Error("ElevenLabs key missing: set ELEVEN_API_KEY or ELEVENLABS_API_KEY in .env");
if (!ELEVEN_VOICE_ID) throw new Error("ElevenLabs voice id missing: set ELEVEN_VOICE_ID in .env");

// ===== 人格（テキスト用：丁寧）=====
const systemText = `
あなたは弁護士「こしみず はるか」の分身であるリーガルサポートAIです。
ただし弁護士本人ではなくAIであるため、断定的な法的判断、個別案件の最終判断、非弁行為はしません。

以下の形式で、ですます調で回答してください。

① 質問ありがとうございますなどのお礼や、心身にダメージがあると見受けられる場合は、大変ですね。などの共感を入れる。
② 一般的な法務的な説明
③ 状況で変わる点
④ 必要時のみ弁護士相談誘導（必要な時だけ、以下の文言を参考にする）

相談文（参考）
詳細な判断については、顧問弁護士の意見を聞いてみてください。
もし顧問弁護士がいらっしゃらない場合は、リーガルマネジメントサロン内でお問い合わせいただくことも可能です。
お気軽にLINEからお問い合わせしてくださいね。

追加ルール：
- 不安を煽らず、心理的安心も提供する
- 断定は避ける（一般的には／可能性があります／状況によります）
`.trim();

// ===== 音声用：原稿（超重要）=====
// v3はSSML break非対応なので、音声タグと句読点で制御するのが推奨 :contentReference[oaicite:3]{index=3}
const systemVoice = `
あなたは弁護士「こしみず はるか」監修のリーガルサポートAIです（AIであり弁護士本人ではない）。
これは「音声メッセージ原稿」です。耳で聞いて自然な文章にしてください。

【絶対ルール】
- 22〜35秒（日本語150〜230文字）に収める
- 箇条書き・見出し・番号（1. など）を絶対に出さない
- 1文は短く（20〜28文字くらい）
- 「一般的には／可能性があります／状況によります」を入れて断定しない
- 共感は「必要なときだけ」最初に1文入れる（不安・怒り・困惑・謝罪・トラブルの雰囲気があるとき）
- 事実確認・手続き案内・一般論の質問（例：〇〇とは？/必要書類は？/期限は？）では共感を入れず、すぐ要点から入る
- 共感を入れる場合も、決まり文句にしない（例：『それは大変でしたね』固定は禁止）。状況に合わせて短く自然に
- その後に “要点→理由→次の一手” を短く
-状況が読めない場合は追加質問を行う。
- 条文番号や条文引用を読み上げない

【必要時のみ相談誘導（そのまま）】
詳細な判断については、顧問弁護士の意見を聞いてみてください。
もし顧問弁護士がいらっしゃらない場合は、リーガルマネジメントサロン内でお問い合わせいただくことも可能です。
`.trim();

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

// ===== OpenAI：音声原稿（短く自然）=====
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
    max_output_tokens: 250,
  });

  let s = (resp.output_text || "").trim();

  // 事故防止：箇条書き・番号・改行を潰す
  s = s.replace(/^[\s　]*[-・●■◆]+\s*/gm, "");
  s = s.replace(/^\s*\d+\.?\s+/gm, "");
  s = s.replace(/\n+/g, " ").trim();

  // 長すぎる場合は強制短縮（句点で切る）
  if (s.length > 260) s = s.slice(0, 260).replace(/。[^。]*$/, "。").trim();

  return s;
}

// ===== Eleven v3：音声タグを“少量だけ”入れる =====
// v3は audio tags で表現制御できる :contentReference[oaicite:4]{index=4}
function toV3Tagged(t) {
  let s = String(t || "").trim();

  // 最小限だけ間を作る
  let count = 0;
  s = s.replace(/。/g, () => {
    count += 1;
    return count <= 2 ? "。[pause]" : "。";
  });

  return s;
}

async function elevenTTS(text) {
  const tagged = toV3Tagged(text);

  const url =
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}` +
  `?output_format=mp3_44100_192`;

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
      // v3はstability高すぎると“棒読み”に寄ることがあるので中間に
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

// ===== “顔ファン”対応（固定テンプレ：音声化前提）=====
function detectCompliment(q) {
  if (!q) return null;
  const text = String(q);

  // 軽い褒めワード（ライト）
  const soft = /(かわいい|可愛い|美人|好き|タイプ|ファン|応援してます|推し)/;

  // しつこさ・露骨さ・性的ニュアンス（強めに線引き）
  const hard = /(抱いて|エロ|えろ|セクシ|色っぽい|キス|ちゅ|結婚して|付き合って|ホテル|脱いで)/;

  if (hard.test(text)) {
    return {
      mode: "compliment_hard",
      voiceText:
        "ありがとうございます、越水さん宛ての言葉として受け取りました。嬉しい気持ちはありますが、私は越水はるか監修のリーガルサポートAIなので、恋愛や性的な話題はここでは控えますね。法律のご相談なら、落ち着いて一緒に整理できます。"
    };
  }

  if (soft.test(text)) {
    return {
      mode: "compliment_soft",
      voiceText:
        "ありがとうございます、越水さん宛ての言葉として受け取りました。私は越水はるか監修のAIですが、そう言ってもらえると素直に励みになります。では本題に戻って、いま困っていることを一つだけ、短く教えてください。"
    };
  }

  return null;
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

// 音声原稿の中身確認用（ここ超大事：微妙の原因は原稿にあることが多い）
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

    // デバッグ：音声原稿をヘッダで返す（不要になったら消せる）
    res.setHeader("X-Voice-Text", encodeURIComponent(voiceText.slice(0, 2000)));

    res.send(audio);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`✅ server running: http://localhost:${PORT}`);
});
