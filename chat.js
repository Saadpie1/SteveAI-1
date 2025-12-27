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
const TOKEN_BUDGET = Infinity; 
const approxTokens = s => Math.ceil((s || "").length / 4);

// --- Helpers ---
function memoryString() {
  return Object.keys(memory).map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`).join('\n');
}

function getRandomTypingDelay() { return 10; }
function markdownToHTML(t) { return typeof marked !== 'undefined' ? marked.parse(t || "") : t; }

// --- Canvas Logic (Fixed for Preview Height) ---
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
        content = `<html><head><style>${code}</style></head><body><div style="padding:20px;"><h1>CSS Preview</h1><p>SteveAI CSS Test</p></div></body></html>`;
    } else { window.switchCanvasTab('code'); return; }
    
    canvasIframe.srcdoc = content;
    window.switchCanvasTab('preview');
};

window.switchCanvasTab = (tab) => {
    const preview = document.getElementById('canvas-preview-container');
    const codeView = document.getElementById('canvas-code-container');
    const btns = document.querySelectorAll('.tab-btn');
    if (tab === 'preview') {
        preview.style.display = 'flex'; // Changed to flex to ensure height expansion
        codeView.style.display = 'none';
        btns[0]?.classList.add('active'); btns[1]?.classList.remove('active');
    } else {
        preview.style.display = 'none';
        codeView.style.display = 'block';
        btns[0]?.classList.remove('active'); btns[1]?.classList.add('active');
    }
};

// --- Action Button Handlers (Updated Icons) ---
function addUserActions(container, text) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
        <button class="action-btn" title="Resend"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="action-btn" title="Copy"><i class="fa-solid fa-copy"></i></button>`;
    actions.children[0].onclick = () => { input.value = text; input.focus(); };
    actions.children[1].onclick = () => navigator.clipboard.writeText(text);
    container.appendChild(actions);
}

function addBotActions(container, text) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
        <button class="action-btn" title="Copy"><i class="fa-solid fa-copy"></i></button>
        <button class="action-btn" title="Speak"><i class="fa-solid fa-volume-high"></i></button>`;
    actions.children[0].onclick = () => navigator.clipboard.writeText(text);
    actions.children[1].onclick = () => {
        const { answer } = parseThinkingResponse(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(answer));
    };
    container.appendChild(actions);
}

// --- Message Parser ---
function parseThinkingResponse(text) {
    const thinkingRegex = /<think>(.*?)<\/think>/gs;
    const match = thinkingRegex.exec(text);
    if (match) return { answer: text.replace(thinkingRegex, '').trim(), thinking: match[1].trim() };
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

// --- UI Rendering ---
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
  const thinkingHTML = thinking ? `<details class="thinking-details" open><summary>🧠 Reasoning/Steps</summary><div class="thinking-content">${markdownToHTML(thinking)}</div></details><hr class="thinking-divider">` : '';

  if (sender === 'bot') {
    chat.appendChild(container);
    let i = 0;
    const contentToType = thinking ? answer : text;
    const chunkSize = 15;

    (function type() {
      if (i < contentToType.length) {
        i += chunkSize;
        const currentSlice = contentToType.substring(0, i);
        content.innerHTML = thinking ? (thinkingHTML + markdownToHTML(currentSlice)) : markdownToHTML(currentSlice);
        chat.scrollTop = chat.scrollHeight;
        setTimeout(type, getRandomTypingDelay());
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
    if (window.postProcessChat) window.postProcessChat(container);
    chat.scrollTop = chat.scrollHeight;
  }
}

// --- Command Router ---
async function handleCommand(inputStr) {
    const parts = inputStr.trim().split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    const fullArgs = args.join(' ');

    switch (command) {
        case '/clear':
            chat.innerHTML = ''; memory = {}; turn = 0;
            addMessage('🧹 **SteveAI:** Chat memory cleared.', 'bot');
            break;
        case '/theme':
            document.body.classList.toggle('light');
            addMessage('🌓 **SteveAI:** Theme toggled.', 'bot');
            break;
        case '/help':
            addMessage(`
**🧭 SteveAI Command Menu**
- \`/clear\` — Reset conversation
- \`/theme\` — Toggle mode
- \`/help\` — Show this menu
- \`/about\` — Project history
- \`/contact\` — Meet the leaders
- \`/image <prompt>\` — AI Art
- \`/mode <type>\` — Switch logic
- \`/time\` — Check clock
            `, 'bot');
            break;
        case '/about':
            addMessage(`
🤖 **About SteveAI**
Built by **Saadpie** & **Ahmed**, powered by **Ahmed Aftab's 16GB RAM PC**. 
The orchestrator routes through 33+ specialized models.
            `, 'bot');
            break;
        case '/contact':
            addMessage(`
**📬 Executive Board**
- **Architect:** [@saadpie](https://github.com/saad-pie)
- **Owner:** Ahmed Aftab
- **Co-Founder:** Ahmed (@ahmxd15._)
            `, 'bot');
            break;
        case '/mode':
            const allowed = ['chat', 'reasoning', 'fast', 'lite', 'math', 'coding', 'science'];
            if (!fullArgs || !allowed.includes(fullArgs.toLowerCase())) {
                addMessage(`⚠️ Usage: \`/mode ${allowed.join('|')}\``, 'bot');
            } else {
                modeSelect.value = fullArgs.toLowerCase();
                addMessage(`🧭 Mode switched to: **${fullArgs.toUpperCase()}**`, 'bot');
            }
            break;
        case '/time':
            addMessage(`⏰ **System Time:** ${new Date().toLocaleTimeString()}`, 'bot');
            break;
        case '/image':
            if (!fullArgs) return addMessage('⚠️ Usage: /image <prompt>', 'bot');
            addMessage(`🎨 Generating image with **Ahmed-grade** precision...`, 'bot');
            try {
                const urls = await generateImage(fullArgs, IMAGE_MODELS[5].id, 1);
                const html = urls.map(u => `<img src="${u}" style="max-width:100%; border-radius:10px; margin-top:10px;">`).join('');
                addMessage(`🖼️ **Result:**\n${html}`, 'bot');
            } catch (e) { addMessage(`❌ Error: ${e.message}`, 'bot'); }
            break;
        default:
            addMessage(`❓ Unknown command: \`${command}\``, 'bot');
    }
}

// --- Orchestrator Flow ---
async function fetchAI(payload) {
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
    throw new Error("All keys exhausted.");
}

async function getChatReply(msg) { 
  const context = memoryString(); 
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  const imageToSend = window.base64Image;
  if (window.showLoader) window.showLoader();
  
  try {
      if (imageToSend) return await getGeminiReply(msg, context, 'fast', imageToSend, null);
      if (mode === 'lite' || mode === 'fast') return await getGeminiReply(msg, context, mode, null);

      let model;
      switch (mode) {
        case 'science': model = "provider-1/qwen3-next-80b-a3b-thinking"; break;
        case 'math': model = "provider-8/mimo-v2-flash"; break;
        case 'coding': model = "provider-8/mimo-v2-flash"; break;
        case 'reasoning': model = "provider-5/deepseek-r1-0528-fast"; break;
        default: model = "provider-5/gpt-oss-120b"; break;
      }

      const payload = { model, messages: [ 
          { role: "system", content: `You are SteveAI, powered by Ahmed Aftab's 16GB RAM Engine. Use <think> for reasoning. For images, use: Image Generated:model:Imagen 4 (Original),prompt:PROMPT` },
          { role: "user", content: `${context}\n\nUser: ${msg}` } 
      ] };
      const data = await fetchAI(payload);
      return data?.choices?.[0]?.message?.content || "No response.";
  } finally { if (window.hideLoader) window.hideLoader(); }
}

// --- Events ---
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
        memory[++turn] = { user: msg, bot: `Generated image: ${imgCmd.prompt}` };
    } else {
        addMessage(r, 'bot');
        memory[++turn] = { user: msg, bot: r };
    }
  } catch(e) { addMessage("⚠️ Error processing request.", "bot"); } 
  finally { if (wasImage && window.clearImageBtn) window.clearImageBtn.click(); }
};

input.oninput = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
themeToggle.onclick = () => document.body.classList.toggle('light');
clearChatBtn.onclick = () => { chat.innerHTML = ''; memory = {}; turn = 0; };
