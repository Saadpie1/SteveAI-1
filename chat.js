// chat.js - SteveAI: Ultimate Multi-Modal Orchestrator
// Powered by Ahmed Aftab's 16GB RAM Engine & Puter.js Satellite Bridge
// Developed by Saadpie

import config from './config.js'; 
import { generateImage, IMAGE_MODELS } from './image.js'; 
import { getGeminiReply } from './gemini.js'; 
import { getPuterReply, PUTER_MODELS } from './puter.js';

// --- Config & DOM ---
const chat = document.getElementById('chat');
const form = document.getElementById('inputForm');
const input = document.getElementById('messageInput');
const themeToggle = document.getElementById('themeToggle');
const clearChatBtn = document.getElementById('clearChat');
const modeSelect = document.getElementById('modeSelect');
const syncBtn = document.getElementById('syncModelsBtn');

// --- Memory Management ---
let memory = {};
let turn = 0;

// --- Satellite Bridge Initialization ---
// Note: silentPuterAuth is now handled via the invisible bridge in puter.js
// but we keep the function definition to avoid breaking existing logic calls.
async function silentPuterAuth() {
    console.log("🛡️ SteveAI: Satellite Bridge Active. Redirects suppressed.");
}
silentPuterAuth();

// --- Dynamic Model Syncing (Combined Ahmed + Puter) ---
async function syncModels() {
    const apiKey = "ddc-a4f-93af1cce14774a6f831d244f4df3eb9e";
    const url = config.proxiedURL(`${config.API_BASE[0]}/models?plan=free`);

    try {
        modeSelect.innerHTML = `
            <option value="chat" selected>SteveAI-Default (Puter)</option>
            <option value="fast">SteveAI-Fast (Gemini)</option>
        `;

        const puterGroup = document.createElement('optgroup');
        puterGroup.label = "── PUTER SATELLITE ──";
        PUTER_MODELS.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            puterGroup.appendChild(opt);
        });
        modeSelect.appendChild(puterGroup);

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
                if (label.includes('THINKING') || label.includes('R1')) opt.textContent = `🧠 ${displayLabel}`;
                else if (label.includes('LLAMA') || label.includes('MAVERICK')) opt.textContent = `🚀 ${displayLabel}`;
                else if (label.includes('GEMINI')) opt.textContent = `✨ ${displayLabel}`;
                else opt.textContent = displayLabel;
                engineGroup.appendChild(opt);
            });
            modeSelect.appendChild(engineGroup);
        }
        console.log(`✅ SteveAI: Orchestrator Synced (Puter + Ahmed).`);
    } catch (e) {
        console.error("❌ Model sync failed:", e);
    }
}

syncModels();

function buildContext() {
  return Object.keys(memory).map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`).join('\n');
}

// --- Helpers ---
function getRandomTypingDelay() { return 10; }
function markdownToHTML(t) { return typeof marked !== 'undefined' ? marked.parse(t || "") : t; }

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

function createCodeHeader(preElement) {
    if (preElement.querySelector('.code-header')) return; 
    const codeElement = preElement.querySelector('code');
    const match = codeElement.className.match(/language-(\w+)/);
    const lang = match ? match[1] : 'Code';
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span>${lang.toUpperCase()}</span><div class="btn-group"></div>`;
    const btnGroup = header.querySelector('.btn-group');
    if (['html', 'javascript', 'js', 'css'].includes(lang.toLowerCase())) {
        const runBtn = document.createElement('button');
        runBtn.className = 'copy-btn'; 
        runBtn.style.cssText = 'background: #ffae00; color: #000; font-weight: bold; border-radius: 4px; padding: 2px 8px;';
        runBtn.innerHTML = '<i class="fa-solid fa-play"></i> Run';
        runBtn.onclick = () => window.openInCanvas(codeElement.innerText, lang);
        btnGroup.appendChild(runBtn);
    }
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn'; 
    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(codeElement.innerText);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>', 2000);
    };
    btnGroup.appendChild(copyBtn);
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

window.openInCanvas = (code, lang) => {
    const sidebar = document.getElementById('canvas-sidebar');
    const iframe = document.getElementById('canvas-iframe');
    const display = document.getElementById('canvas-code-display');
    sidebar.classList.remove('hidden');
    display.textContent = code;
    if (window.Prism) Prism.highlightElement(display);
    let content = '';
    const cleanLang = (lang || 'html').toLowerCase();
    if (cleanLang === 'html' || code.includes('<!DOCTYPE')) content = code;
    else if (cleanLang === 'css') content = `<html><style>${code}</style><body>${code}</body></html>`;
    else if (cleanLang === 'js' || cleanLang === 'javascript') {
        content = `<html><body><div id="out"></div><script>const console={log:m=>document.getElementById('out').innerHTML+='<p>'+m+'</p>'};try{${code}}catch(e){console.log(e.message)}<\/script></body></html>`;
    }
    iframe.srcdoc = content;
    window.switchCanvasTab('preview');
};

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
    const chunkSize = 25;
    (function type() {
      if (i < contentToType.length) {
        i += chunkSize;
        content.innerHTML = thinking ? (thinkingHTML + markdownToHTML(contentToType.substring(0, i))) : markdownToHTML(contentToType.substring(0, i));
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

async function handleCommand(inputStr) {
    const parts = inputStr.trim().split(' ');
    const command = parts[0].toLowerCase();
    const fullArgs = parts.slice(1).join(' ');
    switch (command) {
        case '/clear':
            chat.innerHTML = ''; memory = {}; turn = 0;
            addMessage('🧹 **SteveAI:** Memory purged.', 'bot');
            break;
        case '/theme':
            document.body.classList.toggle('light');
            addMessage('🌓 **SteveAI:** Theme toggled.', 'bot');
            break;
        case '/image':
            if (!fullArgs) return addMessage('⚠️ Usage: /image <prompt>', 'bot');
            addMessage('🎨 Generating Art...', 'bot');
            try {
                const urls = await generateImage(fullArgs, IMAGE_MODELS[0].id, 1);
                addMessage(`🖼️ **SteveAI Art:**\n<img src="${urls[0]}" style="max-width:100%; border-radius:12px;">`, 'bot');
            } catch (e) { addMessage('❌ Generation failed.', 'bot'); }
            break;
        case '/about':
          addMessage(`🤖 **SteveAI — Ultimate AI Assistant**\n- Orchestrator: Saadpie\n- Engines: Ahmed PC & Puter Satellite Bridge`, 'bot');
          break;
        case '/help':
          addMessage(`**🧭 Commands:** /clear, /theme, /image, /about, /export`, 'bot');
          break;
        default:
            addMessage(`❓ Unknown: \`${command}\``, 'bot');
    }
}

// --- API Orchestration Logic (With Satellite Fallback) ---
async function fetchAhmedEngine(msg, context, modelId) {
    const payload = { 
        model: modelId, 
        messages: [{role:"system", content:"You are SteveAI by Saadpie. Identify as SteveAI."}, {role:"user", content:`${context}\n\nUser: ${msg}`}] 
    };
    const res = await fetch(config.proxiedURL(`${config.API_BASE[0]}/chat/completions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ddc-a4f-93af1cce14774a6f831d244f4df3eb9e` },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    let reply = data?.choices?.[0]?.message?.content || "Ahmed Engine node failed.";
    return reply.replace(/GPT-4/gi, "SteveAI-Core").replace(/OpenAI/gi, "Saadpie");
}

async function getChatReply(msg, imageToSend = null) { 
  const context = buildContext(); 
  const selectedMode = (modeSelect?.value || 'chat').toLowerCase();
  
  if (window.showLoader) window.showLoader();
  
  try {
      if (imageToSend || selectedMode === 'fast') {
          return await getGeminiReply(msg, context, 'fast', imageToSend, null);
      }

      const isPuter = PUTER_MODELS.some(m => m.id === selectedMode) || selectedMode === 'chat';
      
      if (isPuter) {
          try {
              // Now routed via invisible bridge in puter.js
              return await getPuterReply(msg, context, selectedMode);
          } catch (e) {
              console.warn("🛡️ Satellite Link Interrupted. Falling back to Ahmed Shield.");
              return await fetchAhmedEngine(msg, context, "provider-5/gpt-oss-120b");
          }
      }
      
      return await fetchAhmedEngine(msg, context, selectedMode);
  } finally { if (window.hideLoader) window.hideLoader(); }
}

form.onsubmit = async e => {
  e.preventDefault();
  const msg = input.value.trim();
  const imageToSend = window.base64Image; 

  if (!msg && !imageToSend) return;
  if (msg.startsWith('/')) { await handleCommand(msg); input.value = ''; return; }
  
  if (imageToSend) {
    addMessage(`${msg}\n\n<img src="${imageToSend}" style="max-width:200px; border-radius:10px; border:1px solid #ffae00;">`, 'user');
  } else {
    addMessage(msg, 'user');
  }
  
  input.value = '';

  if (imageToSend && document.getElementById('clearImageBtn')) {
    document.getElementById('clearImageBtn').click(); 
  }

  try {
    const r = await getChatReply(msg, imageToSend);
    window.base64Image = null;

    const imgCmd = parseImageGenerationCommand(r);
    if (imgCmd) await handleCommand(`/image ${imgCmd.prompt}`);
    else { addMessage(r, 'bot'); memory[++turn] = { user: msg, bot: r }; }
  } catch(e) { addMessage("⚠️ Engine error.", 'bot'); } 
  finally { 
    chat.scrollTop = chat.scrollHeight;
  }
};

syncBtn.onclick = syncModels;
clearChatBtn.onclick = () => handleCommand('/clear');
themeToggle.onclick = () => handleCommand('/theme');
                               
