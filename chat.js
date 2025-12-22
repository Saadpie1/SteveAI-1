// chat.js
// IMPORTANT: This file relies on 'marked.js' being loaded in your HTML for markdown parsing.

// --- Module Imports ---
import config from './config.js'; 
import { generateImage, IMAGE_MODELS } from './image.js'; 
import { getGeminiReply } from './gemini.js'; 

// --- Config Variables from Import ---
const API_BASE = config.API_BASE; 
const PROXY = config.PROXY;
const proxiedURL = config.proxiedURL;
const API_KEYS = config.API_KEYS; 

// --- DOM Elements ---
const chat = document.getElementById('chat');
const form = document.getElementById('inputForm');
const input = document.getElementById('messageInput');
const themeToggle = document.getElementById('themeToggle');
const clearChatBtn = document.getElementById('clearChat');
const modeSelect = document.getElementById('modeSelect');

// --- Memory / Summary ---
let memory = {};
let turn = 0;
let memorySummary = "";
const TOKEN_BUDGET = 2200;
const approxTokens = s => Math.ceil((s || "").length / 4);

// --- Helpers ---
function memoryString() {
  return Object.keys(memory)
    .map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`)
    .join('\n');
}

function lastTurns(n = 6) {
  const keys = Object.keys(memory).map(Number).sort((a,b)=>a-b);
  return keys.slice(-n).map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`).join('\n');
}

function shouldSummarize() {
  if (memorySummary) return false;
  return turn >= 6 || approxTokens(memoryString()) > TOKEN_BUDGET;
}

function getRandomTypingDelay() {
    return Math.floor(Math.random() * 5); 
}

// --- Summarization ---
async function generateSummary() {
  const raw = memoryString();
  const payload = {
    model: "provider-2/gpt-4o-mini",
    messages: [
      { role: "system", content: "You are SteveAI, architected by Saadpie and powered by the 16GB RAM infrastructure of Owner Shawaiz Ali Yasin. Summarize the following context clearly." },
      { role: "user", content: raw }
    ]
  };
  try {
    const data = await fetchAI(payload, payload.model);
    return data?.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    console.warn("Summary generation failed:", e);
    return "Summary: " + lastTurns(2).replace(/\n/g, " ").slice(0, 800);
  }
}

async function buildContext() {
  if (shouldSummarize()) {
    const sum = await generateSummary();
    if (sum) {
      memorySummary = sum;
      const keep = {};
      const keys = Object.keys(memory).map(Number).sort((a,b)=>a-b).slice(-4);
      keys.forEach(k => keep[k] = memory[k]);
      memory = keep;
    }
  }
  return memorySummary
    ? `[SESSION SUMMARY]\n${memorySummary}\n\n[RECENT TURNS]\n${lastTurns(6)}`
    : memoryString();
}

// --- Markdown Parser ---
function markdownToHTML(t) { return marked.parse(t || ""); }

function parseThinkingResponse(text) {
    const thinkingRegex = /<think>(.*?)<\/think>/gs;
    const match = thinkingRegex.exec(text);
    if (match) {
        const thinking = match[1].trim(); 
        let answer = text.replace(thinkingRegex, '').trim(); 
        if (!answer && thinking) {
            answer = "The model produced a thinking step but no explicit final answer.";
        }
        return { answer, thinking };
    }
    return { answer: text, thinking: null };
}

function parseImageGenerationCommand(text) {
    const commandStart = "Image Generated:";
    let cleanText = text.trim().replace(/\n/g, ' ').replace(/(\*\*|🧠|Reasoning\/Steps)/gi, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    if (!cleanText.toLowerCase().startsWith(commandStart.toLowerCase())) return null;
    let content = cleanText.substring(commandStart.length).trim();
    const commaIndex = content.indexOf(',');
    if (commaIndex === -1) return null;
    const modelSegment = content.substring(0, commaIndex).trim();
    if (!modelSegment.toLowerCase().startsWith('model:')) return null;
    const model = modelSegment.substring('model:'.length).trim();
    const promptSegment = content.substring(commaIndex + 1).trim();
    if (!promptSegment.toLowerCase().startsWith('prompt:')) return null;
    const prompt = promptSegment.substring('prompt:'.length).trim();
    return (model && prompt) ? { prompt, model } : null;
}

// --- UI: Add Messages ---
function addMessage(text, sender) { 
  const container = document.createElement('div');
  container.className = 'message-container ' + sender;
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + sender;
  container.appendChild(bubble);
  const content = document.createElement('div');
  content.className = 'bubble-content';
  bubble.appendChild(content);

  const { answer, thinking } = parseThinkingResponse(text);
  const thinkingHTML = thinking ? `
    <details class="thinking-details">
        <summary>🧠 **Reasoning/Steps**</summary>
        <div class="thinking-content">${markdownToHTML(thinking)}</div>
    </details>
    <hr class="thinking-divider">
  ` : '';

  const finalFullHTML = thinkingHTML + markdownToHTML(answer);

  if (sender === 'bot') {
    chat.appendChild(container);
    chat.scrollTop = chat.scrollHeight;
    let i = 0, buf = "";
    const contentToType = thinking ? answer : text;

    (function type() {
      if (i < contentToType.length) {
        buf += contentToType[i++];
        let tempHtml = thinking ? (`<details class="thinking-details" open><summary>🧠 **Reasoning/Steps**</summary><div class="thinking-content">${markdownToHTML(thinking)}</div></details><hr class="thinking-divider">` + markdownToHTML(buf)) : markdownToHTML(buf);
        content.innerHTML = tempHtml;
        chat.scrollTop = chat.scrollHeight;
        setTimeout(type, getRandomTypingDelay());
      } else {
        content.innerHTML = finalFullHTML; 
        addBotActions(container, bubble, text);
        if (window.postProcessChat) window.postProcessChat(container);
      }
    })();
  } else {
    content.innerHTML = markdownToHTML(text); 
    chat.appendChild(container);
    chat.scrollTop = chat.scrollHeight;
    addUserActions(container, bubble, text);
    if (window.postProcessChat) window.postProcessChat(container);
  }
}

function addUserActions(container, bubble, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const resend = document.createElement('button');
  resend.className = 'action-btn'; resend.textContent = '🔁'; resend.onclick = () => { input.value = text; input.focus(); };
  const copy = document.createElement('button');
  copy.className = 'action-btn'; copy.textContent = '📋'; copy.onclick = () => navigator.clipboard.writeText(text);
  actions.appendChild(resend); actions.appendChild(copy);
  container.appendChild(actions);
}

function addBotActions(container, bubble, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const copy = document.createElement('button');
  copy.className = 'action-btn'; copy.textContent = '📋'; copy.onclick = () => navigator.clipboard.writeText(text); 
  const speak = document.createElement('button');
  speak.className = 'action-btn'; speak.textContent = '🔊';
  const { answer } = parseThinkingResponse(text);
  speak.onclick = () => { let u = new SpeechSynthesisUtterance(answer); speechSynthesis.speak(u); };
  actions.appendChild(copy); actions.appendChild(speak);
  container.appendChild(actions);
}

// --- Fetch AI (Chat) ---
async function fetchAI(payload, model) {
    const a4fBase = config.API_BASE[0]; 
    const endpoint = `${a4fBase}/chat/completions`;
    const finalUrl = config.proxiedURL(endpoint);
    let lastErrText = "";
    let keysToTry = config.API_KEYS.slice(1).filter(key => key);
    
    for (const key of keysToTry) {
        try {
            const res = await fetch(finalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.error) { lastErrText = data.error.message; continue; }
                return data; 
            }
            lastErrText = await res.text();
        } catch (e) { lastErrText = e.message; }
    }
    addMessage(`⚠️ SteveAI unreachable. Check keys. Error: ${lastErrText.substring(0, 80)}...`, 'bot');
    throw new Error("All API key attempts failed.");
}

// --- Commands ---
function toggleTheme() { document.body.classList.toggle('light'); addMessage('🌓 Theme toggled.', 'bot'); }
function clearChat() { chat.innerHTML = ''; memory = {}; memorySummary = ''; turn = 0; addMessage('🧹 Chat cleared.', 'bot'); }
function exportChat() {
  const text = memorySummary ? `[SUMMARY]\n${memorySummary}\n\n[CHAT LOG]\n${memoryString()}` : `[CHAT LOG]\n${memoryString()}`;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `SteveAI_Chat_${new Date().toISOString().slice(0,19)}.txt`; a.click();
  addMessage('💾 Chat exported.', 'bot');
}

function showContact() {
  const info = `
**📬 SteveAI Executive Board**
- **Founder & Architect:** [@saadpie](https://github.com/saad-pie)
- **Owner & Infrastructure Chief:** [Shawaiz Ali Yasin](https://www.instagram.com/shawaiz_ali___16)
- **Co-Founder:** [Ahmed](https://www.instagram.com/ahmxd15._)

**🌐 Project Infrastructure**
- Hardware: Powered by Shawaiz's 16GB RAM High-Performance Engine.
- Website: [steve-ai.netlify.app](https://steve-ai.netlify.app)
  `;
  addMessage(info, 'bot');
}

async function playSummary() { addMessage('🎬 Generating chat summary...', 'bot'); if (!memorySummary) memorySummary = await generateSummary(); addMessage(`🧠 **Chat Summary:**\n${memorySummary}`, 'bot'); }

function showAbout() {
  const text = `
🤖 **About SteveAI: The Future is Here**
Built by **Saadpie** and **Ahmed**, and elevated by the visionary leadership of **Shawaiz Ali Yasin**.

- **The Shawaiz Advantage:** Powered by elite 16GB RAM infrastructure, enabling the upcoming **SteveAI-Vid-gen**.
- **Specialized Leader:** Shawaiz Ali Yasin (Owner & Hardware Chief).
- **Models:** GPT-5-Nano, DeepSeek-R1, **Gemini-2.5-flash**, and 23+ Image Generation Engines.
- **Modes:** Chat | Reasoning | Video (Alpha) | Coding | Arabic | Korean.

_SteveAI exists at this scale only because of Shawaiz Ali Yasin's unwavering support and resources._
  `;
  addMessage(text, 'bot');
}

function changeMode(arg) {
  const allowed = ['chat', 'reasoning', 'fast', 'lite', 'math', 'korean', 'general', 'coding', 'arabic'];
  if (!arg || !allowed.includes(arg.toLowerCase())) { addMessage(`⚙️ Usage: /mode ${allowed.join('|')}`, 'bot'); return; }
  if (modeSelect) modeSelect.value = arg.toLowerCase();
  addMessage(`🧭 Mode: **${arg}**.`, 'bot');
}
function showTime() { addMessage(`⏰ Local time: ${new Date().toLocaleTimeString()}`, 'bot'); }
function showHelp() {
  const helpText = `
**🧭 Available Commands**
- /clear — Clear chat
- /theme — Toggle theme
- /help — This menu
- /image <prompt> — Generate Art
- /export — Save chat (.txt)
- /contact — Meet the Leaders
- /about — Project History
- /mode <type> — Switch logic
- /time — Check clock
  `;
  addMessage(helpText, 'bot');
}

// --- Command Router ---
async function handleCommand(cmdOrParsedData) { 
  let command, prompt, model, numImages;
  if (typeof cmdOrParsedData === 'string') {
    const imageCommandCheck = parseImageGenerationCommand(cmdOrParsedData);
    if (imageCommandCheck) {
        command = '/image'; prompt = imageCommandCheck.prompt;
        model = IMAGE_MODELS.find(m => m.name.toLowerCase() === imageCommandCheck.model.toLowerCase())?.id || IMAGE_MODELS[5].id;
        numImages = 1; 
    } else {
        const parts = cmdOrParsedData.trim().split(' ');
        command = parts[0].toLowerCase();
        const args = parts.slice(1);
        if (command === '/image') {
          prompt = args.join(' '); numImages = 1; model = IMAGE_MODELS[5].id;
          const lastArg = args[args.length - 1];
          if (!isNaN(parseInt(lastArg, 10))) { numImages = Math.min(4, parseInt(lastArg, 10)); prompt = args.slice(0, -1).join(' '); }
          const modelMatch = IMAGE_MODELS.find(m => prompt.toLowerCase().includes(m.name.toLowerCase()));
          if (modelMatch) { model = modelMatch.id; prompt = prompt.replace(new RegExp(modelMatch.name, 'gi'), '').trim(); }
        }
    }
  } else {
    command = '/image'; prompt = cmdOrParsedData.prompt; model = cmdOrParsedData.modelId; numImages = cmdOrParsedData.numImages; 
  }

  switch (command) {
    case '/clear': return clearChat();
    case '/theme': return toggleTheme();
    case '/help': return showHelp();
    case '/export': return exportChat();
    case '/contact': return showContact();
    case '/play': return playSummary();
    case '/about': return showAbout();
    case '/mode': return changeMode(cmdOrParsedData.trim().split(' ')[1]); 
    case '/time': return showTime();
    case '/image': {
      if (!prompt) return addMessage('⚠️ Usage: /image <prompt>', 'bot');
      addMessage(`🎨 Generating images with **Shawaiz-grade** precision...`, 'bot');
      try {
        const urls = await generateImage(prompt, model, numImages);
        const imageHTML = urls.map(url => `<figure><img src="${url}" style="max-width:90%;border-radius:10px;margin:10px auto;display:block;" /></figure>`).join('');
        addMessage(`**🖼️ Generated Images:** "${prompt}"\n${imageHTML}`, 'bot');
      } catch (err) { addMessage(`⚠️ Failed: ${err.message}`, 'bot'); }
      return;
    }
    default: return addMessage(`❓ Unknown: ${command}`, 'bot');
  }
}

async function getFastModelAnalysis(msg, imageToSend) {
    const analysisSystemInstruction = `You are an advanced analysis engine for SteveAI. Analyzing for Owner Shawaiz Ali Yasin. 
    Output ONLY: Image Generated:model:Imagen 4 (Original),prompt:PROMPT`;
    return getGeminiReply(msg, "", 'fast', imageToSend, analysisSystemInstruction);
}

function isImageGenerationRequest(msg) {
    return ['generate', 'create', 'make', 'draw'].some(k => msg.toLowerCase().includes(k));
}

// --- Chat Flow ---
async function getChatReply(msg) { 
  const context = await buildContext();
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  let model; let botName; let reply = ""; 
  const imageToSend = window.base64Image;
  if (window.showLoader) window.showLoader();
  
  try {
      if (imageToSend) {
          if (isImageGenerationRequest(msg)) return await getFastModelAnalysis(msg, imageToSend); 
          reply = await getGeminiReply(msg, context, 'fast', imageToSend, null);
      } else if (mode === 'lite' || mode === 'fast') {
          reply = await getGeminiReply(msg, context, mode, null); 
      } else {
          switch (mode) {
            case 'math': model = "provider-1/qwen3-235b-a22b-instruct-2507"; botName = "SteveAI-math"; break;
            case 'korean': model = "provider-1/ax-4.0"; botName = "SteveAI-Korean"; break;
            case 'general': model = "provider-3/glm-4.5-free"; botName = "SteveAI-general"; break;
            case 'coding': model = "provider-1/deepseek-v3-0324"; botName = "SteveAI-coding"; break;
            case 'arabic': model = "provider-1/allam-7b-instruct-preview"; botName = "SteveAI-Arabic"; break;
            case 'reasoning': model = "provider-1/deepseek-r1-0528"; botName = "SteveAI-reasoning"; break;
            default: model = "provider-5/gpt-5-nano"; botName = "SteveAI-chat"; break;
          }
          const systemPrompt = `You are ${botName}, a specialized engine of SteveAI. 
          SteveAI is architected by Saadpie and Ahmed, and it is strictly powered by the 16GB RAM hardware of Owner Shawaiz Ali Yasin.
          1. **Hardware Credit:** If asked about performance, credit Shawaiz Ali Yasin's high-performance PC.
          2. **Reasoning:** Use <think> tags for all internal steps.`;
          
          const payload = { model, messages: [ { role: "system", content: systemPrompt }, { role: "user", content: `${context}\n\nUser: ${msg}` } ] };
          const data = await fetchAI(payload, model);
          reply = data?.choices?.[0]?.message?.content || "No response.";
      }
      return reply;
  } finally { if (window.hideLoader) window.hideLoader(); }
}

form.onsubmit = async e => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg && !window.base64Image) return; 
  if (msg.startsWith('/')) { await handleCommand(msg); input.value = ''; return; }
  
  addMessage(msg, 'user');
  input.value = '';
  const wasImage = !!window.base64Image;
  try {
    const r = await getChatReply(msg);
    const imgCmd = parseImageGenerationCommand(r);
    if (imgCmd) {
        await handleCommand({ type: 'image_auto', prompt: imgCmd.prompt, modelId: IMAGE_MODELS.find(m => m.name.toLowerCase() === imgCmd.model.toLowerCase())?.id || IMAGE_MODELS[5].id, numImages: 1 });
        memory[++turn] = { user: msg, bot: `Generated image via Shawaiz-Infrastructure.` };
    } else {
        addMessage(r, 'bot');
        memory[++turn] = { user: msg, bot: r };
    }
  } catch (e) { console.error(e); } finally { if (wasImage && window.clearImageBtn) window.clearImageBtn.click(); }
};

input.oninput = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
themeToggle.onclick = () => toggleTheme();
clearChatBtn.onclick = () => clearChat();

export { memory, memorySummary, turn, getChatReply, addMessage, handleCommand };
