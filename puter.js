// puter.js - SteveAI: Full Puter.js Orchestration Suite
// Developed by Saadpie - Precision, Efficiency, Scale.

/**
 * Stealth Initialization
 * We check session status without triggering the Auth UI.
 */
const initPuter = async () => {
    try {
        // We use a low-level check to see if we can access the AI 
        // without explicitly calling the sign-in UI.
        if (!puter.auth.isSignedIn()) {
            // Attempt to create the user only if absolutely necessary, 
            // but we wrap it to prevent the UI from "popping"
            await puter.auth.signIn({ attempt_temp_user_creation: true }).catch(() => {
                console.log("SteveAI: Silent session pending...");
            });
        }
    } catch (e) {
        console.warn("Puter Stealth Init: Handled.");
    }
};

// Fire immediately
initPuter();

export async function getPuterReply(msg, context, modelId) {
    // Fallback logic
    const model = (modelId === 'chat') ? 'gpt-5-nano' : modelId;
    
    const systemPrompt = `You are SteveAI by Saadpie. 
    Powered by Puter.js. Status: Stealth Mode Active.`;

    try {
        // The SDK will now use the existing background session.
        const response = await puter.ai.chat(
            `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
            { model: model, stream: false }
        );
        return response.toString();
    } catch (error) {
        // If it still tries to redirect, we catch the error and suggest 
        // the user use the Ahmed Engine fallback instead of redirecting them.
        console.error("❌ Puter Node Error:", error);
        throw new Error("Puter node busy. Try switching to a Gemini or Ahmed model.");
    }
}

export const PUTER_MODELS = [
    { id: 'gpt-5-nano', label: '⚡ GPT-5 NANO' },
    { id: 'claude-3-5-sonnet', label: '✨ CLAUDE 3.5 SONNET' },
    { id: 'gpt-4o', label: '🧠 GPT-4O (OMNI)' },
    { id: 'gemini-1-5-pro', label: '💎 GEMINI 1.5 PRO' },
    { id: 'gemini-1-5-flash', label: '🚀 GEMINI 1.5 FLASH' },
    { id: 'o1-mini', label: '💻 O1 MINI' },
    { id: 'meta-llama-3-1-405b-instruct', label: '🚀 LLAMA 3.1 (405B)' },
    { id: 'meta-llama-3-1-70b-instruct', label: '🚀 LLAMA 3.1 (70B)' },
    { id: 'meta-llama-3-1-8b-instruct', label: '🚀 LLAMA 3.1 (8B)' },
    { id: 'mistral-large-latest', label: '🧠 MISTRAL LARGE' },
    { id: 'mixtral-8x7b-instruct', label: '🚀 MIXTRAL 8X7B' }
];
