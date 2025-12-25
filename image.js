import config from './config.js'; 

// --- AVAILABLE IMAGE GENERATION MODELS ---
// Optimized list: Filtered to specific Imagen, SDXL, Flux, Phoenix, and Provider-8 models
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
    { id: "provider-8/z-image", name: "Z-Image" }
];

// 🌟 IMAGE GENERATION (HTTP FETCH)
export async function generateImage(prompt, modelName = IMAGE_MODELS[0].id, numImages = 1) { 
  if (!prompt) throw new Error("No prompt provided");
  if (numImages < 1 || numImages > 4) throw new Error("Number of images must be between 1 and 4.");

  try {
    const apiKey = config.API_KEYS[1]; 

    const response = await fetch("https://api.a4f.co/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName, 
        prompt,
        n: numImages,
        size: "1024x1024" 
      })
    });

    const data = await response.json();

    if (!response.ok) {
        const errorText = JSON.stringify(data);
        throw new Error(`HTTP Error: ${response.status}. API Error: ${errorText}`);
    }

    const imageUrls = data?.data?.map(item => item.url) || [];

    if (imageUrls.length === 0) {
        throw new Error("No image URLs found in response.");
    }
    
    return imageUrls;

  } catch (err) {
    console.error("Image generation error:", err);
    throw err;
  }
}
