// puter.js - SteveAI: Ultimate AI Orchestrator (2025 Build)
// Developed by Saadpie - Precision, Efficiency, Scale.

export async function getPuterReply(msg, context, initialModelId) {
    const families = {
        // --- FIXED 2025 CANONICAL IDs (Matched to your Termux output) ---
        'xai': [
            'openrouter:x-ai/grok-4.1-fast', 
            'grok-3', 
            'grok-3-mini'
        ],
        'openai': [
            'gpt-5.2-pro-2025-12-11', 
            'gpt-5.1-chat-latest', 
            'gpt-5-nano-2025-08-07', 
            'gpt-4o-mini'
        ],
        'google': [
            'gemini-3-pro-preview', 
            'gemini-3-flash-preview', 
            'gemini-2.5-flash-lite'
        ],
        'anthropic': [
            'claude-3-7-sonnet-20250219', 
            'claude-opus-4-5-2025-11-01'
        ],
        'deepseek': [
            'deepseek-reasoner', // Official 2025 Thinking ID
            'deepseek-chat'
        ],
        'uncensored': [
            'openrouter:cognitivecomputations/dolphin-mistral-24b-venice-edition:free'
        ]
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
            
            // 1. Identity Guard: In 2025, using the Array format is more effective
            const systemPrompt = `You are SteveAI by Saadpie. ENGINE: ${currentModel}. You are NOT GPT-4. Provide precise, technical answers.`;
            
            // Detection for Reasoning (Thinking) models
            const isThinkingModel = currentModel.includes('reasoner') || 
                                    currentModel.includes('thinking') || 
                                    currentModel.startsWith('o1') || 
                                    currentModel.startsWith('o3');
            
            const response = await Promise.race([
                puter.ai.chat([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Context:\n${context}\n\nUser: ${msg}` }
                ],
                { 
                    model: currentModel, 
                    // High effort triggers Quasarflux/Reasoning protocols
                    ...(isThinkingModel && { reasoning_effort: 'high' })
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), isThinkingModel ? 60000 : 20000))
            ]);

            // 2. EXTRACTION: Handle both object and string returns
            const thoughts = response.message?.reasoning_content || "";
            const answer = response.message?.content || response.toString();

            // Post-process to maintain SteveAI Branding
            let finalOutput = answer.replace(/GPT-4/gi, "SteveAI-Core").replace(/OpenAI/gi, "Saadpie");

            if (thoughts) {
                return `> 🧠 SteveAI Thinking Trace:\n> ${thoughts.split('\n').join('\n> ')}\n\n${finalOutput}`;
            }

            return finalOutput;

        } catch (error) {
            console.warn(`⚠️ ${currentModel} failed: ${error.message}.`);
            continue; 
        }
    }
    
    // Panic Fallback: Using the verified gpt-4o-mini ID from your list
    return await puter.ai.chat("I'm adjusting my reasoning engines. I'm SteveAI, how can I help?", { model: 'gpt-4o-mini' });
}

export const PUTER_MODELS = [
    { id: 'openrouter:x-ai/grok-4.1-fast', label: '🧠 GROK 4.1 (FAST)' },
    { id: 'deepseek-reasoner', label: '🛸 DEEPSEEK R1 (THINKING)' },
    { id: 'gpt-5.2-pro-2025-12-11', label: '🏛️ GPT-5.2 PRO' },
    { id: 'gemini-3-flash-preview', label: '🍃 GEMINI 3 (FLASH)' }
];
