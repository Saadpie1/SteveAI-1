// image.js - SteveAI: Ultra-HD Multi-Modal Orchestrator
// Developed by Saadpie | Precision, Efficiency, Scale.

import config from './config.js';
import { getPuterImage } from './puter-image.js';

export const SUPPORTED_SIZES = {
    "square": { width: 1024, height: 1024, label: "1:1 Square" },
    "landscape": { width: 1344, height: 768, label: "16:9 Landscape" },
    "portrait": { width: 768, height: 1344, label: "9:16 Portrait" },
    "ultrawide": { width: 1792, height: 1024, label: "21:9 Cinematic" },
    "hd_square": { width: 2048, height: 2048, label: "2K Ultra Square" }
};

// This will hold all A4F models discovered at runtime
export let IMAGE_MODELS = [];

/**
 * 🛰️ DYNAMIC MODEL DISCOVERY
 * Scans A4F for all image-capable engines.
 */
export async function syncImageModels() {
    const apiKey = "ddc-a4f-93af1cce14774a6f831d244f4df3eb9e";
    const url = config.proxiedURL(`${config.API_BASE[0]}/models`);

    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        const data = await res.json();
        
        if (data && data.data) {
            // Logic: Catch anything containing image, flux, imagen, sd, or dalle
            IMAGE_MODELS = data.data
                .filter(m => /image|flux|imagen|sd|dalle|stability/i.test(m.id))
                .map(m => ({
                    id: m.id,
                    name: m.id.split('/').pop().toUpperCase().replace(/-/g, ' '),
                    provider: m.id.split('/')[0]
                }));
            console.log(`📡 SteveAI: Discovered ${IMAGE_MODELS.length} A4F Image Engines.`);
        }
    } catch (e) {
        console.error("❌ A4F Sync Failed:", e);
    }
}

/**
 * 🛰️ HYBRID IMAGE ORCHESTRATOR (Puter -> A4F Failover)
 */
export async function generateImage(prompt, modelName, inputImage = null, sizeKey = "square", numImages = 1) {
    if (!prompt) throw new Error("No prompt provided");

    // --- PHASE 1: ATTEMPT PUTER (FREE/UNLIMITED) ---
    // If the modelName looks like a Puter ID or is the default, try Puter first.
    if (modelName.includes('google/') || modelName.includes('openai/') || modelName.includes('black-forest-labs/')) {
        try {
            const url = await getPuterImage(prompt, modelName, inputImage, false, sizeKey);
            return [url]; // Puter usually returns a single string/URL
        } catch (e) {
            console.warn("🛡️ Puter Node exhausted/busy. Shifting to Ahmed Shield...");
            // Fallback continues to Phase 2
        }
    }

    // --- PHASE 2: AHMED ENGINE (A4F) ---
    const apiKey = "ddc-a4f-93af1cce14774a6f831d244f4df3eb9e";
    const dims = SUPPORTED_SIZES[sizeKey] || SUPPORTED_SIZES["square"];
    const endpoint = inputImage ? "/v1/images/edits" : "/v1/images/generations";
    const url = config.proxiedURL(`${config.API_BASE[0]}${endpoint}`);

    // Build Failover Tier for A4F
    const familyKey = modelName.includes('/') ? modelName.split('/')[1].split('-')[0] : "flux";
    const failoverTier = [
        modelName,
        `provider-4/${familyKey}-4`, 
        "provider-5/flux-schnell"    
    ];

    for (const currentModel of failoverTier) {
        try {
            console.log(`🎨 SteveAI A4F [${inputImage ? 'EDIT' : 'GEN'}] with: ${currentModel}...`);
            
            const payload = {
                model: currentModel,
                prompt: prompt,
                n: numImages,
                width: dims.width,
                height: dims.height,
                response_format: "url"
            };

            if (inputImage) {
                payload.image = inputImage; 
                payload.strength = 0.75; 
            }

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) continue; 

            return data?.data?.map(item => item.url) || [];

        } catch (err) {
            console.error(`❌ Attempt failed:`, err.message);
            if (currentModel === failoverTier[failoverTier.length - 1]) throw err;
        }
    }
}

// Auto-sync on load
syncImageModels();
