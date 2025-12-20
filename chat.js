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
    const minDelay = 0;
    const maxDelay = 4; 
    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
}

// --- Summarization ---
async function generateSummary() {
  const raw = memoryString();
  const payload = {
    model: "provider-2/gpt-4o-mini",
    messages: [
      { role: "system", content: "You are SteveAI, made by saadpie and its vice ceo shawaiz. Summarize the following chat context clearly." },
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
    let cleanText = text.trim()
        .replace(/\n/g, ' ') 
        .replace(/(\*\*|🧠|Reasoning\/Steps)/gi, '')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") 
        .trim();

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
        let tempHtml = thinking ? `
                <details class="thinking-details" open>
                    <summary>🧠 **Reasoning/Steps**</summary>
                    <div class="thinking-content">${markdownToHTML(thinking)}</div>
                </details>
                <hr class="thinking-divider">
             ` + markdownToHTML(buf) : markdownToHTML(buf);
        
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
  resend.className = 'action-btn'; resend.textContent = '🔁';
  resend.onclick = () => { input.value = text; input.focus(); };
  const copy = document.createElement('button');
  copy.className = 'action-btn'; copy.textContent = '📋';
  copy.onclick = () => navigator.clipboard.writeText(text);
  actions.appendChild(resend); actions.appendChild(copy);
  container.appendChild(actions);
}

function addBotActions(container, bubble, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const copy = document.createElement('button');
  copy.className = 'action-btn'; copy.textContent = '📋';
  copy.onclick = () => navigator.clipboard.writeText(text); 
  const speak = document.createElement('button');
  speak.className = 'action-btn'; speak.textContent = '🔊';
  const { answer } = parseThinkingResponse(text);
  speak.onclick = () => {
    let u = new SpeechSynthesisUtterance(answer);
    speechSynthesis.speak(u);
  };
  actions.appendChild(copy); actions.appendChild(speak);
  container.appendChild(actions);
}

// --- Fetch AI (FIXED: Tries ALL keys) ---
async function fetchAI(payload, model) {
    const a4fBase = config.API_BASE[0]; 
    const baseUrl = config.proxiedURL(a4fBase);
    let lastErrText = "";

    // FIXED: Try ALL keys in config.API_KEYS array
    let keysToTry = config.API_KEYS.filter(key => key && key.startsWith('ddc-'));
    
    if (keysToTry.length === 0) {
        addMessage("⚠️ No valid A4F keys found. Please check config.js", "bot");
        throw new Error("No A4F keys available.");
    }

    for (const key of keysToTry) {
        try {
            const res = await fetch(baseUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.error) {
                    lastErrText = data.error.message;
                    continue; 
                }
                return data;
            }
            lastErrText = await res.text();
        } catch (e) {
            lastErrText = e.message;
        }
    }
    
    addMessage(`⚠️ All API keys failed. Last error: ${lastErrText.substring(0, 80)}`, 'bot');
    throw new Error("Auth Failure");
}

// --- Commands & Router ---
function toggleTheme() { document.body.classList.toggle('light'); addMessage('🌓 Theme toggled.', 'bot'); }
function clearChat() { chat.innerHTML = ''; memory = {}; memorySummary = ''; turn = 0; addMessage('🧹 Chat cleared.', 'bot'); }
function exportChat() {
  const text = memorySummary ? `[SUMMARY]\n${memorySummary}\n\n[CHAT LOG]\n${memoryString()}` : `[CHAT LOG]\n${memoryString()}`;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SteveAI_Chat_${new Date().toISOString()}.txt`;
  a.click();
}

async function playSummary() {
  addMessage('🎬 Generating chat summary...', 'bot');
  if (!memorySummary) memorySummary = await generateSummary();
  addMessage(`🧠 **Chat Summary:**\n${memorySummary}`, 'bot');
}

function showAbout() {
  const text = `🤖 **About SteveAI**\nBuilt by *saadpie and shawaiz*.\n- Models: GPT-5, DeepSeek-R1, Gemini 2.5\n- Features: Context memory, Image Gen, Theme toggle.`;
  addMessage(text, 'bot');
}

async function handleCommand(cmdOrParsedData) {
  let command, prompt, model, numImages;
  if (typeof cmdOrParsedData === 'string') {
    const imageCommandCheck = parseImageGenerationCommand(cmdOrParsedData);
    if (imageCommandCheck) {
        command = '/image'; prompt = imageCommandCheck.prompt;
        const modelObject = IMAGE_MODELS.find(m => m.name.toLowerCase() === imageCommandCheck.model.toLowerCase());
        model = modelObject ? modelObject.id : IMAGE_MODELS[5].id; numImages = 1;
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
  } else if (cmdOrParsedData.type === 'image_auto') {
    command = '/image'; prompt = cmdOrParsedData.prompt; model = cmdOrParsedData.modelId; numImages = cmdOrParsedData.numImages;
  }

  switch (command) {
    case '/clear': return clearChat();
    case '/theme': return toggleTheme();
    case '/export': return exportChat();
    case '/play': return playSummary();
    case '/about': return showAbout();
    case '/image':
      if (!prompt) return addMessage('⚠️ Usage: /image <prompt>', 'bot');
      addMessage(`🎨 Generating image for: *${prompt}*...`, 'bot');
      try {
        const urls = await generateImage(prompt, model, numImages);
        const imgHtml = urls.map(u => `<img src="${u}" style="max-width:90%;border-radius:10px;display:block;margin:10px auto;">`).join('');
        addMessage(`**🖼️ Result:**\n${imgHtml}`, 'bot');
      } catch (e) { addMessage(`⚠️ Failed: ${e.message}`, 'bot'); }
      break;
  }
}

async function getFastModelAnalysis(msg, imageToSend) {
    const analysisSystemInstruction = `You are SteveAI Image Engine. Output ONLY: Image Generated:model:Imagen 4 (Original),prompt:PROMPT`;
    return getGeminiReply(msg, "", 'fast', imageToSend, analysisSystemInstruction);
}

function isImageGenerationRequest(msg) {
    const keywords = ['generate', 'create', 'make', 'draw', 'paint', 'edit'];
    return keywords.some(k => msg.toLowerCase().includes(k));
}

async function getChatReply(msg) {
  const context = await buildContext();
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  const imageToSend = window.base64Image;

  if (window.showLoader) window.showLoader();
  
  try {
      if (imageToSend) {
          if (isImageGenerationRequest(msg)) {
              return await getFastModelAnalysis(msg, imageToSend);
          }
          return await getGeminiReply(msg, context, 'fast', imageToSend, null);
      } 

      if (mode === 'lite' || mode === 'fast') {
          return await getGeminiReply(msg, context, mode, null);
      } else {
          let model = "provider-5/gpt-5-nano";
          if (mode === 'reasoning') model = "provider-1/deepseek-r1-0528";
          if (mode === 'coding') model = "provider-1/deepseek-v3-0324";
          
          const payload = {
            model,
            messages: [
              { role: "system", content: `You are SteveAI. Use <think> tags for reasoning.` },
              { role: "user", content: `${context}\n\nUser: ${msg}` }
            ],
          };
          const data = await fetchAI(payload, model);
          return data?.choices?.[0]?.message?.content || "No response.";
      }
  } finally {
      if (window.hideLoader) window.hideLoader();
  }
}

form.onsubmit = async e => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg && !window.base64Image) return; 
  if (msg.startsWith('/')) { await handleCommand(msg); input.value = ''; return; }
  
  addMessage(msg, 'user');
  input.value = '';
  const wasImageAttached = !!window.base64Image;
  
  try {
    const r = await getChatReply(msg);
    const imageCommand = parseImageGenerationCommand(r);
    if (imageCommand) {
        await handleCommand({ type: 'image_auto', prompt: imageCommand.prompt, modelId: IMAGE_MODELS[5].id, numImages: 1 });
        memory[++turn] = { user: msg, bot: `🖼️ Generated image: ${imageCommand.prompt}` };
    } else {
        addMessage(r, 'bot');
        memory[++turn] = { user: msg, bot: r };
    }
  } finally {
      if (wasImageAttached && window.clearImageBtn) window.clearImageBtn.click();
  }
};

input.oninput = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
themeToggle.onclick = () => toggleTheme();
clearChatBtn.onclick = () => clearChat();

export { memory, turn, getChatReply, addMessage, handleCommand };
