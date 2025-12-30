/**
 * SteveAI.js - Redirection Shield v9012709
 */

const identityBar = document.getElementById('identity-status');

// 🛡️ ARM THE SHIELD (Triggered by user click)
async function armShield() {
    try {
        await puter.auth.signIn({ attempt_temp_user_creation: true });
        const user = await puter.auth.getUser();
        identityBar.innerText = `Identity: GHOST_${user.username.split('-')[1]}`;
        document.getElementById('shield-trap').style.display = 'none';
    } catch (e) {
        console.warn("Shield: Silent Forge failed. Forcing guest session.");
    }
}

// ♻️ ROTATE IDENTITY (For Unlimited Wan 2.1)
async function rotateIdentity() {
    identityBar.innerText = "Identity: ROTATING...";
    await puter.auth.signOut();
    await puter.auth.signIn({ attempt_temp_user_creation: true });
    const user = await puter.auth.getUser();
    identityBar.innerText = `Identity: GHOST_${user.username.split('-')[1]} (Refreshed)`;
}

function addBubble(content, isUser = false) {
    const win = document.getElementById('chat-window');
    const div = document.createElement('div');
    div.className = `msg ${isUser ? 'user' : 'ai'}`;
    if (content instanceof HTMLElement) div.appendChild(content);
    else div.innerHTML = content;
    win.appendChild(div);
    win.scrollTop = win.scrollHeight;
    return div;
}

async function orchestrate() {
    const input = document.getElementById('user-input');
    const prompt = input.value.trim();
    const model = document.getElementById('model-selector').value;
    if (!prompt) return;

    addBubble(prompt, true);
    input.value = "";
    const statusBubble = addBubble("<i>Orchestrating Engine...</i>");

    try {
        // --- WAN 2.1 VIDEO ENGINE ---
        if (model.includes('Wan')) {
            statusBubble.innerHTML = "<b>Wan 2.1</b>: Forging Video Data...";
            
            // This is the call that usually triggers the redirect.
            // We intercept it here.
            const video = await puter.ai.txt2vid(prompt, { model: model });
            
            statusBubble.innerHTML = "";
            video.controls = video.autoplay = true;
            statusBubble.appendChild(video);
        } 
        // --- OTHER MODELS ---
        else if (model.includes('FLUX')) {
            const img = await puter.ai.txt2img(prompt, { model: model });
            statusBubble.innerHTML = "";
            statusBubble.appendChild(img);
        } else {
            const resp = await puter.ai.chat(prompt, { model: model });
            statusBubble.innerText = resp;
        }

    } catch (err) {
        console.error("STEVE-AI SHIELD ALERT:", err);
        
        // 🛡️ THE REDIRECT CATCHER
        if (err.message.includes('auth') || err.message.includes('redirect')) {
            statusBubble.innerHTML = "🛡️ Redirection Blocked. Rotating Identity...";
            await rotateIdentity();
            orchestrate(); // Auto-retry
        } else {
            statusBubble.innerText = "Error: " + err.message;
        }
    }
}
