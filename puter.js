// puter.js - SteveAI: Full Puter.js Orchestration Suite
// Developed by Saadpie for Ultimate precision, efficiency, and scale.

/**
 * Sends a chat message to Puter's AI models.
 * @param {string} msg - User message.
 * @param {string} context - Memory/Context string.
 * @param {string} modelId - The Puter model ID.
 */
export async function getPuterReply(msg, context, modelId) {
    // Default fallback to Claude 3.5 for high-performance reasoning
    // If user selects "chat", we use Claude 3.5 Sonnet as the default engine
    const model = (modelId === 'chat') ? 'claude-3-5-sonnet' : modelId;
    
    const systemPrompt = `You are SteveAI by Saadpie. 
    Powered by Puter.js on Ahmed Aftab's High-Performance Engine. 
    Status: All Free Systems Active. Project: Ultimate AI Assistant.`;

    try {
        const response = await puter.ai.chat(
            `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
            { model: model, stream: false }
        );
        return response.toString();
    } catch (error) {
        console.error("❌ Puter Engine Failure:", error);
        throw new Error("Puter node disconnected. Check server status.");
    }
}

/**
 * ALL FREE PUTER MODELS - Every available option as of late 2025
 * Includes the high-speed GPT-5 Nano and Gemini Pro.
 */
export const PUTER_MODELS = [
    // --- The New Frontier ---
    { id: 'gpt-5-nano', label: '⚡ GPT-5 NANO' },
    
    // --- Premium Performance (Free via Puter) ---
    { id: 'claude-3-5-sonnet', label: '✨ CLAUDE 3.5 SONNET' },
    { id: 'gpt-4o', label: '🧠 GPT-4O (OMNI)' },
    { id: 'gemini-1-5-pro', label: '💎 GEMINI 1.5 PRO' },
    
    // --- High Speed & Efficiency ---
    { id: 'gpt-4o-mini', label: '✨ GPT-4O MINI' },
    { id: 'gemini-1-5-flash', label: '🚀 GEMINI 1.5 FLASH' },
    { id: 'o1-mini', label: '💻 O1 MINI' },
    
    // --- Large Scale Open Weights ---
    { id: 'meta-llama-3-1-405b-instruct', label: '🚀 LLAMA 3.1 (405B)' },
    { id: 'meta-llama-3-1-70b-instruct', label: '🚀 LLAMA 3.1 (70B)' },
    { id: 'meta-llama-3-1-8b-instruct', label: '🚀 LLAMA 3.1 (8B)' },
    
    // --- Mistral & Mixtral Suite ---
    { id: 'mistral-large-latest', label: '🧠 MISTRAL LARGE' },
    { id: 'mixtral-8x7b-instruct', label: '🚀 MIXTRAL 8X7B' }
];
     
