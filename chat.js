// chat.js
// IMPORTANT: This file relies on 'marked.js' being loaded in your HTML for markdown parsing.

// --- Module Imports ---
import config from './config.js'; 
import { generateImage, IMAGE_MODELS } from './image.js'; 
// NOTE: getGeminiReply now accepts a 5th optional argument: customSystemInstruction
import { getGeminiReply } from './gemini.js'; // <-- Import Gemini logic

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
    const promptSegment = content.substring(commaIndex + 1).trim();

    if (!modelSegment.toLowerCase().startsWith('model:')) { return null; }
    const model = modelSegment.substring('model:'.length).trim();

    if (!promptSegment.toLowerCase().startsWith('prompt:')) { return null; }
    const prompt = promptSegment.substring('prompt:'.length).trim();

    if (!model || !prompt) { return null; }

    return { prompt, model };
}

// --- UI: Add Messages (Fixed for image generation command and typing speed) ---
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
  const imageCommand = parseImageGenerationCommand(answer);
  
  if (sender === 'bot' && imageCommand) {
    // ⚠️ CRITICAL CHANGE: DO NOT record image command output in memory if it was auto-generated by analysis.
    // The user's original vague prompt is recorded in `form.onsubmit` or here if the reply was a command.
    
    // We only record the final command if it was generated as part of a standard chat turn 
    // (i.e., not a hidden analysis step). Since the analysis step bypasses this function,
    // we assume if we hit this, it was a regular command.
    memory[++turn] = { user: input.value.trim(), bot: text };

    const cleanPrompt = imageCommand.prompt;
    const cleanModelName = imageCommand.model; 

    const modelObject = IMAGE_MODELS.find(m => m.name.toLowerCase() === cleanModelName.toLowerCase());
    const modelId = modelObject ? modelObject.id : IMAGE_MODELS[5].id; 

    handleCommand({
      type: 'image_auto',
      prompt: cleanPrompt,
      modelId: modelId,
      numImages: 1 
    }); 
    
    return;
  }

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
        setTimeout(type, getRandomTypingDelay());
      } else {
        content.innerHTML = finalFullHTML; 
        addBotActions(container, bubble, text);
      }
    })();
  } else {
    content.innerHTML = markdownToHTML(text); 
    chat.appendChild(container);
    chat.scrollTop = chat.scrollHeight;
    addUserActions(container, bubble, text);
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

// --- Fetch AI (Chat) - NOW ONLY FOR A4F/PROXY ---
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

// --- Commands (Unchanged) ---
// ... (All command functions remain unchanged) ...

function toggleTheme() {
  document.body.classList.toggle('light');
  addMessage('🌓 Theme toggled.', 'bot');
}
function clearChat() {
  chat.innerHTML = '';
  memory = {};
  memorySummary = '';
  turn = 0;
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

- Models: GPT-5-Nano (Alias), DeepSeek-R1, **Gemini-2.5-flash**, Gemini-2.5-flash-lite, Qwen-3, Ax-4.0, GLM-4.5, Deepseek-v3, Allam-7b, ${IMAGE_MODELS.map(m => m.name).join(', ')}
- Modes: Chat | Reasoning | Fast | **Lite** | Math | Korean | **General** | Coding | Arabic
- Features: Context memory, Summarization, Commands, Theme toggle, Speech, Export, **Google Search (Lite Mode)**

_Type /help to explore commands._
  `;
  addMessage(text, 'bot');
}
function changeMode(arg) {
  const allowedModes = ['chat', 'reasoning', 'fast', 'lite', 'math', 'korean', 'general', 'coding', 'arabic'];
  if (!arg || !allowedModes.includes(arg.toLowerCase())) {
    addMessage(`⚙️ Usage: /mode ${allowedModes.join(' | ')}`, 'bot');
    return;
  }
  if (modeSelect) modeSelect.value = arg.toLowerCase();
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
- /mode <chat|reasoning|fast|lite|math|korean|general|coding|arabic> — Change mode 
- /time — Show local time
  `;
  addMessage(helpText, 'bot');
}

// --- Command Router (Updated for Image Command String Check) ---
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
    // --- INTERNAL OBJECT PARSING (e.g., from addMessage) ---
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
        content.innerHTML = markdownToHTML(finalHTML);
        bubble.appendChild(content);

        chat.appendChild(container);
        chat.scrollTop = chat.scrollHeight;

        addBotActions(container, bubble, finalHTML);
      } catch (err) {
        addMessage(`⚠️ Image generation failed: ${err.message}`, 'bot');
      }
      return;
    }

    default: return addMessage(`❓ Unknown command: ${command}`, 'bot');
  }
}

// --- NEW INTERNAL HELPER FOR IMAGE ANALYSIS ---
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


// --- Chat Flow (FINAL ROUTING VERSION - UPDATED) ---
async function getChatReply(msg) { // <-- EXPORTED
  const context = await buildContext();
  // Get the mode from the dropdown (which might be overridden below)
  const mode = (modeSelect?.value || 'chat').toLowerCase();
  
  let model;
  let botName;
  let reply = ""; 

  // 1. Show the loader immediately
  if (window.showLoader) {
      window.showLoader();
  }
  
  try {
      // 2. Determine Model and API Type
      const imageToSend = window.base64Image;

      // 🟢 CRITICAL: IF IMAGE IS PRESENT, BYPASS CHAT FLOW AND EXECUTE INTERNAL ANALYSIS
      if (imageToSend) {
          if (mode !== 'fast') {
              // This is a safety check; form.onsubmit should handle the mode switch.
              modeSelect.value = 'fast'; 
              addMessage(`📷 Image detected. Mode temporarily switched to **SteveAI-fast** for multi-modal processing.`, 'bot');
          }
          
          // A. Call the hidden analysis model
          const finalImageCommand = await getFastModelAnalysis(msg, imageToSend);
          
          // B. Execute the resulting command directly (which calls handleCommand)
          // We do NOT add the model's analysis output (the command string) to the UI.
          handleCommand(finalImageCommand); 
          
          // C. Clean up and return early to stop the chat flow.
          if (window.clearImageBtn) {
               window.clearImageBtn.click();
               // Restore mode after image processing
               if (modeSelect.value === 'fast') {
                    modeSelect.value = 'chat';
               }
          }
          
          // Return a non-chat message to the outer try/catch/finally block
          return "IMAGE_GENERATION_EXECUTED"; 
      } 
      // ----------------------------------------------------------------------


      if (mode === 'lite' || mode === 'fast') {
          // --- GEMINI FLOW (TEXT ONLY) ---
          
          try {
              // Pass message, context, mode. imageToSend is null here.
              // Note: customSystemInstruction is null by default.
              reply = await getGeminiReply(msg, context, mode, null); 
              
          } catch (e) {
              addMessage(`⚠️ **Gemini Error:** ${e.message}`, 'bot');
              throw e; 
          }
      } else {
          // --- A4F/OPENAI FLOW (Non-Gemini modes) ---
          
          // No image check needed here, as it's handled above.

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

      // 6. Common Success Logic (for text replies only)
      memory[++turn] = { user: msg, bot: reply };
      return reply;

  } catch (e) {
      // ⚠️ IMPORTANT: If image generation was executed, do not show an error here.
      if (e.message === "IMAGE_GENERATION_EXECUTED") {
          return; // Stop the flow silently.
      }
      
      // If the error was not already displayed, display it here.
      if (e && !e.message.includes('Gemini Error:') && !e.message.includes('Image processing mode mismatch')) { 
          addMessage(`⚠️ **Critical Error:** ${e.message}`, 'bot');
      }
      throw e; // Re-throw the error
  } finally {
      // 7. Hide the loader always
      if (window.hideLoader) {
          window.hideLoader();
      }
  }
}

// --- Form Submit (Updated for Mode Override) ---
form.onsubmit = async e => {
  e.preventDefault();
  const msg = input.value.trim();
  
  // 📸 Allow sending an image without text
  if (!msg && !window.base64Image) return; 
  
  // 🟢 NEW LOGIC: Override mode if an image is attached
  if (window.base64Image) {
    const currentMode = modeSelect.value.trim().toLowerCase();
    
    // Only override if the current mode isn't already 'fast'
    if (currentMode !== 'fast') {
        modeSelect.value = 'fast'; 
        addMessage(`📷 Image detected. Mode temporarily switched to **SteveAI-fast** for multi-modal processing.`, 'bot');
    }
  }
  
  if (msg.startsWith('/')) {
    await handleCommand(msg);
    input.value = '';
    input.style.height = 'auto';
    return;
  }
  
  // 📸 Show message in UI immediately before getting reply
  addMessage(msg, 'user');
  input.value = '';
  input.style.height = 'auto';
  
  try {
    const r = await getChatReply(msg);
    // ⚠️ CRITICAL: Only add bot reply if it wasn't an internal image execution flag
    if (r !== "IMAGE_GENERATION_EXECUTED") {
        addMessage(r, 'bot');
    }
  } catch {
    console.warn("Chat reply failed, error message already displayed or silent failure.");
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
  handleCommand 
};
