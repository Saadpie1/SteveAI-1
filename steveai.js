/**
 * SteveAI Orchestrator v2.7
 * Developed by Saadpie
 * FIX: Silent Identity Rotation & Sora Credit Handling
 */

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const modelSelector = document.getElementById('model-selector');

let conversationHistory = JSON.parse(localStorage.getItem('steve_session')) || [
    { role: "system", content: "You are SteveAI by Saadpie. Multi-Modal Orchestrator v2.7." }
];

window.onload = () => {
    conversationHistory.forEach(m => { 
        if(m.role !== 'system') addBubble(m.content, m.role === 'user'); 
    });
};

// --- SILENT BYPASS (No Page Refresh) ---
async function silentRotate() {
    try {
        console.log("SteveAI: Performing Silent Identity Rotation...");
        // 1. Sign out of current Puter Guest Session
        await puter.auth.signOut();
        
        // 2. Clear local identifiers
        Object.keys(localStorage).forEach(key => { 
            if (key.includes('puter')) localStorage.removeItem(key); 
        });
        sessionStorage.clear();

        // 3. Instead of reload, we wait for Puter to auto-assign a new guest ID on next call
        // We notify the user silently
        const note = addBubble("✨ Identity Refreshed. Accessing Frontier models...", false);
        setTimeout(() => note.remove(), 3000);
        
    } catch (err) {
        console.error("Rotation failed, falling back to hard reset.");
        location.reload(); 
    }
}

function addBubble(content, isUser = false) {
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'user' : 'ai'}`;
    if (content instanceof HTMLElement) div.appendChild(content);
    else div.innerText = content;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
}

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
        // --- SORA 2 VIDEO LOGIC ---
        if (model === 'sora-2') {
            aiBubble.innerText = "Sora 2 Generating (4s clip)...";
            try {
                const videoElement = await puter.ai.txt2vid(prompt, { 
                    model: 'sora-2', 
                    seconds: 4,
                    // Try testMode if normal fails (Uncomment below to enable test mode by default)
                    // testMode: false 
                });
                aiBubble.innerText = "Sora 2 Generation Complete:";
                videoElement.controls = videoElement.autoplay = true;
                aiBubble.appendChild(videoElement);
            } catch (vErr) {
                if (vErr.message.includes("credit") || vErr.status === 401) {
                    aiBubble.innerText = "⚠️ Sora 2 Credits Depleted. Resetting Identity...";
                    await silentRotate();
                } else throw vErr;
            }
            return;
        }

        // --- IMAGE LOGIC ---
        if (model.includes('FLUX') || model.includes('image')) {
            const img = await puter.ai.txt2img(prompt, { model: model });
            aiBubble.innerText = "Generated Image:";
            aiBubble.appendChild(img);
            return;
        }

        // --- CHAT LOGIC ---
        const response = await puter.ai.chat(conversationHistory, { model: model, stream: true });
        
        if (!response || typeof response[Symbol.asyncIterator] !== 'function') {
            throw new Error("Unauthorized");
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
        const msg = err?.message || String(err);
        if (msg.includes("Unauthorized") || msg.includes("limit") || msg.includes("401")) {
            aiBubble.innerText = "♻️ Rotating SteveAI Identity...";
            await silentRotate();
            // Optional: Automatically retry the last message
            // streamChat(); 
        } else {
            aiBubble.innerText = "Backend Note: " + msg;
        }
    }
}

sendBtn.onclick = streamChat;
userInput.onkeypress = (e) => { if (e.key === 'Enter') streamChat(); };
