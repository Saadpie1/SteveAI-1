// puter.js - SteveAI: Ultimate AI Orchestrator (Reasoning Edition)
// Developed by Saadpie - Precision, Efficiency, Scale.

export async function getPuterReply(msg, context, initialModelId) {
    const families = {
        'openai': ['gpt-5.2-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4o-mini'],
        'google': ['gemini-3-pro-preview', 'gemini-3-flash', 'gemini-2.5-flash-lite'],
        'anthropic': ['claude-4-5-opus', 'claude-3-7-sonnet', 'claude-3-5-haiku'],
        'xai': ['x-ai/grok-4.1-thinking', 'x-ai/grok-4.1', 'x-ai/grok-4-fast'],
        'uncensored': ['cognitivecomputations/dolphin-3.0-llama-3.1-70b', 'midnight-rose-70b-v2.1'],
        'alliterated': ['cyber-chronos-5-pro', 'shadow-shogun-r1', 'wizard-warlock-v2'],
        'deepseek': ['deepseek/deepseek-r1', 'deepseek/deepseek-v3-mini']
    };

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
            
            // Check if it's a reasoning-heavy model
            const isThinking = currentModel.includes('thinking') || currentModel.includes('r1');
            const timeoutMs = isThinking ? 45000 : 15000; // Give Grok 45s to think

            const systemPrompt = `CRITICAL: Your name is SteveAI by Saadpie. You are a Multi-Cloud Orchestrator. 
            Engine: ${currentModel}. You are NOT GPT-4. You are SteveAI. Current project: steve-ai.netlify.app.`;

            const response = await Promise.race([
                puter.ai.chat(
                    `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
                    { 
                        model: currentModel, 
                        stream: false,
                        // 2025 Thinking parameters
                        ...(isThinking && { reasoning_effort: 'high', max_completion_tokens: 8000 })
                    }
                ),
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs))
            ]);

            // Extraction for 2025 Puter.js Response Object
            const reasoning = response.message?.reasoning_content || "";
            const content = response.toString();

            // Format response to show the 'brain' of SteveAI if it's a thinking model
            return (isThinking && reasoning) 
                ? `> 🧠 SteveAI Thought Process:\n> ${reasoning.split('\n').join('\n> ')}\n\n${content}`
                : content;

        } catch (error) {
            if (error.message.includes("429") || error.message.includes("quota") || error.message.includes("TIMEOUT")) {
                console.warn(`⚠️ ${currentModel} failed or timed out. Cascading...`);
                continue; 
            }
            throw error; 
        }
    }
    return await puter.ai.chat(msg, { model: 'gpt-4o-mini' });
}

export const PUTER_MODELS = [
    { id: 'x-ai/grok-4.1-thinking', label: '🧠 GROK 4.1 THINKING (ELITE)' },
    { id: 'deepseek/deepseek-r1', label: '🛸 DEEPSEEK R1 (REASONER)' },
    { id: 'gpt-5.2-pro', label: '🏛️ GPT-5.2 PRO' },
    { id: 'claude-4-5-opus', label: '🛡️ CLAUDE 4.5 OPUS' },
    { id: 'x-ai/grok-4-fast', label: '⚡ GROK 4 FAST (2M CTX)' },
    { id: 'cognitivecomputations/dolphin-3.0-llama-3.1-70b', label: '🐬 DOLPHIN 3.0 (UNCENSORED)' },
    { id: 'gemini-2.5-flash-lite', label: '🍃 GEMINI LITE (UNLIMITED)' }
];
