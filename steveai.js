/**
 * SteveAI Orchestrator v2.8
 * FIX: 'includes' Crash & Redirect Mitigation
 */

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const modelSelector = document.getElementById('model-selector');

// SteveAI Memory
let conversationHistory = JSON.parse(localStorage.getItem('steve_session')) || [
    { role: "system", content: "You are SteveAI by Saadpie. Multi-Modal Orchestrator v2.8." }
];

window.onload = () => {
    conversationHistory.forEach(m => { if(m.role !== 'system') addBubble(m.content, m.role === 'user'); });
};

// UI: Message Bubbles
function addBubble(content, isUser = false) {
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'user' : 'ai'}`;
    if (content instanceof HTMLElement) div.appendChild(content);
    else div.innerText = content;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
}

// SILENT RESET: Wipes session without refreshing the whole page
async function silentReset() {
    await puter.auth.signOut();
    localStorage.removeItem('puter_guest_id'); // Targets specific Puter identifiers
    sessionStorage.clear();
    const note = addBubble("✨ SteveAI: Access Renewed (Silent Reset).", false);
    setTimeout(() => note.remove(), 2000);
}

async function streamChat() {
    const prompt = userInput.value.trim();
    const model = modelSelector.value;
    
    // FIX 1: Defensive check for model existence to prevent '.includes' error
    if (!prompt || !model) return;

    addBubble(prompt, true);
    conversationHistory.push({ role: "user", content: prompt });
    userInput.value = "";

    const aiBubble = addBubble("Establishing Frontier Link...");
    let fullAiResponse = "";

    try {
        // --- VIDEO (Sora 2) ---
        if (model === 'sora-2') {
            aiBubble.innerText = "Generating Sora 2 Video (est. 45s)...";
            // Use test_mode: true if you want to avoid 'Low Balance' entirely for testing
            const video = await puter.ai.txt2vid(prompt, { model: 'sora-2', seconds: 4, test_mode: false });
            aiBubble.innerText = "Sora 2 Generation Complete:";
            video.controls = video.autoplay = true;
            aiBubble.appendChild(video);
            return;
        }

        // --- IMAGE ---
        if (model.includes('FLUX') || model.includes('image')) {
            const img = await puter.ai.txt2img(prompt, { model: model });
            aiBubble.innerText = "Generation Success:";
            aiBubble.appendChild(img);
            return;
        }

        // --- CHAT ---
        const response = await puter.ai.chat(conversationHistory, { model: model, stream: true });

        // FIX 2: Stop the loop if the response is unauthorized/empty
        if (!response || typeof response[Symbol.asyncIterator] !== 'function') {
            throw new Error("UNAUTHORIZED_REDIRECT");
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
        console.error("SteveAI System Note:", err);
        const msg = err?.message || String(err);

        // Catch the 'Low Balance' or Redirect trigger
        if (msg.includes("Unauthorized") || msg.includes("balance") || msg.includes("REDIRECT")) {
            aiBubble.innerText = "⚠️ Limit Reached. Use a VPN or wait 1 hour to bypass IP restrictions.";
            await silentReset();
        } else {
            aiBubble.innerText = "Backend Error: " + msg;
        }
    }
}

sendBtn.onclick = streamChat;
userInput.onkeypress = (e) => { if (e.key === 'Enter') streamChat(); };
