/**
 * SteveAI Orchestrator v2.9
 * FIX: Programmatic Guest Creation & Redirect Shield
 */

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const modelSelector = document.getElementById('model-selector');

let conversationHistory = JSON.parse(localStorage.getItem('steve_session')) || [
    { role: "system", content: "You are SteveAI by Saadpie. Multi-Modal Orchestrator v2.9." }
];

// --- 1. THE REDIRECT SHIELD & GUEST INIT ---
async function ensureGuestAccess() {
    if (!puter.auth.isSignedIn()) {
        console.log("SteveAI: Creating/Renewing Temporary Guest Session...");
        try {
            // This is the 2025 'Magic' call: It attempts to create a temp user 
            // without showing a popup if possible, or using an iframe.
            await puter.auth.signIn({ attempt_temp_user_creation: true });
        } catch (e) {
            console.warn("Guest creation silent block. Standard sign-in might be required.");
        }
    }
}

// Run guest init as soon as Puter is ready
ensureGuestAccess();

window.onload = () => {
    conversationHistory.forEach(m => { if(m.role !== 'system') addBubble(m.content, m.role === 'user'); });
};

// UI: Message Bubbles
function addBubble(content, isUser = false) {
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'user' : 'ai'}`;
    if (content instanceof HTMLElement) div.appendChild(content);
    else div.innerText = content || "...";
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
}

// SILENT RESET: Forces Puter to generate a brand new Guest Identity in Cookies
async function rotateIdentity() {
    await puter.auth.signOut();
    // Re-trigger the guest creation flow
    await ensureGuestAccess();
}

async function streamChat() {
    const prompt = userInput.value.trim();
    const model = modelSelector.value;
    
    // FIX: Pre-check model name safely
    if (!prompt || !model) return;

    addBubble(prompt, true);
    conversationHistory.push({ role: "user", content: prompt });
    userInput.value = "";

    const aiBubble = addBubble("Establishing Link...");
    let fullAiResponse = "";

    try {
        // Ensure we have a valid session before the AI call
        await ensureGuestAccess();

        // --- MEDIA ROUTING ---
        if (model === 'sora-2') {
            aiBubble.innerText = "Sora 2 Generating (est. 45s)...";
            const video = await puter.ai.txt2vid(prompt, { model: 'sora-2', seconds: 4 });
            aiBubble.innerText = "Sora 2 Generation Complete:";
            video.controls = video.autoplay = true;
            aiBubble.appendChild(video);
            return;
        }

        if (model.toLowerCase().includes('flux') || model.toLowerCase().includes('image')) {
            const img = await puter.ai.txt2img(prompt, { model: model });
            aiBubble.innerText = "Generation Success:";
            aiBubble.appendChild(img);
            return;
        }

        // --- CHAT ROUTING ---
        const response = await puter.ai.chat(conversationHistory, { model: model, stream: true });

        // Safeguard against the 'Unauthorized' redirect block
        if (!response || typeof response[Symbol.asyncIterator] !== 'function') {
            throw new Error("RE_AUTH_REQUIRED");
        }

        aiBubble.innerText = ""; 
        for await (const part of response) {
            const chunk = part?.text || part?.message?.content || "";
            if (chunk) {
                fullAiResponse += chunk;
                aiBubble.innerText = fullAiResponse;
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
        }
        
        conversationHistory.push({ role: "assistant", content: fullAiResponse });
        localStorage.setItem('steve_session', JSON.stringify(conversationHistory));

    } catch (err) {
        console.error("SteveAI Error:", err);
        const msg = (err?.message || String(err)).toLowerCase();

        // If Sora/GPT-5 is blocked, rotate identity silently
        if (msg.includes("unauthorized") || msg.includes("auth") || msg.includes("limit")) {
            aiBubble.innerText = "♻️ Session Refreshed. Please try your request again.";
            await rotateIdentity();
        } else {
            aiBubble.innerText = "Backend Note: " + msg;
        }
    }
}

sendBtn.onclick = streamChat;
userInput.onkeypress = (e) => { if (e.key === 'Enter') streamChat(); };
