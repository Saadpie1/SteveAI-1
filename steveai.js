/**
 * SteveAI.js v9012709
 * FEAT: Silent Shield & Wan 2.1 Native Integration
 */

let shieldArmed = false;

// 🛡️ THE REDIRECTION SHIELD
async function applyShield() {
    if (shieldArmed || puter.auth.isSignedIn()) return;
    
    try {
        console.log("🛡️ Shield: Initializing Silent Identity...");
        // This is the core 'No-Redirect' command for 2025
        await puter.auth.signIn({ attempt_temp_user_creation: true });
        shieldArmed = true;
        console.log("🛡️ Shield: Identity forged successfully.");
    } catch (e) {
        console.warn("🛡️ Shield: Silent block encountered.");
    }
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
    
    // Ensure shield is active
    await applyShield();
    
    addBubble(prompt, true);
    input.value = "";
    
    const status = addBubble("<i>Steering AI Model...</i>");

    try {
        // --- WAN 2.1 GENERATION ---
        if (model.includes('Wan')) {
            status.innerHTML = "<b>Wan 2.1</b>: Architecting Video Frames...";
            
            // Native Puter.js Wan 2.1 call
            const video = await puter.ai.txt2vid(prompt, { 
                model: model,
                check_progress: true 
            });

            status.innerHTML = ""; // Clear loader
            video.controls = true;
            video.autoplay = true;
            status.appendChild(video);
        } 
        // --- STANDARD CHAT/IMAGE ---
        else if (model.includes('FLUX')) {
            const img = await puter.ai.txt2img(prompt, { model: model });
            status.innerHTML = "";
            status.appendChild(img);
        } else {
            const resp = await puter.ai.chat(prompt, { model: model });
            status.innerText = resp;
        }

    } catch (err) {
        console.error(err);
        status.innerHTML = `<span style="color:#ff4d4d">Orchestration Error: ${err.message}</span>`;
        
        // Auto-Identity-Rotation if limit hit
        if (err.message.includes('limit') || err.message.includes('auth')) {
            await puter.auth.signOut();
            shieldArmed = false;
            status.innerHTML += "<br>♻️ Identity Rotated. Retrying...";
            setTimeout(orchestrate, 1000); 
        }
    }
}
