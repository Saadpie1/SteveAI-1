// puter.js - SteveAI: Full Puter.js Orchestration Suite
// Developed by Saadpie - Precision, Efficiency, Scale.

/**
 * Enhanced Orchestrator with Cascading Failover.
 * If Tier 1 (Pro) fails, it automatically hops to Tier 2 (Flash) and then Tier 3 (Nano/Legacy).
 */
export async function getPuterReply(msg, context, initialModelId) {
    const families = {
        'openai': ['gpt-5.2-pro', 'gpt-5.2-chat', 'gpt-5-nano', 'gpt-4o-mini'],
        'google': ['gemini-3-pro-preview', 'gemini-3-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-pro'],
        'anthropic': ['claude-opus-4-5', 'claude-3-5-sonnet', 'claude-3-haiku'],
        'meta': ['meta-llama-3-1-405b-instruct', 'meta-llama-3-1-70b-instruct', 'meta-llama-3-1-8b-instruct'],
        'deepseek': ['deepseek-v3.2', 'deepseek-coder']
    };

    // Determine which family list to use for failover
    let modelTier = [initialModelId]; 
    for (const key in families) {
        if (families[key].includes(initialModelId)) {
            // Reorder tier so it starts from the user's selected model downwards
            const index = families[key].indexOf(initialModelId);
            modelTier = families[key].slice(index);
            break;
        }
    }

    if (typeof puter === 'undefined') throw new Error("SDK_NOT_LOADED");

    // --- The Cascading Loop ---
    for (const currentModel of modelTier) {
        try {
            console.log(`🤖 SteveAI Routing: ${currentModel}...`);
            const systemPrompt = `You are SteveAI by Saadpie. Multi-Cloud Orchestrator. Engine: ${currentModel}. Status: ACTIVE.`;
            
            const response = await Promise.race([
                puter.ai.chat(
                    `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
                    { model: currentModel, stream: false }
                ),
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 15000))
            ]);

            return response.toString();
        } catch (error) {
            // Check for Rate Limits (429) or Quota issues
            if (error.message.includes("429") || error.message.includes("quota") || error.message.includes("TIMEOUT")) {
                console.warn(`⚠️ ${currentModel} Exhausted or Slow. Falling back...`);
                continue; // Move to next model in Tier
            }
            throw error; // Critical coding error
        }
    }
    throw new Error("ALL_MODELS_EXHAUSTED");
}

export const PUTER_MODELS = [
    // --- OpenAI Frontier (2025) ---
    { id: 'gpt-5.2-pro', label: '🏛️ GPT-5.2 PRO (ELITE)' },
    { id: 'gpt-5.2-chat', label: '⚡ GPT-5.2 CHAT' },
    { id: 'gpt-5-nano', label: '✨ GPT-5 NANO' },
    
    // --- Google Next-Gen ---
    { id: 'gemini-3-pro-preview', label: '💎 GEMINI 3 PRO' },
    { id: 'gemini-3-flash', label: '🚀 GEMINI 3 FLASH' },
    { id: 'gemini-2.5-flash-lite', label: '🍃 GEMINI 2.5 LITE' },
    
    // --- Anthropic SOTA ---
    { id: 'claude-opus-4-5', label: '🏛️ CLAUDE 4.5 OPUS' },
    { id: 'claude-3-5-sonnet', label: '✨ CLAUDE 3.5 SONNET' },

    // --- Search & Logic ---
    { id: 'perplexity-sonar-large-online', label: '🌐 SONAR SEARCH' },
    { id: 'deepseek-v3.2', label: '🛸 DEEPSEEK V3.2' },
    { id: 'meta-llama-3-1-405b-instruct', label: '🔥 LLAMA 3.1 (405B)' }
];
