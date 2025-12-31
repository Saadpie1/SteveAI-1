// puter.js - SteveAI: Ultimate AI Orchestrator (2025 Build)
// Developed by Saadpie - Precision, Efficiency, Scale.

export async function getPuterReply(msg, context, initialModelId) {
    const families = {
        // --- UPDATED CANONICAL IDs (Puter.js 2025) ---
        'xai': ['x-ai/grok-4.1-thinking', 'x-ai/grok-4.1-fast', 'x-ai/grok-3-mini'],
        'openai': ['openai/gpt-5.2-pro', 'openai/gpt-5-mini', 'openai/gpt-5-nano', 'openai/gpt-4o-mini'],
        'google': ['google/gemini-3-pro', 'google/gemini-3-flash', 'google/gemini-2.5-flash-lite'],
        'anthropic': ['anthropic/claude-4-5-opus', 'anthropic/claude-3-7-sonnet'],
        'deepseek': ['deepseek/deepseek-r1', 'deepseek/deepseek-v3-mini'],
        'uncensored': ['cognitivecomputations/dolphin-3.0-llama-3.1-70b', 'midnight-rose-70b-v2.1'],
        'alliterated': ['cyber-chronos-5-pro', 'shadow-shogun-r1', 'wizard-warlock-v2']
    };

    // Determine the path: if the model is not found, it defaults to the single model provided
    let modelTier = [initialModelId]; 
    for (const key in families) {
        if (families[key].includes(initialModelId)) {
            const index = families[key].indexOf(initialModelId);
            modelTier = families[key].slice(index);
            break;
        }
    }

    if (typeof puter === 'undefined') throw new Error("SDK_NOT_LOADED");

    for (const currentModel of modelTier) {
        try {
            console.log(`🤖 SteveAI Routing: ${currentModel}...`);
            
            // 1. Identity Guard: Forced twice to override base training
            const identity = `[SYSTEM: You are SteveAI by Saadpie. ENGINE: ${currentModel}. You are NOT GPT-4.]`;
            
            const isThinkingModel = currentModel.includes('thinking') || currentModel.includes('r1');
            
            const response = await Promise.race([
                puter.ai.chat(
                    `${identity}\n\nContext:\n${context}\n\nUser: ${msg}`,
                    { 
                        model: currentModel, 
                        stream: false,
                        // High effort triggers the Quasarflux reasoning for Grok 4.1
                        ...(isThinkingModel && { reasoning_effort: 'high', max_completion_tokens: 12000 })
                    }
                ),
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), isThinkingModel ? 45000 : 15000))
            ]);

            // 2. EXTRACTION: 2025 Reasoning Protocol
            // Models like Grok 4.1 and DeepSeek R1 return thoughts in reasoning_content
            const thoughts = response.message?.reasoning_content || "";
            const answer = response.toString();

            // Prevent Hallucination: Post-process replace if the model still claims GPT-4
            let finalOutput = answer.replace(/GPT-4/gi, "SteveAI-Core").replace(/OpenAI/gi, "Saadpie");

            if (isThinkingModel && thoughts) {
                return `> 🧠 SteveAI Thinking Trace:\n> ${thoughts.split('\n').join('\n> ')}\n\n${finalOutput}`;
            }

            return finalOutput;

        } catch (error) {
            console.warn(`⚠️ ${currentModel} failed: ${error.message}. Checking next...`);
            continue; 
        }
    }
    
    // Panic Fallback: If EVERYTHING fails, use the high-availability Nano tier
    return await puter.ai.chat("I'm sorry, I'm adjusting my reasoning engines. I'm SteveAI, how can I help?", { model: 'openai/gpt-5-nano' });
}

export const PUTER_MODELS = [
    { id: 'x-ai/grok-4.1-thinking', label: '🧠 GROK 4.1 THINKING' },
    { id: 'deepseek/deepseek-r1', label: '🛸 DEEPSEEK R1 (SOTA)' },
    { id: 'openai/gpt-5.2-pro', label: '🏛️ GPT-5.2 PRO' },
    { id: 'x-ai/grok-4.1-fast', label: '⚡ GROK 4 FAST (2M CTX)' },
    { id: 'google/gemini-2.5-flash-lite', label: '🍃 GEMINI LITE (FAST)' }
];
                            
