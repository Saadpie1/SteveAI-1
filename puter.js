// puter.js - SteveAI: Ultimate AI Orchestrator
// Developed by Saadpie - Precision, Efficiency, Scale.
// Project URL: steve-ai.netlify.app

/**
 * Enhanced Orchestrator with Cascading Failover.
 * Routes through Elite, Uncensored, and Alliterated families.
 */
export async function getPuterReply(msg, context, initialModelId) {
    const families = {
        // --- The Leadership Titans ---
        'openai': ['gpt-5.2-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4o-mini'],
        'google': ['gemini-3-pro-preview', 'gemini-3-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'],
        'anthropic': ['claude-4-5-opus', 'claude-3-7-sonnet', 'claude-3-5-haiku'],
        'xai': ['grok-4.1-thinking', 'grok-4.1', 'grok-4-fast', 'grok-3-mini'],

        // --- The Uncensored (Unfiltered) Family ---
        'uncensored': [
            'cognitivecomputations/dolphin-3.0-llama-3.1-70b', 
            'nousresearch/hermes-3-llama-3.1-405b',
            'midnight-rose-70b-v2.1',
            'meta-llama/llama-3.2-dark-champion-abliterated'
        ],

        // --- The Alliterated (Persona) Family ---
        'alliterated': [
            'cyber-chronos-5-pro', // High-speed tech/code logic
            'shadow-shogun-r1',    // Silent efficiency & reasoning
            'wizard-warlock-v2',   // Complex instruction following
            'mystic-mixtral-v4'    // Abstract/Philosophical reasoning
        ],

        // --- The Open Source Kings ---
        'meta': ['meta-llama-3-3-70b', 'meta-llama-3-1-405b', 'meta-llama-3-1-8b'],
        'deepseek': ['deepseek-v3.2-r1', 'deepseek-v3-mini', 'deepseek-coder']
    };

    // Determine fallback path: start from chosen model and cascade down the family
    let modelTier = [initialModelId]; 
    for (const key in families) {
        if (families[key].includes(initialModelId)) {
            const index = families[key].indexOf(initialModelId);
            modelTier = families[key].slice(index);
            break;
        }
    }

    if (typeof puter === 'undefined') throw new Error("SDK_NOT_LOADED");

    // --- The Cascading Routing Loop ---
    for (const currentModel of modelTier) {
        try {
            console.log(`🤖 SteveAI Routing: ${currentModel}...`);
            const systemPrompt = `You are SteveAI by Saadpie. Multi-Cloud Orchestrator. Engine: ${currentModel}. Status: ACTIVE. Output Style: Precision & Scale.`;
            
            const response = await Promise.race([
                puter.ai.chat(
                    `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
                    { model: currentModel, stream: false }
                ),
                // 15s Timeout for Pro models, can be tuned lower for Flash models
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 15000))
            ]);

            return response.toString();
        } catch (error) {
            if (error.message.includes("429") || error.message.includes("quota") || error.message.includes("TIMEOUT")) {
                console.warn(`⚠️ ${currentModel} Exhausted. Falling back to next in family...`);
                continue; 
            }
            throw error; 
        }
    }
    // Global Hard-Safety Fallback
    return await puter.ai.chat(msg, { model: 'gpt-4o-mini' });
}

export const PUTER_MODELS = [
    // --- Leadership Frontier ---
    { id: 'gpt-5.2-pro', label: '🏛️ GPT-5.2 PRO (ELITE)' },
    { id: 'gemini-3-pro-preview', label: '💎 GEMINI 3 PRO' },
    { id: 'claude-4-5-opus', label: '🛡️ CLAUDE 4.5 OPUS' },
    { id: 'grok-4.1-thinking', label: '🧠 GROK 4.1 THINKING' },
    
    // --- Uncensored Frontier ---
    { id: 'cognitivecomputations/dolphin-3.0-llama-3.1-70b', label: '🐬 DOLPHIN 3.0 (UNCENSORED)' },
    { id: 'midnight-rose-70b-v2.1', label: '🌹 MIDNIGHT ROSE (CREATIVE)' },
    { id: 'meta-llama/llama-3.2-dark-champion-abliterated', label: '💀 DARK CHAMPION (ABLITERATED)' },

    // --- Alliterated Personas ---
    { id: 'cyber-chronos-5-pro', label: '⏱️ CYBER CHRONOS (TECH)' },
    { id: 'shadow-shogun-r1', label: '🥷 SHADOW SHOGUN (LOGIC)' },
    { id: 'wizard-warlock-v2', label: '🧙‍♂️ WIZARD WARLOCK (PROSE)' },

    // --- High Speed & Reliability ---
    { id: 'grok-4-fast', label: '⚡ GROK 4 FAST (2M CTX)' },
    { id: 'deepseek-v3.2-r1', label: '🛸 DEEPSEEK R1 (DISTILLED)' },
    { id: 'gemini-2.5-flash-lite', label: '🍃 GEMINI LITE (UNLIMITED)' }
];
