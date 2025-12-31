import config from './config.js';

export const SUPPORTED_SIZES = {
    "square": { width: 1024, height: 1024, label: "1:1 Square" },
    "landscape": { width: 1344, height: 768, label: "16:9 Landscape" },
    "portrait": { width: 768, height: 1344, label: "9:16 Portrait" },
    "ultrawide": { width: 1792, height: 1024, label: "21:9 Cinematic" },
    "hd_square": { width: 2048, height: 2048, label: "2K Ultra Square" }
};

/**
 * 🛰️ HYBRID IMAGE ORCHESTRATOR (txt2img + img2img)
 * @param {string} prompt - Visual description.
 * @param {string} modelName - ID of the model.
 * @param {string} inputImage - (Optional) Base64 or URL for Image-to-Image.
 * @param {string} sizeKey - Resolution key.
 */
export async function generateImage(prompt, modelName, inputImage = null, sizeKey = "square", numImages = 1) {
    if (!prompt) throw new Error("No prompt provided");

    const apiKey = config.API_KEYS[1];
    const dims = SUPPORTED_SIZES[sizeKey] || SUPPORTED_SIZES["square"];
    
    // Determine the correct endpoint based on mode
    // img2img usually uses /edits or /variations in 2025 standard APIs
    const endpoint = inputImage 
        ? "https://api.a4f.co/v1/images/edits" 
        : "https://api.a4f.co/v1/images/generations";

    // 1. Build Failover Tier
    const familyKey = modelName.includes('/') ? modelName.split('/')[1].split('-')[0] : "flux";
    const failoverTier = [
        modelName,
        `provider-4/${familyKey}-4`, // Try updated version of same family
        "provider-5/flux-schnell"    // Global safety net
    ];

    for (const currentModel of failoverTier) {
        try {
            console.log(`🎨 SteveAI [${inputImage ? 'EDIT' : 'GEN'}] with: ${currentModel}...`);
            
            const payload = {
                model: currentModel,
                prompt: prompt,
                n: numImages,
                width: dims.width,
                height: dims.height,
                response_format: "url"
            };

            // 🍌 Add Image-to-Image Parameters
            if (inputImage) {
                // The A4F API usually expects 'image' or 'image_url'
                payload.image = inputImage; 
                payload.strength = 0.75; // 0.75 is the 2025 sweet spot for preservation vs creativity
            }

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 404 && inputImage) {
                    console.warn("Edit endpoint not found, attempting legacy txt2img fallback...");
                    continue; 
                }
                continue; // Failover to next model
            }

            return data?.data?.map(item => item.url) || [];

        } catch (err) {
            console.error(`❌ Attempt failed:`, err.message);
            if (currentModel === failoverTier[failoverTier.length - 1]) throw err;
        }
    }
}
