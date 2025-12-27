// chat.js - SteveAI: Ultimate Multi-Modal Orchestrator
// Powered by Ahmed Aftab's 16GB RAM High-Performance Engine
// Developed by Saadpie

import config from './config.js'; 
import { generateImage, IMAGE_MODELS } from './image.js'; 
import { getGeminiReply } from './gemini.js'; 

// --- Config & DOM ---
const chat = document.getElementById('chat');
const form = document.getElementById('inputForm');
const input = document.getElementById('messageInput');
const themeToggle = document.getElementById('themeToggle');
const clearChatBtn = document.getElementById('clearChat');
const modeSelect = document.getElementById('modeSelect');

// Canvas Elements
const canvasSidebar = document.getElementById('canvas-sidebar');
const canvasIframe = document.getElementById('canvas-iframe');
const canvasCodeDisplay = document.getElementById('canvas-code-display');

// --- Memory Management (Unlimited Token Budget) ---
let memory = {};
let turn = 0;
let memorySummary = "";
const TOKEN_BUDGET = Infinity; // Budget is now unlimited
const approxTokens = s => Math.ceil((s || "").length / 4);

// --- Helpers ---
function memoryString() {
  return Object.keys(memory).map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`).join('\n');
}

function lastTurns(n = 6) {
  const keys = Object.keys(memory).map(Number).sort((a,b)=>a-b);
  return keys.slice(-n).map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`).join('\n');
}

// Disabled summarization to maintain full context
function shouldSummarize() {
  return false; 
}

// High-speed delay for 100 tokens/sec feel
function getRandomTypingDelay() { return 10; }

// --- Markdown Parser ---
function markdownToHTML(t) { return typeof marked !== 'undefined' ? marked.parse(t || "") : t; }

// --- Canvas Logic ---
window.openInCanvas = (code, lang) => {
    if (!canvasSidebar) return;
    canvasSidebar.classList.remove('hidden');
    canvasCodeDisplay.textContent = code;
    if (window.Prism) Prism.highlightElement(canvasCodeDisplay);

    let content = '';
    const cleanLang = (lang || 'html').toLowerCase();
    
    if (cleanLang === 'html' || code.includes('<!DOCTYPE') || code.includes('<html')) {
        content = code;
    } else if (cleanLang === 'javascript' || cleanLang === 'js') {
        content = `<html><body style="background:#fff;padding:20px;font-family:sans-serif;"><h3>JS Output:</h3><div id="out"></div><script>
            const console = { log: (m) => { document.getElementById('out').innerHTML += '<p style="border-bottom:1px solid #eee;padding:5px;">'+m+'</p>'; } };
            try { ${code} } catch(e) { console.log('Error: ' + e.message); }
        <\/script></body></html>`;
    } else if (cleanLang === 'css') {
        content = `<html><head><style>${code}</style></head><body><div style="padding:20px;"><h1>CSS Preview</h1><p>SteveAI CSS Test</p><button>Button</button><div style="width:100px;height:100px;background:grey;margin-top:10px;">Box</div></div></body></html>`;
    } else {
        window.switchCanvasTab('code'); return;
    }
    canvasIframe.srcdoc = content;
    window.switchCanvasTab('preview');
};

window.toggleCanvas = () => canvasSidebar.classList.toggle('hidden');

window.switchCanvasTab = (tab) => {
    const preview = document.getElementById('canvas-preview-container');
    const codeView = document.getElementById('canvas-code-container');
    const btns = document.querySelectorAll('.tab-btn');
    if (tab === 'preview') {
        preview.style.display = 'block'; codeView.style.display = 'none';
        if(btns[0]) btns[0].classList.add('active'); 
        if(btns[1]) btns[1].classList.remove('active');
    } else {
        preview.style.display = 'none'; codeView.style.display = 'block';
        if(btns[0]) btns[0].classList.remove('active'); 
        if(btns[1]) btns[1].classList.add('active');
    }
};

// --- UI Logic & Post-Processing ---
function createCodeHeader(preElement) {
    if (preElement.querySelector('.code-header')) return; 
    const codeElement = preElement.querySelector('code');
    if (!codeElement) return;
    const match = codeElement.className.match(/language-(\w+)/);
    const lang = match ? match[1] : 'Code';
    
    const header = document.createElement('div');
    header.className = 'code-header';
    const langSpan = document.createElement('span');
    langSpan.textContent = lang.toUpperCase();
    header.appendChild(langSpan);

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex'; btnGroup.style.gap = '8px';

    if (['html', 'javascript', 'js', 'css'].includes(lang.toLowerCase())) {
        const runBtn = document.createElement('button');
        runBtn.className = 'copy-btn'; runBtn.style.background = '#4CAF50';
        runBtn.textContent = '▶ Run';
        runBtn.onclick = () => window.openInCanvas(codeElement.innerText, lang);
        btnGroup.appendChild(runBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn'; copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => window.copyCode(copyBtn);
    btnGroup.appendChild(copyBtn);
    header.appendChild(btnGroup);
    preElement.insertBefore(header, preElement.firstChild);
}

window.postProcessChat = (newChatElement) => {
    if (window.Prism) {
         newChatElement.querySelectorAll('pre').forEach(pre => {
            try { Prism.highlightElement(pre.querySelector('code')); createCodeHeader(pre); } catch (e) {}
        });
    }
    if (window.renderMathInElement) {
        try {
            renderMathInElement(newChatElement, {
                delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}],
                throwOnError: false
            });
        } catch (e) {}
    }
};

// --- Core AI Logic ---
async function fetchAI(payload, model) {
    const a4fBase = config.API_BASE[0]; 
    const finalUrl = config.proxiedURL(`${a4fBase}/chat/completions`);
    for (const key of config.API_KEYS.slice(1).filter(k => k)) {
        try {
            const res = await fetch(finalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) return await res.json();
        } catch (e) {}
    }
    throw new Error("Failed");
}

function parseThinkingResponse(text) {
    const thinkingRegex = /<think>(.*?)<\/think>/gs;
    const match = thinkingRegex.exec(text);
    if (match) {
        return { answer: text.replace(thinkingRegex, '').trim(), thinking: match[1].trim() };
    }
    return { answer: text, thinking: null };
}

function parseImageGenerationCommand(text) {
    const commandStart = "Image Generated:";
    let cleanText = text.trim().replace(/\n/g, ' ').replace(/(\*\*|🧠|Reasoning)/gi, '').trim();
    if (!cleanText.toLowerCase().startsWith(commandStart.toLowerCase())) return null;
    let content = cleanText.substring(commandStart.length).trim();
    const commaIndex = content.indexOf(',');
    if (commaIndex === -1) return null;
    const model = content.substring(0, commaIndex).replace(/model:/i, '').trim();
    const prompt = content.substring(commaIndex + 1).replace(/prompt:/i, '').trim();
    return (model && prompt) ? { prompt, model } : null;
}

// --- UPDATED ADD MESSAGE (TURBO STREAMING) ---
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
  // Keep thinking details open for transparency during rapid output
  const thinkingHTML = thinking ? `<details class="thinking-details" open><summary>🧠 Reasoning</summary><div class="thinking-content">${markdownToHTML(thinking)}</div></details><hr class="thinking-divider">` : '';
  const finalFullHTML = thinkingHTML + markdownToHTML(answer);

  if (sender === 'bot') {
    chat.appendChild(container);
    let i = 0;
    const contentToType = thinking ? answer : text;
    const chunkSize = 15; // Renders 15 chars every 10ms (~100 tokens/sec)

    (function type() {
      if (i < contentToType.length) {
        i += chunkSize;
        const currentSlice = contentToType.substring(0, i);
        content.innerHTML = thinking ? (thinkingHTML + markdownToHTML(currentSlice)) : markdownToHTML(currentSlice);
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
    addUserActions(container, bubble, text);
    if (window.postProcessChat) window.postProcessChat(container);
    chat.scrollTop = chat.scrollHeight;
  }
}

function addUserActions(container, bubble, text) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `<button class="action-btn">🔁</button><button class="action-btn">📋</button>`;
    actions.firstChild.onclick = () => { input.value = text; input.focus(); };
    actions.lastChild.onclick = () => navigator.clipboard.writeText(text);
    container.appendChild(actions);
}

function addBotActions(container, bubble, text) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `<button class="action-btn">📋</button><button class="action-btn">🔊</button>`;
    actions.firstChild.onclick = () => navigator.clipboard.writeText(text);
    actions.lastChild.onclick = () => {
        const { answer } = parseThinkingResponse(text);
        speechSynthesis.speak(new SpeechSynthesisUtterance(answer));
    };
    container.appendChild(actions);
}

// --- Command Logic ---
async function handleCommand(cmd) {
    if (cmd.startsWith('/clear')) { chat.innerHTML = ''; memory = {}; turn = 0; return; }
    if (cmd.startsWith('/image')) {
        const prompt = cmd.replace('/image', '').trim();
        addMessage("🎨 Generating with Ahmed-grade precision...", 'bot');
        const urls = await generateImage(prompt, IMAGE_MODELS[5].id, 1);
        const html = urls.map(u => `<img src="${u}" style="max-width:90%;border-radius:10px;margin:10px 0;">`).join('');
        addMessage(`🖼️ **Result:**\n${html}`, 'bot');
    }
}

async function getChatReply(msg) { 
  const context = memoryString(); 
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  const imageToSend = window.base64Image;
  
  if (window.showLoader) window.showLoader();
  
  try {
      if (imageToSend) return await getGeminiReply(msg, context, 'fast', imageToSend, null);
      
      let model = "provider-5/gpt-oss-120b";
      switch (mode) {
        case 'reasoning': model = "provider-5/deepseek-r1-0528-fast"; break;
        case 'coding': model = "provider-8/mimo-v2-flash"; break;
      }

      const payload = { model, messages: [ 
          { role: "system", content: "You are SteveAI. Use <think> for reasoning." },
          { role: "user", content: `${context}\n\nUser: ${msg}` } 
      ] };
      const data = await fetchAI(payload, model);
      return data?.choices?.[0]?.message?.content || "No response.";
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
        await handleCommand(`/image ${imgCmd.prompt}`);
    } else {
        addMessage(r, 'bot');
        memory[++turn] = { user: msg, bot: r };
    }
  } finally { if (wasImage && window.clearImageBtn) window.clearImageBtn.click(); }
};

input.oninput = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
themeToggle.onclick = () => document.body.classList.toggle('light');
clearChatBtn.onclick = () => { chat.innerHTML = ''; memory = {}; turn = 0; };
