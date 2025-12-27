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

// --- Memory Management ---
let memory = {};
let turn = 0;

function buildContext() {
  return Object.keys(memory)
    .map(k => `User: ${memory[k].user}\nBot: ${memory[k].bot}`)
    .join('\n');
}

// --- Helpers ---
function getRandomTypingDelay() { return 10; }
function markdownToHTML(t) { return typeof marked !== 'undefined' ? marked.parse(t || "") : t; }

// --- Action Button Logic ---
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

// --- Message Parsers ---
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

// --- Canvas Integration ---
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
    else if (cleanLang === 'css') content = `<html><style>${code}</style><body><div class="preview"><h1>CSS Preview</h1></div></body></html>`;
    else if (cleanLang === 'js' || cleanLang === 'javascript') {
        content = `<html><body><div id="out"></div><script>
            const console = { log: m => document.getElementById('out').innerHTML += '<p>'+m+'</p>' };
            try { ${code} } catch(e) { console.log(e.message); }
        <\/script></body></html>`;
    }
    iframe.srcdoc = content;
    window.switchCanvasTab('preview');
};

// --- UI Messaging ---
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
    const fullArgs = parts.slice(1).join(' ');

    switch (command) {
        case '/clear':
            chat.innerHTML = ''; memory = {}; turn = 0;
            addMessage('🧹 **SteveAI:** Memory purged. Ahmed\'s RAM is now clean.', 'bot');
            break;
        case '/theme':
            document.body.classList.toggle('light');
            addMessage('🌓 **SteveAI:** UI visual mode toggled.', 'bot');
            break;
        case '/help':
            addMessage(`**🧭 SteveAI Command Menu**\n- \`/clear\` — Wipe memory\n- \`/theme\` — Toggle mode\n- \`/image <prompt>\` — AI Art\n- \`/mode <type>\` — Switch model\n- \`/export\` — Save chat\n- \`/about\` — System info`, 'bot');
            break;
        case '/export':
            const chatText = Array.from(document.querySelectorAll('.bubble-content'))
                .map(el => el.innerText).join('\n\n---\n\n');
            const blob = new Blob([chatText], {type:'text/plain'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); 
            a.download = `SteveAI_History.txt`; a.click();
            addMessage('💾 **SteveAI:** History saved to local storage.', 'bot');
            break;
        case '/about':
          addMessage(`🤖 **SteveAI — Ultimate AI Assistant**\n- **Orchestrator:** Saadpie\n- **Engine:** Ahmed Aftab (16GB RAM)\n- **Status:** High Performance Active`, 'bot');
          break;
        case '/image':
            if (!fullArgs) return addMessage('⚠️ Usage: /image <prompt>', 'bot');
            addMessage('🎨 Generating high-fidelity art...', 'bot');
            try {
                const urls = await generateImage(fullArgs, IMAGE_MODELS[0].id, 1);
                const html = urls.map(u => `<img src="${u}" style="max-width:100%; border-radius:12px; margin-top:10px; border: 1px solid #333;">`).join('');
                addMessage(`🖼️ **SteveAI Art:**\n${html}`, 'bot');
            } catch (e) { addMessage('❌ Image generation failed.', 'bot'); }
            break;
        default:
            addMessage(`❓ Unknown command: \`${command}\``, 'bot');
    }
}

// --- API Fetching ---
async function fetchAI(payload) {
    const a4fBase = config.API_BASE[0]; 
    const finalUrl = config.proxiedURL(`${a4fBase}/chat/completions`);
    // Iterates through keys for high availability
    for (const key of config.API_KEYS) {
        try {
            const res = await fetch(finalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) return await res.json();
        } catch (e) { continue; }
    }
    throw new Error("Connectivity issues with Ahmed's engine.");
}

// --- Orchestration Logic ---
async function getChatReply(msg) { 
  const context = buildContext(); 
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  const imageToSend = window.base64Image;
  if (window.showLoader) window.showLoader();
  
  try {
      if (imageToSend) return await getGeminiReply(msg, context, 'fast', imageToSend, null);
      if (mode === 'lite' || mode === 'fast') return await getGeminiReply(msg, context, mode, null);

      let model;
      switch (mode) {
        case 'science': model = "provider-1/qwen3-next-80b-a3b-thinking"; break;
        case 'math': 
        case 'coding': model = "provider-8/mimo-v2-flash"; break;
        case 'reasoning': model = "provider-5/deepseek-r1-0528-fast"; break;
        default: model = "provider-5/gpt-oss-120b"; break;
      }

      const system = `You are SteveAI by Saadpie. Powered by Ahmed Aftab's PC. If generating images, use syntax: Image Generated:model:Imagen 4 (Original),prompt:PROMPT`;
      const payload = { model, messages: [{role:"system", content:system}, {role:"user", content:`${context}\n\nUser: ${msg}`}] };
      const data = await fetchAI(payload);
      return data?.choices?.[0]?.message?.content || "No response received.";
  } finally { if (window.hideLoader) window.hideLoader(); }
}

// --- Event Bindings ---
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
        memory[++turn] = { user: msg, bot: `Generated image for prompt: ${imgCmd.prompt}` };
    } else {
        addMessage(r, 'bot');
        memory[++turn] = { user: msg, bot: r };
    }
  } catch(e) { 
      console.error(e);
      addMessage("⚠️ System error. Check Ahmed's server status.", 'bot');
  } 
  finally { if (wasImage && document.getElementById('clearImageBtn')) document.getElementById('clearImageBtn').click(); }
};

themeToggle.onclick = () => handleCommand('/theme');
clearChatBtn.onclick = () => handleCommand('/clear');
