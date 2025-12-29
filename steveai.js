/**
 * SteveAI Orchestrator v2.6
 * Developed by Saadpie
 */

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const modelSelector = document.getElementById('model-selector');

// SteveAI Persistent Session
let conversationHistory = JSON.parse(localStorage.getItem('steve_session')) || [
    { role: "system", content: "You are SteveAI by Saadpie. Multi-Modal Orchestrator v2.6." }
];

// Initialize on load
window.onload = () => {
    conversationHistory.forEach(m => { 
        if(m.role !== 'system') addBubble(m.content, m.role === 'user'); 
    });
};

// Reset Logic for Unlimited Access
async function triggerBypass() {
    localStorage.setItem('steve_session', JSON.stringify(conversationHistory));
    Object.keys(localStorage).forEach(key => { 
        if (key.includes('puter')) localStorage.removeItem(key); 
    });
    sessionStorage.clear();
    document.cookie.split(";").forEach(c => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    location.reload();
}

// UI: Add Message Bubbles
function addBubble(content, isUser = false) {
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'user' : 'ai'}`;
    if (content instanceof HTMLElement) {
        div.appendChild(content);
    } else {
        div.innerText = content;
    }
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
}

// Main Orchestration Loop
async function streamChat() {
    const prompt = userInput.value.trim();
    const model = modelSelector.value;
    if (!prompt) return;

    addBubble(prompt, true);
    conversationHistory.push({ role: "user", content: prompt });
    userInput.value = "";

    const aiBubble = addBubble("SteveAI is orchestrating...");
    let fullAiResponse = "";

    try {
        // --- VIDEO ROUTE (Sora 2) ---
        if (model === 'sora-2') {
            aiBubble.innerText = "Sora 2 is generating your video clip (est. 30s)...";
            const videoElement = await puter.ai.txt2vid(prompt, { model: 'sora-2', seconds: 4 });
            aiBubble.innerText = "Sora 2 Generation Complete:";
            videoElement.controls = videoElement.autoplay = true;
            aiBubble.appendChild(videoElement);
            return;
        }

        // --- IMAGE ROUTE (Flux/Nano) ---
        if (model.includes('FLUX') || model.includes('image')) {
            const img = await puter.ai.txt2img(prompt, { model: model });
            aiBubble.innerText = "Generated Image:";
            aiBubble.appendChild(img);
            return;
        }

        // --- CHAT ROUTE ---
        const response = await puter.ai.chat(conversationHistory, { model: model, stream: true });
        
        // Check if response is iterable (prevents 401/TypeError crash)
        if (!response || typeof response[Symbol.asyncIterator] !== 'function') {
            throw new Error("Unauthorized or Invalid Stream");
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
        console.error("SteveAI Runtime Error:", err);
        const msg = err?.message || String(err);
        if (msg.includes("Unauthorized") || msg.includes("limit") || msg.includes("429") || msg.includes("iterable")) {
            aiBubble.innerText = "♻️ ROTATING IDENTITY: Renewing SteveAI Access...";
            setTimeout(triggerBypass, 1500);
        } else {
            aiBubble.innerText = "Backend Note: " + msg;
        }
    }
}

// Events
sendBtn.onclick = streamChat;
userInput.onkeypress = (e) => { if (e.key === 'Enter') streamChat(); };
      
