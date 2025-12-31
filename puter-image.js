// puter-image.js - SteveAI: Infinite Nano Banana Orchestrator
// Dissolves Puter.js redirects for raw URL extraction.
// Developed by Saadpie | Project: steve-ai.netlify.app

export const PUTER_IMAGE_MODELS = [
    { id: 'google/gemini-3-pro-image-preview', label: '🍌 NANO BANANA PRO (Leading)' },
    { id: 'openai/gpt-image-1.5', label: '🎨 GPT IMAGE 1.5' },
    { id: 'black-forest-labs/flux.2-pro', label: '⚡ FLUX 2.0 PRO' },
    { id: 'google/gemini-2.5-flash-image', label: '🍃 NANO BANANA (Unlimited)' }
];

/**
 * 🎨 SteveAI Image Engine
 * @param {string} prompt - Creative direction
 * @param {string} modelId - Specific model ID
 * @param {string} inputImage - Base64 data for img2img (Banana Edit)
 */
export async function getPuterImage(prompt, modelId = 'google/gemini-3-pro-image-preview', inputImage = null) {
    try {
        console.log(`🤖 SteveAI [${inputImage ? 'EDIT' : 'GENERATE'}]: Using ${modelId}`);

        const options = {
            model: modelId,
            disable_safety_checker: true,
            // 2025 Standard: returns raw data instead of just appending to body
            response_format: 'url' 
        };

        // 🍌 Nano Banana / GPT 1.5 Image-to-Image Logic
        if (inputImage) {
            // Puter.js 2025 accepts image_base64 directly in the options object
            options.image_base64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
        }

        // DISSOLVE REDIRECT: We await the call and extract the source 
        // effectively preventing Puter from "hijacking" the DOM.
        const response = await puter.ai.txt2img(prompt, options);

        // Extracting the direct source from the returned Image Element
        if (response && response.src) return response.src;
        if (typeof response === 'string') return response;

        throw new Error("UNABLE_TO_EXTRACT_IMAGE_SOURCE");

    } catch (error) {
        console.error("SteveAI Puter-Image Node Failure:", error.message);
        throw error; // Let chat.js handle the Ahmed Engine fallback
    }
}
