// puter.js - SteveAI: Full Puter.js Orchestration Suite
// Developed by Saadpie - Precision, Efficiency, Scale.

/**
 * Sends a chat message to Puter's AI models.
 * This version is sandboxed to prevent window redirection.
 */
export async function getPuterReply(msg, context, modelId) {
    const model = (modelId === 'chat') ? 'claude-3-5-sonnet' : modelId;
    
    const systemPrompt = `You are SteveAI by Saadpie. 
    Powered by Puter.js. Status: All Free Systems Active.`;

    // --- The Invisible Shield ---
    // We check if Puter is actually 'ready' to avoid the redirect trigger.
    if (typeof puter === 'undefined') {
        throw new Error("SDK_NOT_LOADED");
    }

    try {
        // We use a Promise timeout. If Puter tries to hang or redirect, 
        // we cut the connection after 8 seconds to stay on our page.
        const response = await Promise.race([
            puter.ai.chat(
                `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
                { model: model, stream: false }
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error("STEALTH_TIMEOUT")), 8000))
        ]);

        return response.toString();
    } catch (error) {
        console.error("❌ Puter Shield Triggered:", error);
        // We throw a specific error so chat.js knows to switch engines invisibly
        throw new Error("REDIRECT_BLOCKED");
    }
}

export const PUTER_MODELS = [
    { id: 'gpt-5-nano', label: '⚡ GPT-5 NANO' },
    { id: 'claude-3-5-sonnet', label: '✨ CLAUDE 3.5 SONNET' },
    { id: 'gpt-4o', label: '🧠 GPT-4O (OMNI)' },
    { id: 'gemini-1-5-pro', label: '💎 GEMINI 1.5 PRO' },
    { id: 'gpt-4o-mini', label: '✨ GPT-4O MINI' },
    { id: 'gemini-1-5-flash', label: '🚀 GEMINI 1.5 FLASH' },
    { id: 'o1-mini', label: '💻 O1 MINI' },
    { id: 'meta-llama-3-1-405b-instruct', label: '🚀 LLAMA 3.1 (405B)' },
    { id: 'meta-llama-3-1-70b-instruct', label: '🚀 LLAMA 3.1 (70B)' },
    { id: 'meta-llama-3-1-8b-instruct', label: '🚀 LLAMA 3.1 (8B)' },
    { id: 'mistral-large-latest', label: '🧠 MISTRAL LARGE' },
    { id: 'mixtral-8x7b-instruct', label: '🚀 MIXTRAL 8X7B' }
];
