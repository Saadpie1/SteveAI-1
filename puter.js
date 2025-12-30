// puter.js - SteveAI: Full Puter.js Orchestration Suite
// Developed by Saadpie - Precision, Efficiency, Scale.

export async function getPuterReply(msg, context, modelId) {
    let selectedModel;
    // Default routing with fallback logic
    if (modelId === 'chat' || modelId === 'steve-default') {
        selectedModel = 'claude-3-5-sonnet'; 
    } else if (modelId === 'fast') {
        selectedModel = 'gemini-1-5-flash';
    } else {
        selectedModel = modelId;
    }
    
    const systemPrompt = `You are SteveAI by Saadpie. Multi-Cloud Orchestrator. 
    Anthropic/Azure/Perplexity Layers: ACTIVE. Engine: ${selectedModel}.`;

    if (typeof puter === 'undefined') {
        throw new Error("SDK_NOT_LOADED");
    }

    try {
        const response = await Promise.race([
            puter.ai.chat(
                `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${msg}`,
                { model: selectedModel, stream: false }
            ),
            // Extended timeout for "Heavy" models like Claude Opus
            new Promise((_, reject) => setTimeout(() => reject(new Error("STEALTH_TIMEOUT")), 15000))
        ]);

        return response.toString();
    } catch (error) {
        console.error("❌ SteveAI Engine Error:", error);
        throw new Error("REDIRECT_BLOCKED_OR_FAILED");
    }
}

// Updated Model List: 20+ Precision-Routed Models
export const PUTER_MODELS = [
    // --- Anthropic High-Fidelity ---
    { id: 'claude-3-5-sonnet', label: '✨ CLAUDE 3.5 SONNET' },
    { id: 'claude-3-opus', label: '🏛️ CLAUDE 3 OPUS (MAX)' },
    { id: 'claude-3-haiku', label: '🍃 CLAUDE 3 HAIKU' },

    // --- Azure & OpenAI Enterprise ---
    { id: 'gpt-4o', label: '🧠 GPT-4O (AZURE CORE)' },
    { id: 'gpt-4-turbo', label: '⚙️ GPT-4 TURBO' },
    { id: 'o1-preview', label: '🔬 O1-PREVIEW (DEEP THINK)' },

    // --- Perplexity / Sonar (Search) ---
    { id: 'perplexity-sonar-large-online', label: '🌐 SONAR LARGE (SEARCH)' },
    { id: 'perplexity-sonar-small-online', label: '🌐 SONAR SMALL (SEARCH)' },

    // --- Meta & Mistral (Open Weights) ---
    { id: 'meta-llama-3-1-405b-instruct', label: '🔥 LLAMA 3.1 (405B)' },
    { id: 'meta-llama-3-1-70b-instruct', label: '🚀 LLAMA 3.1 (70B)' },
    { id: 'mistral-large-latest', label: '🧠 MISTRAL LARGE' },
    { id: 'mixtral-8x7b-instruct', label: '🚀 MIXTRAL 8X7B' },

    // --- Specialized Engines ---
    { id: 'deepseek-coder', label: '🛸 DEEPSEEK CODER V2' },
    { id: 'codellama-34b-instruct', label: '👨‍💻 CODE-LLAMA' },
    { id: 'qwen-2-72b-instruct', label: '🐉 QWEN 2' },
    { id: 'dbrx-instruct', label: '🧱 DATABRICKS DBRX' },

    // --- Google DeepMind ---
    { id: 'gemini-1-5-pro', label: '💎 GEMINI 1.5 PRO' },
    { id: 'gemini-1-5-flash', label: '🚀 GEMINI 1.5 FLASH' }
];
