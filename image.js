import config from './config.js';

// --- CONFIGURATION ---
// Standard 2025 aspect ratios and their pixel mappings (multiples of 16)
export const SUPPORTED_SIZES = {
    "square": { width: 1024, height: 1024, label: "1:1 Square" },
    "landscape": { width: 1344, height: 768, label: "16:9 Landscape" },
    "portrait": { width: 768, height: 1344, label: "9:16 Portrait" },
    "ultrawide": { width: 1792, height: 1024, label: "21:9 Cinematic" },
    "hd_square": { width: 2048, height: 2048, label: "2K Ultra Square" } // For high-tier models
};

/**
 * 🛰️ ENHANCED IMAGE GENERATION (Dynamic Size & Failover)
 * @param {string} prompt - Visual description.
 * @param {string} modelName - ID of the model.
 * @param {string} sizeKey - Key from SUPPORTED_SIZES (e.g., 'landscape').
 * @param {number} numImages - Count (1-4).
 */
export async function generateImage(prompt, modelName, sizeKey = "square", numImages = 1) {
    if (!prompt) throw new Error("No prompt provided");

    const apiKey = config.API_KEYS[1];
    const dimensions = SUPPORTED_SIZES[sizeKey] || SUPPORTED_SIZES["square"];

    // Build the Failover Tier (Same logic as Chat.js)
    const family = modelName.split('-')[0] || "flux";
    const failoverTier = [
        modelName,
        "provider-4/imagen-4",
        "provider-5/flux-schnell" 
    ];

    for (const currentModel of failoverTier) {
        try {
            console.log(`🎨 SteveAI Painting [${sizeKey}] with: ${currentModel}...`);
            
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
                    width: dimensions.width,
                    height: dimensions.height,
                    // 2025 Specific: Quality & Style toggles
                    quality: currentModel.includes("ultra") ? "hd" : "standard",
                    response_format: "url"
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.warn(`⚠️ ${currentModel} error. Checking failover...`);
                continue; 
            }

            return data?.data?.map(item => item.url) || [];

        } catch (err) {
            console.error(`❌ ${currentModel} failed:`, err.message);
            if (currentModel === failoverTier[failoverTier.length - 1]) throw err;
        }
    }
}
