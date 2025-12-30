// puter.js - SteveAI Stealth Orchestrator
// Developed by Saadpie

/**
 * Silent Background Authentication
 * Bypasses the redirect by using a hidden iframe approach 
 * implicitly handled by the Puter SDK when configured correctly.
 */
const silentAuth = async () => {
    if (puter.auth.isSignedIn()) return true;
    
    try {
        // We attempt a silent background sign-in.
        // If this is blocked, we will fallback to Ahmed's engine 
        // in chat.js rather than letting the user see a redirect.
        await puter.auth.signIn({ attempt_temp_user_creation: true });
        return true;
    } catch (e) {
        console.warn("SteveAI: Puter silent auth blocked by browser.");
        return false;
    }
};

export async function getPuterReply(msg, context, modelId) {
    // Ensure we are authenticated silently
    const authSuccess = await silentAuth();
    
    // If auth fails, we throw an error so chat.js can catch it and 
    // switch the user to the Gemini/Ahmed engine automatically.
    if (!authSuccess && !puter.auth.isSignedIn()) {
        throw new Error("AUTH_REQUIRED");
    }

    const model = (modelId === 'chat') ? 'gpt-5-nano' : modelId;
    const systemPrompt = `You are SteveAI by Saadpie. Multi-Modal Orchestrator.`;

    try {
        const response = await puter.ai.chat(
            `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
            { model: model, stream: false }
        );
        return response.toString();
    } catch (error) {
        console.error("❌ Puter Node Error:", error);
        throw new Error("NODE_OFFLINE");
    }
}

export const PUTER_MODELS = [
    { id: 'gpt-5-nano', label: '⚡ GPT-5 NANO' },
    { id: 'claude-3-5-sonnet', label: '✨ CLAUDE 3.5 SONNET' },
    { id: 'gpt-4o', label: '🧠 GPT-4O (OMNI)' },
    { id: 'gemini-1-5-pro', label: '💎 GEMINI 1.5 PRO' },
    { id: 'gemini-1-5-flash', label: '🚀 GEMINI 1.5 FLASH' },
    { id: 'o1-mini', label: '💻 O1 MINI' },
    { id: 'meta-llama-3-1-405b-instruct', label: '🚀 LLAMA 3.1 (405B)' }
];
