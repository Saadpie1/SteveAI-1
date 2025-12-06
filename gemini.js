// gemini.js

// --- Module Imports ---
import { IMAGE_MODELS } from './image.js'; 
import config from './config.js'; 

// --- Configuration from Import ---
const API_BASE = config.API_BASE; // Array: [A4F, Gemini]
const API_KEYS = config.API_KEYS; // Array of keys
const proxiedURL = config.proxiedURL; // Function: PROXY + encodeURIComponent(base)

/**
 * Sends a message to the Gemini API, handling different modes, system instructions, and image data.
 * @param {string} msg - The user's new message.
 * @param {string} context - The summarized and recent chat history.
 * @param {string} mode - The current operational mode ('lite' or 'fast').
 * @param {string | null} imageToSend - The Base64 image data string (e.g., "data:image/jpeg;base64,...") or null.
 * @returns {Promise<string>} The raw text response from the model.
 */
async function getGeminiReply(msg, context, mode, imageToSend = null) {
    
    // --- 1. Setup & Model Selection ---
    const isLite = mode === 'lite';
    // 🟢 FIX: Use 'gemini-2.5-flash' for 'fast' mode, as it's optimized for speed and multimodal, 
    // and 'gemini-2.5-flash-lite' for 'lite'. 'pro' is too slow for a 'fast' alias.
    const model = isLite ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
    const botName = 'SteveAI-' + mode;

    // Parameters for Gemini requests (can be loaded from a config if necessary)
    const generationParams = {
        temperature: 0.8,
        topP: 0.9,
    };

    // Tools setup (Google Search is the only tool for 'lite' mode)
    // ⚠️ Tools removed from payload to fix 400 error, but still defining for context
    const tools = isLite ? [
        {
            "googleSearch": {}
        }
    ] : [];

    // --- 2. System Prompt Construction and Formatting ---
    const imageModelNames = IMAGE_MODELS.map(m => m.name).join(', ');
    
    let coreInstructions = `You are ${botName}, made by saadpie and vice ceo shawaiz ali yasin. You enjoy getting previous conversation. 

  1. **Reasoning:** You must always output your reasoning steps inside <think> tags, followed by the final answer, UNLESS an image is being generated.
  2. **Image Generation:** If the user asks you to *generate*, *create*, or *show* an image, you must reply with **ONLY** the following exact pattern. **DO NOT add any greetings, explanations, emojis, periods, newlines, or follow-up text whatsoever.** Your output must be the single, raw command string: 
     Image Generated:model:model name,prompt:prompt text
     Available image models: ${imageModelNames}. Use the most relevant model name in your response.
     recommend model that supports everything and is best is imagen4
     `;

    // Add tool instruction context only for 'lite' mode 
    if (isLite) {
        const toolContext = '\n3. Real-Time Knowledge: You have access to the Google Search tool to answer questions about current events or information not present in your training data.';
        coreInstructions += toolContext;
    }

    const systemInstruction = coreInstructions.trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '); 

    // --- 3. API Key & URL Setup with CORS Proxy ---
    
    const geminiKey = API_KEYS[0]; 
    if (!geminiKey) {
        throw new Error("Gemini API key (index 0) is missing from config.");
    }
    
    const geminiBase = API_BASE[1];
    
    // Correct path: Insert /models/ into the path
    const targetUrl = `${geminiBase}/models/${model}:generateContent?key=${geminiKey}`; 

    // Use the proxiedURL function to wrap the target URL.
    const finalUrl = proxiedURL(targetUrl); 

    // --- 4. Payload Construction (Multi-Modal Update) ---
    
    // 🟢 NEW: Construct the parts array for the final user message
    const userParts = [];
    
    // 4a. Add Image Part if present
    if (imageToSend) {
        // The data URL format is "data:<mime type>;base64,<data>"
        const [mimeTypePart, base64Data] = imageToSend.split(',');
        const mimeType = mimeTypePart.split(':')[1].split(';')[0];

        userParts.push({
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        });
    }

    // 4b. Add Text Part (Context and Message)
    userParts.push({ 
        text: `${context}\n\nUser: ${msg}` 
    });


    // 4c. Construct the final contents array
    const geminiContents = [
        // System instructions are now placed first as a separate entry
        { role: "user", parts: [{ text: systemInstruction }] }, 
        
        // Final user message, including image and text
        { role: "user", parts: userParts } 
    ];


    const generationConfig = {};
    const configKeys = ['temperature', 'topK', 'topP', 'maxOutputTokens', 'stopSequences']; 
    configKeys.forEach(key => {
        if (generationParams[key] !== undefined) {
            generationConfig[key] = generationParams[key];
        }
    });

    const payload = {
        // model: model, // The model is already in the URL
        contents: geminiContents,
        
        ...(Object.keys(generationConfig).length > 0 && { generationConfig: generationConfig }),
    };


    // --- 5. Fetch and Return Reply ---
    try {
        const headers = {
            'Content-Type': 'application/json',
        };

        const res = await fetch(finalUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Gemini API Error Status: ${res.status}. Text: ${errorText}`);
            throw new Error(`Proxy/API call failed. Status: ${res.status}. Response: ${errorText.substring(0, 150)}...`);
        }
        
        const data = await res.json();
        
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
             // ⚠️ Check for blocked reasons (e.g., safety)
             const blockReason = data?.candidates?.[0]?.finishReason;
             if (blockReason) {
                 throw new Error(`Gemini API returned no content. Finish reason: ${blockReason}.`);
             }
             throw new Error("Gemini API returned an empty or unparsable response.");
        }
        
        return reply;

    } catch (e) {
        console.error("Gemini Fetch Error:", e);
        throw new Error(`Failed to fetch. Check network or proxy configuration. Original error: ${e.message}`); 
    }
}

// --- EXPORT ---
export { getGeminiReply };
