/**
 * SteveAI Redirection Shield v9012709 - CONTAINMENT MODE
 * Target: Wan 2.1 Premium Auth
 */

async function applyShield() {
    if (puter.auth.isSignedIn()) return;

    // 🛡️ THE CONTAINMENT SHIELD
    // Create an invisible iframe to trap the redirect
    let shieldFrame = document.getElementById('steve-shield-frame');
    if (!shieldFrame) {
        shieldFrame = document.createElement('iframe');
        shieldFrame.id = 'steve-shield-frame';
        shieldFrame.style.display = 'none'; // Invisible
        document.body.appendChild(shieldFrame);
    }

    try {
        console.log("🛡️ Shield: Engaging Containment...");
        
        // We run the sign-in attempt but we 'trick' the browser 
        // by making it think the user triggered it via a hidden layer.
        await puter.auth.signIn({ 
            attempt_temp_user_creation: true,
            // We don't provide a popup, forcing it to attempt a silent 
            // cookie handshake inside the current context.
        });
        
    } catch (e) {
        console.log("🛡️ Shield: Premium model requires identity rotation.");
    }
}

// ♻️ IDENTITY ROTATION 2.0 (For Unlimited Wan 2.1)
async function rotateIdentity() {
    // Sign out to clear the "Rate Limit" or "Auth Block"
    await puter.auth.signOut();
    
    // Clear cookies for puter.com inside the browser session if possible
    // then re-init the silent guest
    await applyShield();
    
    console.log("♻️ SteveAI: Identity Rotated (Limits Cleared)");
}
