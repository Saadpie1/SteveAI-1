// chat.js
// IMPORTANT: This file relies on 'marked.js' being loaded in your HTML for markdown parsing.

// --- Module Imports ---
import config from './config.js'; 
import { generateImage, IMAGE_MODELS } from './image.js'; 
// NOTE: getGeminiReply now accepts a 5th optional argument: customSystemInstruction
import { getGeminiReply } from './gemini.js'; // <-- Import Gemini logic (for REST/HTTP)
// 🟢 NEW: Import the Live Session Manager (for WSS)
import { startLiveSession } from './gemini-live.js'; // <--- ASSUMES YOU CREATED THIS FILE

// --- Config Variables from Import ---
const API_BASE = config.API_BASE; // Array: [A4F, Gemini]
const PROXY = config.PROXY;
const proxiedURL = config.proxiedURL;
const API_KEYS = config.API_KEYS; // Array of keys

// --- DOM Elements ---
const chat = document.getElementById('chat');
const form = document.getElementById('inputForm');
const input = document.getElementById('messageInput');
const themeToggle = document.getElementById('themeToggle');
const clearChatBtn = document.getElementById('clearChat');
const modeSelect = document.getElementById('modeSelect');
// 🟢 NEW: Elements for Live Mode
const liveToggleBtn = document.getElementById('liveToggleBtn'); // Assuming a dedicated button exists
const liveStatusIndicator = document.getElementById('liveStatus'); // Assuming a status indicator exists

// --- Memory / Summary ---
let memory = {};
let turn = 0;
let memorySummary = "";
const TOKEN_BUDGET = 2200;
const approxTokens = s => Math.ceil((s || "").length / 4);

// 🟢 NEW: Live Session State
let liveSession = null;
let liveIsSpeaking = false;
let liveIsListening = false;
let mediaRecorder = null; // For handling microphone input
let audioChunks = []; // To store microphone data

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

/**
 * Generates a random delay for a more natural, fast typing effect (0ms to 4ms).
 * @returns {number} Random delay in milliseconds.
 */
function getRandomTypingDelay() {
    // Fixed to use valid integer millisecond range for fast, randomized typing
    const minDelay = 0;
    const maxDelay = 4; 
    
    // Formula: Math.floor(Math.random() * (max - min + 1)) + min
    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
}


// --- Summarization ---
async function generateSummary() {
  const raw = memoryString();
  const payload = {
    // NOTE: Using a non-Gemini model here for summarization. 
    // This payload uses the OpenAI format ('messages').
    model: "provider-2/gpt-4o-mini",
    messages: [
      { role: "system", content: "You are SteveAI, made by saadpie and its vice ceo shawaiz. Summarize the following chat context clearly." },
      { role: "user", content: raw }
    ]
  };
  try {
    // NOTE: Summary generation uses the A4F proxy path and OpenAI payload format
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

/**
 * Parses the response for <think> tags and separates the thinking steps from the final answer.
 * @param {string} text - The raw AI response.
 * @returns {{answer: string, thinking: string}}
 */
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

/**
 * Parses the answer for the specific image generation command pattern.
 * @param {string} text - The raw AI answer text.
 * @returns {{prompt: string, model: string} | null}
 */
function parseImageGenerationCommand(text) {
    const commandStart = "Image Generated:";
    
    let cleanText = text.trim()
        .replace(/\n/g, ' ') 
        .replace(/(\*\*|🧠|Reasoning\/Steps)/gi, '')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") 
        .trim();

    if (!cleanText.toLowerCase().startsWith(commandStart.toLowerCase())) {
        return null;
    }
    
    let content = cleanText.substring(commandStart.length).trim();
    
    const commaIndex = content.indexOf(',');
    if (commaIndex === -1) {
        return null;
    }
    
    const modelSegment = content.substring(0, commaIndex).trim();
    if (!modelSegment.toLowerCase().startsWith('model:')) { return null; }
    const model = modelSegment.substring('model:'.length).trim();

    const promptSegment = content.substring(commaIndex + 1).trim();
    if (!promptSegment.toLowerCase().startsWith('prompt:')) { return null; }
    const prompt = promptSegment.substring('prompt:'.length).trim();

    if (!model || !prompt) { return null; }

    return { prompt, model };
}

// --- UI: Add Messages (FIXED: Now only displays content, removed image command detection, added post-processing) ---
function addMessage(text, sender) { // <-- EXPORTED
  const container = document.createElement('div');
  container.className = 'message-container ' + sender;

  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + sender;
  container.appendChild(bubble);

  const content = document.createElement('div');
  content.className = 'bubble-content';
  bubble.appendChild(content);

  const { answer, thinking } = parseThinkingResponse(text);
  
  // --- STANDARD MESSAGE FLOW ---
  const thinkingHTML = thinking ? `
    <details class="thinking-details">
        <summary>🧠 **Reasoning/Steps**</summary>
        <div class="thinking-content">
            ${markdownToHTML(thinking)}
        </div>
    </details>
    <hr class="thinking-divider">
  ` : '';

  const finalFullHTML = thinkingHTML + markdownToHTML(answer);


  if (sender === 'bot') {
    chat.appendChild(container);
    chat.scrollTop = chat.scrollHeight;

    let i = 0, buf = "";
    // When thinking is present, only type out the final answer to avoid markdown conflicts during typing
    const contentToType = thinking ? answer : text;

    (function type() {
      if (i < contentToType.length) {
        buf += contentToType[i++];
        
        let tempHtml;
        if (thinking) {
             let openThinkingHTML = `
                <details class="thinking-details" open>
                    <summary>🧠 **Reasoning/Steps**</summary>
                    <div class="thinking-content">
                        ${markdownToHTML(thinking)}
                    </div>
                </details>
                <hr class="thinking-divider">
             `;
             tempHtml = openThinkingHTML + markdownToHTML(buf);
        } else {
             tempHtml = markdownToHTML(buf);
        }
        
        content.innerHTML = tempHtml;
        chat.scrollTop = chat.scrollHeight;
        // 🟢 FIX: Use window.requestAnimationFrame for smoother typing, especially in Live mode
        // For now, keep setTimeout for compatibility:
        setTimeout(type, getRandomTypingDelay());
      } else {
        // Render final HTML
        content.innerHTML = finalFullHTML; 
        addBotActions(container, bubble, text);
        // 🟢 FIX 1: Call post-processing after final render (for Math and Code)
        if (window.postProcessChat) {
             window.postProcessChat(container);
        }
      }
    })();
  } else {
    content.innerHTML = markdownToHTML(text); 
    chat.appendChild(container);
    chat.scrollTop = chat.scrollHeight;
    addUserActions(container, bubble, text);
    // 🟢 FIX 2: Call post-processing for user message (for Math and Code)
    if (window.postProcessChat) {
        window.postProcessChat(container);
    }
  }
}

// ... (addUserActions and addBotActions remain unchanged)

function addUserActions(container, bubble, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const resend = document.createElement('button');
  resend.className = 'action-btn';
  resend.textContent = '🔁';
  resend.title = 'Resend';
  resend.onclick = () => { input.value = text; input.focus(); };

  const copy = document.createElement('button');
  copy.className = 'action-btn';
  copy.textContent = '📋';
  copy.title = 'Copy';
  copy.onclick = () => navigator.clipboard.writeText(text);

  actions.appendChild(resend);
  actions.appendChild(copy);
  container.appendChild(actions);
}

function addBotActions(container, bubble, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const copy = document.createElement('button');
  copy.className = 'action-btn';
  copy.textContent = '📋';
  copy.title = 'Copy';
  copy.onclick = () => navigator.clipboard.writeText(text); 

  const speak = document.createElement('button');
  speak.className = 'action-btn';
  speak.textContent = '🔊';
  speak.title = 'Speak';
  const { answer } = parseThinkingResponse(text);
  speak.onclick = () => {
    let u = new SpeechSynthesisUtterance(answer);
    speechSynthesis.speak(u);
  };

  actions.appendChild(copy);
  actions.appendChild(speak);
  container.appendChild(actions);
}

// --- Fetch AI (Chat) - NOW ONLY FOR A4F/PROXY (Unchanged) ---
/**
 * Sends the request to the A4F Proxy endpoint.
 * @param {object} payload - The body of the request (OpenAI format).
 * @param {string} model - The model ID being used.
 * @returns {Promise<object>} The successful response data.
 */
async function fetchAI(payload, model) {
    
    // --- Determine API Routing (Always A4F/Proxy) ---
    const a4fBase = config.API_BASE[0]; 

    const urlConfig = { 
        base: a4fBase, 
        urlBuilder: (b, m) => config.proxiedURL(b), 
        requiresBearer: true, 
        name: 'A4F Proxy',
        keySource: 'A4F' 
    };

    let lastErrText = "";
    const baseUrl = urlConfig.urlBuilder(urlConfig.base, model);

    // --- Select Keys ---
    // Use keys from index 1 onwards for A4F Proxy
    let keysToTry = config.API_KEYS.slice(1).filter(key => key);
    if (keysToTry.length === 0) {
        console.warn("A4F Proxy API keys (index 1+) are missing. Skipping attempt.");
        lastErrText = "A4F keys missing from config.";
        // Fall through to error handling if no keys are found
    }
    
    // --- Loop iterates through selected keys ---
    for (const key of keysToTry) {
        try {
            let finalUrl = baseUrl;
            let headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}` // For A4F Proxy
            };

            const res = await fetch(finalUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                
                if (data && data.error) {
                    console.error("A4F Proxy Error Object:", data.error);
                    lastErrText = data.error.message;
                    continue; 
                }
                
                return data; // Success!
            }
            
            lastErrText = await res.text();
            console.error(`A4F Proxy Error Status: ${res.status}. Text: ${lastErrText}`);

        } catch (e) {
            console.error("Network/Fetch Error:", e);
            lastErrText = e.message;
        }
    }
    
    addMessage(`⚠️ SteveAI unreachable. Check keys or proxy. Last Error: ${lastErrText.substring(0, 80)}...`, 'bot');
    throw new Error("All A4F API key attempts failed.");
}

// --- Commands (Unchanged, adding 'live' to changeMode) ---

function toggleTheme() {
  document.body.classList.toggle('light');
  addMessage('🌓 Theme toggled.', 'bot');
}
function clearChat() {
  chat.innerHTML = '';
  memory = {};
  memorySummary = '';
  turn = 0;
  // 🟢 NEW: Stop live session on clear
  if (liveSession) stopLiveSession(true); 
  addMessage('🧹 Chat cleared.', 'bot');
}
function exportChat() {
  const text = memorySummary
    ? `[SUMMARY]\n${memorySummary}\n\n[CHAT LOG]\n${memoryString()}`
    : `[CHAT LOG]\n${memoryString()}`;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SteveAI_Chat_${new Date().toISOString().slice(0,19)}.txt`;
  a.click();
  addMessage('💾 Chat exported as text file.', 'bot');
}
function showContact() {
  const info = `
**📬 Contact SteveAI**
- Creator: [@saadpie](https://github.com/saad-pie)
- vice ceo: [@shawaiz](https://www.instagram.com/shawaiz_ali___16?igsh=MWtyc293ZHI2NGFwOQ==)
- Website: [steve-ai.netlify.app](https://steve-ai.netlify.app)
- Feedback: Use /export to send logs.
  `;
  addMessage(info, 'bot');
}
async function playSummary() {
  addMessage('🎬 Generating chat summary...', 'bot');
  if (!memorySummary) memorySummary = await generateSummary();
  addMessage(`🧠 **Chat Summary:**\n${memorySummary}`, 'bot');
}
function showAbout() {
  const text = `
🤖 **About SteveAI**
Built by *saadpie and shawaiz* — the bot from the future.

- Models: GPT-5-Nano (Alias), DeepSeek-R1, **Gemini-2.5-flash**, Gemini-2.5-flash-lite, **Gemini-Live**, Qwen-3, Ax-4.0, GLM-4.5, Deepseek-v3, Allam-7b, ${IMAGE_MODELS.map(m => m.name).join(', ')}
- Modes: Chat | Reasoning | Fast | **Lite** | **Live** | Math | Korean | **General** | Coding | Arabic
- Features: Context memory, Summarization, Commands, Theme toggle, Speech, Export, **Google Search (Lite Mode)**

_Type /help to explore commands._
  `;
  addMessage(text, 'bot');
}
function changeMode(arg) {
  // 🟢 UPDATED: Added 'live'
  const allowedModes = ['chat', 'reasoning', 'fast', 'lite', 'live', 'math', 'korean', 'general', 'coding', 'arabic'];
  if (!arg || !allowedModes.includes(arg.toLowerCase())) {
    addMessage(`⚙️ Usage: /mode ${allowedModes.join(' | ')}`, 'bot');
    return;
  }
  if (modeSelect) modeSelect.value = arg.toLowerCase();
  // 🟢 NEW: Stop Live session if mode is changed away from 'live'
  if (arg.toLowerCase() !== 'live' && liveSession) {
      stopLiveSession(true);
  }
  addMessage(`🧭 Switched mode to **${arg}**.`, 'bot');
}
function showTime() {
  const now = new Date();
  addMessage(`⏰ Local time: ${now.toLocaleTimeString()}`, 'bot');
}
function showHelp() {
  const modelNames = IMAGE_MODELS.map(m => m.name).join(', ');
  const helpText = `
**🧭 Available Commands**

- /clear — Clears current chat
- /theme — Toggle dark/light mode
- /help — Show this help
- /image <prompt> [model] [n=1] — Generate image(s)
  - Models: ${modelNames}
  - Max Images: 4
- /export — Export chat as .txt
- /contact — Show contact info
- /play — Summarize / replay conversation
- /about — About SteveAI
- /mode <chat|reasoning|fast|lite|**live**|math|korean|general|coding|arabic> — Change mode 
- /time — Show local time
  `;
  addMessage(helpText, 'bot');
}

// --- Command Router (Unchanged) ---
async function handleCommand(cmdOrParsedData) { // <-- EXPORTED
  let command, prompt, model, numImages;
  
  if (typeof cmdOrParsedData === 'string') {
    
    // 🟢 NEW LOGIC: Check if the string is a raw 'Image Generated:' command (from getFastModelAnalysis)
    const imageCommandCheck = parseImageGenerationCommand(cmdOrParsedData);
    
    if (imageCommandCheck) {
        // If it matches the format, convert it to the internal object type and bypass standard string parsing
        command = '/image';
        prompt = imageCommandCheck.prompt;
        // Use the model name to find the ID, falling back to a default if necessary
        const modelObject = IMAGE_MODELS.find(m => m.name.toLowerCase() === imageCommandCheck.model.toLowerCase());
        model = modelObject ? modelObject.id : IMAGE_MODELS[5].id; 
        numImages = 1; // Analysis mode is designed for single-image execution
        
    } else {
        // --- STANDARD STRING COMMAND PARSING (must start with /) ---
        
        const parts = cmdOrParsedData.trim().split(' ');
        command = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (command === '/image') {
          prompt = args.join(' ');
          numImages = 1;
          model = IMAGE_MODELS[5].id;

          const lastArg = args[args.length - 1];
          if (!isNaN(parseInt(lastArg, 10)) && parseInt(lastArg, 10) > 0) {
            numImages = Math.min(4, parseInt(lastArg, 10));
            prompt = args.slice(0, -1).join(' '); 
          }
          
          const modelMatch = IMAGE_MODELS.find(m => prompt.toLowerCase().includes(m.name.toLowerCase()));
          if (modelMatch) {
              model = modelMatch.id;
              const nameRegex = new RegExp(modelMatch.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
              prompt = prompt.replace(nameRegex, '').trim();
          }
        }
    }
  } else if (typeof cmdOrParsedData === 'object' && cmdOrParsedData.type === 'image_auto') {
    // --- INTERNAL OBJECT PARSING (e.g., from form.onsubmit) ---
    command = '/image';
    prompt = cmdOrParsedData.prompt;
    model = cmdOrParsedData.modelId;
    numImages = cmdOrParsedData.numImages; 
  } else {
    // ⚠️ Fallback for unexpected string input (e.g., 'image' without / that failed parsing checks)
    const parts = cmdOrParsedData.trim().split(' ');
    command = parts[0].toLowerCase();
  }


  // --- BEGIN COMMON COMMAND LOGIC ---
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
      if (!prompt) {
        addMessage('⚠️ Usage: /image <prompt> [model name snippet] [n=1-4]', 'bot');
        return;
      }

      const modelNameForDisplay = IMAGE_MODELS.find(m => m.id === model)?.name || model.split('/').pop();
      addMessage(`🎨 Generating **${numImages}** image(s) with **${modelNameForDisplay}** for: *${prompt}* ...`, 'bot');

      try {
        const imageUrls = await generateImage(prompt, model, numImages);

        if (!imageUrls || imageUrls.length === 0) {
          addMessage('⚠️ No images were returned from the server.', 'bot');
          return;
        }

        const imageHTML = imageUrls.map((url, index) => {
            return `
<figure style="margin:5px 0;">
    <img src="${url}" alt="AI Image ${index + 1}" style="max-width:90%;border-radius:10px;margin-top:10px;display:block;margin-left:auto;margin-right:auto;" />
    <figcaption style="font-size:0.8em;text-align:center;">
        🔗 <a href="${url}" target="_blank">${modelNameForDisplay} Image ${index + 1}</a>
    </figcaption>
</figure>
            `;
        }).join('');

        const finalHTML = `
**🖼️ Generated Images:** "${prompt}"
${imageHTML}
        `;

        const container = document.createElement('div');
        container.className = 'message-container bot';

        const bubble = document.createElement('div');
        bubble.className = 'bubble bot';
        container.appendChild(bubble);

        const content = document.createElement('div');
        content.className = 'bubble-content';
        // Note: Image HTML is already formatted, no need to markdownToHTML it again
        content.innerHTML = finalHTML; 
        bubble.appendChild(content);

        chat.appendChild(container);
        chat.scrollTop = chat.scrollHeight;

        addBotActions(container, bubble, finalHTML);
        
        // 🟢 FIX 3: Apply post-processing (copy buttons/etc.) to the generated image block too
        if (window.postProcessChat) {
             window.postProcessChat(container);
        }
      } catch (err) {
        addMessage(`⚠️ Image generation failed: ${err.message}`, 'bot');
      }
      return;
    }

    default: return addMessage(`❓ Unknown command: ${command}`, 'bot');
  }
}

// --- NEW LIVE MODE HANDLERS ---
function setLiveStatus(listening, speaking, message = '') {
    liveIsListening = listening;
    liveIsSpeaking = speaking;
    if (liveStatusIndicator) {
        if (listening) {
            liveStatusIndicator.textContent = '🔊 Listening...';
            liveStatusIndicator.className = 'live-status listening';
        } else if (speaking) {
            liveStatusIndicator.textContent = '🗣️ Speaking...';
            liveStatusIndicator.className = 'live-status speaking';
        } else if (liveSession) {
             liveStatusIndicator.textContent = 'Live Session Active';
             liveStatusIndicator.className = 'live-status active';
        } else {
            liveStatusIndicator.textContent = message || 'Live Mode Ready';
            liveStatusIndicator.className = 'live-status inactive';
        }
    }
}

async function startLiveSession() {
    if (liveSession) return;
    
    // 1. Get Microphone Access (required for Live)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 2. Initialize Media Recorder (for browser audio input)
        // NOTE: This is a simplified way to capture audio. For real-time streaming, 
        // a dedicated AudioWorklet/Processor is better to get raw PCM data.
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        // 3. Start WebSocket Session
        liveSession = startLiveSession(
            (content) => { 
                // onMessage callback from gemini-live.js
                // Content can contain text, audio, or tool calls
                if (content.text) {
                    addMessage(content.text, 'bot');
                }
                if (content.audio && window.playAudio) {
                    // Assuming you have a helper function to play streamed audio
                    window.playAudio(content.audio);
                    setLiveStatus(false, true); 
                }
                if (content.turnComplete) {
                    setLiveStatus(true, false); // Go back to listening after turn
                }
            },
            (errorMsg) => {
                // onError callback
                addMessage(`❌ Live Session Error: ${errorMsg}`, 'bot');
                stopLiveSession(false);
            }
        );

        // 4. Start recording user input on open
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
             // In a simple setup, you'd send the blob and then clear chunks. 
             // In a real Live app, you'd stream chunks continuously.
             const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
             audioChunks = [];
             // NOTE: Live API expects raw PCM (16-bit) data, not webm blob. 
             // This is a placeholder for the more complex streaming logic.
             // liveSession.sendRealtimeInput(audioBlob); 
        };
        
        mediaRecorder.start(250); // Record every 250ms (for simplified chunking)

        addMessage('🎙️ **Live Mode Activated.** Click the mic button to speak, or type a message.', 'bot');
        setLiveStatus(true, false);
        liveToggleBtn.classList.add('active');
        
    } catch (e) {
        addMessage(`⚠️ Failed to start Live Mode: Microphone access denied or network error.`, 'bot');
        liveSession = null;
        liveToggleBtn.classList.remove('active');
        console.error("Live Start Error:", e);
    }
}

function stopLiveSession(silent = false) {
    if (liveSession) {
        liveSession.closeSession();
        liveSession = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    mediaRecorder = null;
    audioChunks = [];
    liveToggleBtn.classList.remove('active');
    setLiveStatus(false, false);
    if (!silent) {
        addMessage('⏸️ **Live Mode Deactivated.**', 'bot');
    }
}

liveToggleBtn.onclick = () => {
    if (liveSession) {
        stopLiveSession();
    } else {
        startLiveSession();
    }
};

// --- NEW INTERNAL HELPER FOR IMAGE ANALYSIS (Unchanged) ---
/**
 * Executes a hidden, one-shot call to the fast model to analyze the image/prompt
 * and return the final image generation command string.
 * @param {string} msg - The user's original message.
 * @param {string} imageToSend - The Base64 image data string.
 * @returns {Promise<string>} The raw 'Image Generated:model:...' command string.
 */
async function getFastModelAnalysis(msg, imageToSend) {
    const analysisMode = 'fast'; 
    
    // System instruction to force the model to be a prompt engineer and output ONLY the command.
    const analysisSystemInstruction = `You are a hidden, advanced image analysis and prompt engineering engine for SteveAI.
    A user has provided an image and the following request: "${msg}".
    
    Your task is to analyze the image and the user's request. You MUST output ONLY the final, detailed, and highly specific image generation command string. 
    
    DO NOT output any thinking, greetings, or conversational text. Your sole output must be in the exact command format: 
    Image Generated:model:Imagen 4 (Original),prompt:VERY DETAILED AND SPECIFIC PROMPT TEXT
    
    The prompt text you generate must be extremely descriptive of the desired image or edit, referencing the provided image's content and the user's request (e.g., adding a hat, changing the lighting, etc.). Use "Imagen 4 (Original)" as the model name.`;

    // The context is empty ("") because we don't need chat history for this one-shot analysis.
    // We pass the customSystemInstruction to the now-updated getGeminiReply.
    return getGeminiReply(msg, "", analysisMode, imageToSend, analysisSystemInstruction);
}
// ----------------------------------------------

/**
 * Checks if the message is clearly requesting an image generation or edit. (Unchanged)
 * @param {string} msg - The user's message.
 * @returns {boolean} True if keywords for generation are present.
 */
function isImageGenerationRequest(msg) {
    if (!msg) return false;
    const lowerMsg = msg.toLowerCase();
    
    // Keywords from gemini.js Rule 2: generate, create, make, show (in context of creation), edit.
    const keywords = ['generate', 'create', 'make', 'show me', 'edit', 'remix', 'draw', 'paint'];
    return keywords.some(keyword => lowerMsg.includes(keyword));
}

// --- Chat Flow (UPDATED: Centralized image command return) ---
async function getChatReply(msg) { // <-- EXPORTED
  const context = await buildContext();
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  
  let model;
  let botName;
  let reply = ""; 
  
  const imageToSend = window.base64Image;

  // 1. Show the loader immediately
  if (window.showLoader) {
      window.showLoader();
  }
  
  try {
      // 2. Determine Model and API Type
      
      // 🟢 NEW: CHECK FOR LIVE MODE FIRST (Live mode uses its own handlers, manual text input sends a message via WSS)
      if (liveSession) {
          addMessage('Live session active. Sending message via WebSocket...', 'bot');
          // In a real implementation, this would send the text chunk to the WSS:
          // liveSession.sendRealtimeInput({ client_content: msg }); 
          // For now, return a placeholder:
          reply = `<think>Routing text input via active Live WebSocket session...</think> Live API text input not fully implemented yet, but the session is running!`;
          return reply;
      }
      // -----------------------------------------------------------
      
      // 🟢 CRITICAL: IF IMAGE IS PRESENT, check for GENERATION intent
      if (imageToSend) {
          
          const isGeneration = isImageGenerationRequest(msg);

          if (isGeneration) {
              // --- 2a. IMAGE GENERATION/EDITING FLOW (Force Command) ---
              if (mode !== 'fast') {
                  // Temporarily switch for the analysis call
                  modeSelect.value = 'fast'; 
                  addMessage(`📷 Image detected. Mode temporarily switched to **SteveAI-fast** for multi-modal processing.`, 'bot');
              }
              
              // A. Call the hidden analysis model (FORCES command output)
              const finalImageCommand = await getFastModelAnalysis(msg, imageToSend);
              
              // B. RETURN THE RAW COMMAND STRING. form.onsubmit will execute it.
              return finalImageCommand; 
              
          } else {
              // --- 2b. IMAGE ANALYSIS/DISCUSSION FLOW (Standard Gemini Flow) ---
              // User attached image but no generation keywords.
              
              if (mode !== 'fast' && mode !== 'lite') {
                   modeSelect.value = 'fast'; 
                   addMessage(`📷 Image detected. Mode temporarily switched to **SteveAI-fast** for image analysis.`, 'bot');
              }
              
              // Use standard getGeminiReply. Pass the image.
              reply = await getGeminiReply(msg, context, modeSelect.value, imageToSend, null);
          }
      } 
      // ----------------------------------------------------------------------


      if ((mode === 'lite' || mode === 'fast') && !imageToSend) {
          // --- GEMINI FLOW (TEXT ONLY) ---
          
          try {
              reply = await getGeminiReply(msg, context, mode, null); 
              
          } catch (e) {
              addMessage(`⚠️ **Gemini Error:** ${e.message}`, 'bot');
              throw e; 
          }
      } else if (!imageToSend && mode !== 'live') { // 🟢 UPDATED: Exclude 'live' mode from this block
          // --- A4F/OPENAI FLOW (Non-Gemini modes, text only) ---
          
          switch (mode) {
            case 'chat': 
            default:
              model = "provider-5/gpt-5-nano"; 
              botName = "SteveAI-chat";
              break;
            case 'math':
              model = "provider-1/qwen3-235b-a22b-instruct-2507";
              botName = "SteveAI-math";
              break;
            case 'korean':
              model = "provider-1/ax-4.0";
              botName = "SteveAI-Korean";
              break;
            case 'general': 
              model = "provider-3/glm-4.5-free"; 
              botName = "SteveAI-general";
              break;
            case 'coding':
              model = "provider-1/deepseek-v3-0324";
              botName = "SteveAI-coding";
              break;
            case 'arabic':
              model = "provider-1/allam-7b-instruct-preview";
              botName = "SteveAI-Arabic";
              break;
            case 'reasoning': 
              model = "provider-1/deepseek-r1-0528";
              botName = "SteveAI-reasoning";
              break;
          }
          
          const imageModelNames = IMAGE_MODELS.map(m => m.name).join(', ');

          // 3. System Prompt Construction (for A4F/OpenAI models)
          const systemPrompt = `You are ${botName}, made by saadpie and vice ceo shawaiz ali yasin. You enjoy getting previous conversation. 

          1. **Reasoning:** You must always output your reasoning steps inside <think> tags, followed by the final answer, UNLESS an image is being generated.
          2. **Image Generation:** If the user asks you to *generate*, *create*, or *show* an image, you must reply with **ONLY** the following exact pattern. **DO NOT add any greetings, explanations, emojis, periods, newlines, or follow-up text whatsoever.** Your output must be the single, raw command string: 
             Image Generated:model:model name,prompt:prompt text
             Available image models: ${imageModelNames}. Use the most relevant model name in your response.`;
          
          // 4. Payload Construction (A4F/OpenAI format)
          const payload = {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              // The user content includes the full history/context and the new message.
              { role: "user", content: `${context}\n\nUser: ${msg}` } 
            ],
          };

          // 5. Fetch and Parse Response
          const data = await fetchAI(payload, model);
          
          reply = data?.choices?.[0]?.message?.content || "No response.";
      }

      // 6. Return reply (could be text or a raw command string)
      return reply;

  } catch (e) {
      addMessage(`⚠️ **Critical Error:** ${e.message}`, 'bot');
      throw e; 
  } finally {
      // 7. Hide the loader always
      if (window.hideLoader) {
          window.hideLoader();
      }
      // ⚠️ Note: Image cleanup is now handled in form.onsubmit/finally
  }
}

// --- Form Submit (UPDATED: Handles image command string detection and centralized cleanup) ---
form.onsubmit = async e => {
  e.preventDefault();
  const msg = input.value.trim();
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  
  // 📸 Allow sending an image without text
  if (!msg && !window.base64Image) {
      // 🟢 NEW: If Live mode is active and no text is present, assume user intends to speak/use voice
      if (mode === 'live' && liveSession) {
          // This would be where you trigger mic listening if it wasn't automatic
          addMessage('🎙️ Please speak now, Live session is active.', 'bot');
          return;
      }
      return; 
  }
  
  // 1. Handle explicit commands first (e.g., /clear)
  if (msg.startsWith('/')) {
    await handleCommand(msg);
    input.value = '';
    input.style.height = 'auto';
    return;
  }
  
  // 2. Show user message
  addMessage(msg, 'user');
  input.value = '';
  input.style.height = 'auto';
  
  // Store the state before the reply
  const wasImageAttached = !!window.base64Image;
  const originalMode = modeSelect.value;
  
  try {
    const r = await getChatReply(msg);
    
    // 3. Check if the reply is a raw Image Generation Command
    const imageCommand = parseImageGenerationCommand(r);

    if (imageCommand) {
        // --- IMAGE GENERATION DETECTED ---
        
        // 3a. Execute the resulting image command
        await handleCommand({
            type: 'image_auto',
            prompt: imageCommand.prompt,
            modelId: IMAGE_MODELS.find(m => m.name.toLowerCase() === imageCommand.model.toLowerCase())?.id || IMAGE_MODELS[5].id, 
            numImages: 1 
        });
        
        // 3b. Memory: Record the turn with the user prompt and the raw command string
        // Note: The bot's output is the raw command string, which is key for tracking the decision.
        memory[++turn] = { user: msg, bot: r };
        
    } else {
        // --- STANDARD TEXT REPLY ---
        
        // 3a. Display the text reply
        addMessage(r, 'bot');
        
        // 3b. Record memory
        memory[++turn] = { user: msg, bot: r };
    }
  } catch (e) {
    console.error("Chat flow failed:", e);
    // Error message already displayed in getChatReply or fetchAI
  } finally {
      // 4. Cleanup Image State (CRITICAL FIX)
      if (wasImageAttached && window.clearImageBtn) {
          window.clearImageBtn.click();
          // Restore mode if it was temporarily switched for image processing
          if (modeSelect.value === 'fast' && originalMode !== 'fast') {
               modeSelect.value = originalMode;
               addMessage(`⚙️ Restored mode to **${originalMode}**.`, 'bot');
          }
      }
  }
};

// --- Input Auto Resize (Unchanged) ---
input.oninput = () => {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
};

// --- Theme Toggle (Unchanged) ---
themeToggle.onclick = () => toggleTheme();

// --- Clear Chat (Unchanged) ---
clearChatBtn.onclick = () => clearChat();

// =========================================================================
// --- EXPORTS for external access (e.g., from main.js) ---
// =========================================================================
export { 
  memory, 
  memorySummary, 
  turn, 
  getChatReply, 
  addMessage, 
  handleCommand,
  // 🟢 NEW: Export Live helpers
  startLiveSession,
  stopLiveSession,
  liveSession
};
