import config from './config.js';

// --- DYNAMIC MODEL CACHE ---
let DYNAMIC_IMAGE_MODELS = [];

/**
 * 🛰️ MODEL DISCOVERY
 * Fetches the latest available image models from the A4F API.
 * Ensures SteveAI always has the newest engines (Imagen 4, Firefrost, etc.)
 */
export async function refreshImageModels() {
    try {
        const apiKey = config.API_KEYS[1];
        const response = await fetch("https://api.a4f.co/v1/models?plan=free", {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });
        const data = await response.json();
        
        // Filter for image generation models only
        DYNAMIC_IMAGE_MODELS = data.data
            .filter(model => model.type === "images/generations" || model.id.includes("imagen") || model.id.includes("flux"))
            .map(model => ({
                id: model.id,
                name: model.id.split('/').pop().replace(/-/g, ' ').toUpperCase(),
                provider: model.id.split('/')[0]
            }));

        console.log("🎨 SteveAI Image Models Updated:", DYNAMIC_IMAGE_MODELS.length, "models loaded.");
        return DYNAMIC_IMAGE_MODELS;
    } catch (err) {
        console.error("❌ Model Discovery Failed:", err);
        return [];
    }
}

/**
 * 🌟 ENHANCED IMAGE GENERATION (With Cascading Failover)
 */
export async function generateImage(prompt, modelName, numImages = 1) {
    if (!prompt) throw new Error("No prompt provided");

    // 1. Initial Discovery if cache is empty
    if (DYNAMIC_IMAGE_MODELS.length === 0) await refreshImageModels();

    // 2. Create Failover Tier
    // Find models from the same "family" (e.g., all Flux models or all Imagen models)
    const baseModel = modelName.split('/')[1] || modelName;
    const familyKey = baseModel.split('-')[0]; // 'imagen', 'flux', 'sdxl'
    
    const failoverTier = [
        modelName, // Try user choice first
        ...DYNAMIC_IMAGE_MODELS
            .filter(m => m.id !== modelName && m.id.includes(familyKey))
            .map(m => m.id),
        "provider-5/flux-schnell" // Absolute global safety fallback
    ];

    const apiKey = config.API_KEYS[1];

    // 3. The Cascading Loop
    for (const currentModel of failoverTier) {
        try {
            console.log(`🎨 SteveAI Painting with: ${currentModel}...`);
            
            const response = await fetch("https://api.a4f.co/v1/images/generations", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: currentModel,
                    prompt: prompt,
                    n: numImages,
                    size: "1024x1024"
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429 || response.status === 500) {
                    console.warn(`⚠️ ${currentModel} busy or failed. Cascading...`);
                    continue; // Jump to next model in tier
                }
                throw new Error(`API Error: ${data.error || response.statusText}`);
            }

            const urls = data?.data?.map(item => item.url) || [];
            if (urls.length > 0) return urls;

        } catch (err) {
            console.error(`❌ Attempt with ${currentModel} failed:`, err.message);
            // If it's the last model in the tier, throw the error
            if (currentModel === failoverTier[failoverTier.length - 1]) throw err;
        }
    }
}
