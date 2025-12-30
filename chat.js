// chat.js - SteveAI: Ultimate Multi-Modal Orchestrator
// Powered by Ahmed Aftab's PC & Puter.js SDK
// Developed by Saadpie

import config from './config.js'; 
import { generateImage, IMAGE_MODELS } from './image.js'; 
import { getGeminiReply } from './gemini.js'; 
import { getPuterReply, PUTER_MODELS } from './puter.js';

// --- DOM Elements ---
const chat = document.getElementById('chat');
const form = document.getElementById('inputForm');
const input = document.getElementById('messageInput');
const themeToggle = document.getElementById('themeToggle');
const clearChatBtn = document.getElementById('clearChat');
const modeSelect = document.getElementById('modeSelect');
const syncBtn = document.getElementById('syncModelsBtn');

// --- Memory & State ---
let memory = {};
let turn = 0;

// --- Model Synchronization ---
async function syncModels() {
    const apiKey = "ddc-a4f-93af1cce14774a6f831d244f4df3eb9e";
    const url = config.proxiedURL(`${config.API_BASE[0]}/models?plan=free`);

    try {
        // Reset Dropdown
        modeSelect.innerHTML = `
            <option value="chat" selected>SteveAI-Default</option>
            <option value="fast">SteveAI-Fast (Gemini)</option>
            <hr class="dropdown-divider">
        `;

        // 1. Load Puter.js Free Models
        const puterGroup = document.createElement('optgroup');
        puterGroup.label = "── PUTER UNLIMITED ──";
        PUTER_MODELS.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            puterGroup.appendChild(opt);
        });
        modeSelect.appendChild(puterGroup);

        // 2. Load Ahmed Aftab's Engine Models
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        const data = await res.json();
        
        if (data && data.data) {
            const engineGroup = document.createElement('optgroup');
            engineGroup.label = "── AHMED ENGINE ──";
            const chatModels = data.data.filter(m => m.type === "chat/completion");

            chatModels.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                let label = m.id.split('/').pop().toUpperCase().replace(/-/g, ' ');
                const limit = 18;
                let displayLabel = label.length > limit ? label.substring(0, limit) + "..." : label;
                
                // Orchestrator Branding
                if (label.includes('THINKING') || label.includes('R1')) opt.textContent = `🧠 ${displayLabel}`;
                else if (label.includes('LLAMA') || label.includes('MAVERICK')) opt.textContent = `🚀 ${displayLabel}`;
                else if (label.includes('GEMINI')) opt.textContent = `✨ ${displayLabel}`;
                else opt.textContent = displayLabel;
                
                engineGroup.appendChild(opt);
            });
            modeSelect.appendChild(engineGroup);
        }
        console.log("✅ SteveAI: All Engines Synced.");
    } catch (e) {
        console.error("❌ Model sync failed:", e);
    }
}

// Initial Sync
syncModels();

function buildContext() {
  return Object.keys(memory).map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`).join('\n');
}

// --- Message UI Logic ---
function addUserActions(container, text) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `<button class="action-btn"><i class="fa-solid fa-rotate-right"></i></button><button class="action-btn"><i class="fa-solid fa-copy"></i></button>`;
    actions.children[0].onclick = () => { input.value = text; input.focus(); };
    actions.children[1].onclick = () => navigator.clipboard.writeText(text);
    container.appendChild(actions);
}

function addBotActions(container, text) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `<button class="action-btn"><i class="fa-solid fa-copy"></i></button><button class="action-btn"><i class="fa-solid fa-volume-high"></i></button>`;
    actions.children[0].onclick = () => navigator.clipboard.writeText(text);
    actions.children[1].onclick = () => {
        const { answer } = parseThinkingResponse(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(answer));
    };
    container.appendChild(actions);
}

function parseThinkingResponse(text) {
    const thinkingRegex = /<think>(.*?)<\/think>/gs;
    const match = thinkingRegex.exec(text);
    if (match) return { answer: text.replace(thinkingRegex, '').trim(), thinking: match[1].trim() };
    return { answer: text, thinking: null };
}

function markdownToHTML(t) { return typeof marked !== 'undefined' ? marked.parse(t || "") : t; }

function addMessage(text, sender) { 
  const container = document.createElement('div');
  container.className = 'message-container ' + sender;
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + sender;
  const content = document.createElement('div');
  content.className = 'bubble-content';
  bubble.appendChild(content);
  container.appendChild(bubble);

  const { answer, thinking } = parseThinkingResponse(text);
  const thinkingHTML = thinking ? `<details class="thinking-details" open><summary>🧠 Reasoning</summary><div class="thinking-content">${markdownToHTML(thinking)}</div></details><hr class="thinking-divider">` : '';

  if (sender === 'bot') {
    chat.appendChild(container);
    let i = 0;
    const contentToType = thinking ? answer : text;
    const chunkSize = 30;
    (function type() {
      if (i < contentToType.length) {
        i += chunkSize;
        content.innerHTML = thinking ? (thinkingHTML + markdownToHTML(contentToType.substring(0, i))) : markdownToHTML(contentToType.substring(0, i));
        chat.scrollTop = chat.scrollHeight;
        setTimeout(type, 10);
      } else {
        content.innerHTML = thinkingHTML + markdownToHTML(answer);
        addBotActions(container, text);
        if (window.postProcessChat) window.postProcessChat(container);
      }
    })();
  } else {
    content.innerHTML = markdownToHTML(text); 
    chat.appendChild(container);
    addUserActions(container, text);
    chat.scrollTop = chat.scrollHeight;
  }
}

// --- API Routing ---
async function getChatReply(msg) {
    const context = buildContext();
    const selectedMode = modeSelect.value;
    const imageToSend = window.base64Image;
    
    if (window.showLoader) window.showLoader();

    try {
        // 1. Handle Gemini/Vision
        if (imageToSend || selectedMode === 'fast') {
            return await getGeminiReply(msg, context, 'fast', imageToSend, null);
        }

        // 2. Handle Puter.js Unlimited Models
        const isPuter = PUTER_MODELS.some(m => m.id === selectedMode);
        if (isPuter || selectedMode === 'chat') {
            return await getPuterReply(msg, context, selectedMode);
        }

        // 3. Fallback to Ahmed Aftab's Engine
        const payload = { 
            model: selectedMode, 
            messages: [{role:"system", content:"You are SteveAI by Saadpie."}, {role:"user", content:`${context}\n\nUser: ${msg}`}] 
        };
        const res = await fetch(config.proxiedURL(`${config.API_BASE[0]}/chat/completions`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ddc-a4f-93af1cce14774a6f831d244f4df3eb9e` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || "Node Timeout.";
    } finally {
        if (window.hideLoader) window.hideLoader();
    }
}

// --- Interaction ---
form.onsubmit = async e => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg && !window.base64Image) return;
    
    addMessage(msg, 'user');
    input.value = '';
    
    try {
        const reply = await getChatReply(msg);
        addMessage(reply, 'bot');
        memory[++turn] = { user: msg, bot: reply };
    } catch (e) {
        addMessage("⚠️ System offline. Engine overload.", "bot");
    } finally {
        if (document.getElementById('clearImageBtn')) document.getElementById('clearImageBtn').click();
    }
};

syncBtn.onclick = syncModels;
clearChatBtn.onclick = () => { chat.innerHTML = ''; memory = {}; turn = 0; };
themeToggle.onclick = () => document.body.classList.toggle('light');
