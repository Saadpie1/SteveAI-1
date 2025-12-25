import config from './config.js'; 

// --- AVAILABLE IMAGE GENERATION MODELS ---
// Streamlined for SteveAI: Premium Google models, High-speed Flux, and Specialized Provider-8 models.
export const IMAGE_MODELS = [
    // Imagen Models
    { id: "provider-4/imagen-3.5", name: "Imagen 3.5" },
    { id: "provider-4/imagen-4", name: "Imagen 4" },
    { id: "provider-8/imagen-3", name: "Imagen 3" },
    
    // Flux & Speed Optimized
    { id: "provider-5/flux-schnell", name: "Flux Schnell" },
    { id: "provider-5/flux-dev", name: "Flux Dev" },
    { id: "provider-4/sdxl-lite", name: "SDXL Lite (Fast)" },
    
    // Specialized & Provider 8
    { id: "provider-4/phoenix", name: "Phoenix" },
    { id: "provider-8/firefrost", name: "Firefrost" },
    { id: "provider-8/z-image", name: "Z-Image" },
    { id: "provider-8/char", name: "Char (Character Specialist)" },
    { id: "provider-8/seed-rp", name: "Seed RP (Art & Roleplay)" }
];

/**
 * 🌟 IMAGE GENERATION (HTTP FETCH)
 * Orchestrates calls to the SteveAI image generation backend.
 * * @param {string} prompt - The visual description.
 * @param {string} modelName - The ID of the model to use.
 * @param {number} numImages - Number of images to generate (1-4).
 * @returns {Promise<string[]>} - An array of image URLs.
 */
export async function generateImage(prompt, modelName = IMAGE_MODELS[0].id, numImages = 1) { 
  if (!prompt) throw new Error("No prompt provided");
  
  // Guardrail for API batch limits
  if (numImages < 1 || numImages > 4) {
    throw new Error("Number of images must be between 1 and 4.");
  }

  try {
    // Utilizing the secondary API Key slot for Image Orchestration
    const apiKey = config.API_KEYS[1]; 

    const response = await fetch("https://api.a4f.co/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName, 
        prompt: prompt,
        n: numImages, 
        size: "1024x1024" 
      })
    });

    const data = await response.json();
    
    // Debugging log for Saadpie's development console
    console.log("SteveAI Orchestration Response:", data);

    if (!response.ok) {
        const errorText = JSON.stringify(data);
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}. API Error: ${errorText}`);
    }

    // Extracting URLs from the data array
    const imageUrls = data?.data?.map(item => item.url) || [];

    if (imageUrls.length === 0) {
        throw new Error("API response received, but no image URLs were found.");
    }
    
    return imageUrls; // Returns an array of strings

  } catch (err) {
    console.error("SteveAI Image Generation Error:", err);
    throw err;
  }
}
