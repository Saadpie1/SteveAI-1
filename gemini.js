// gemini.js

// --- Module Imports ---
import { IMAGE_MODELS } from './image.js'; 
import config from './config.js'; 

// --- Configuration from Import ---
const API_BASE = config.API_BASE; // Array: [A4F, Gemini]
const API_KEYS = config.API_KEYS; // Array of keys
const proxiedURL = config.proxiedURL; // Function: PROXY + encodeURIComponent(base)

/**
 * Sends a message to the Gemini API, handling different modes and system instructions.
 * @param {string} msg - The user's new message.
 * @param {string} context - The summarized and recent chat history.
 * @param {string} mode - The current operational mode ('lite' or 'fast').
 * @returns {Promise<string>} The raw text response from the model.
 */
async function getGeminiReply(msg, context, mode) {
    
    // --- 1. Setup & Model Selection ---
    const isLite = mode === 'lite';
    const model = isLite ? 'gemini-2.5-flash-lite' : 'gemini-2.5-pro';
    const botName = 'SteveAI-' + mode;

    // Parameters for Gemini requests (can be loaded from a config if necessary)
    const generationParams = {
        temperature: 0.8,
        topP: 0.9,
        // ... other parameters
    };

    // Tools setup (Google Search is the only tool for 'lite' mode)
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
     Available image models: ${imageModelNames}. Use the most relevant model name in your response.`;

    // Add tool instruction context only for 'lite' mode
    if (isLite) {
        const toolContext = '\n3. Real-Time Knowledge: You have access to the Google Search tool to answer questions about current events or information not present in your training data.';
        coreInstructions += toolContext;
    }

    // Clean up the text (remove newlines, collapse extra spaces)
    const systemPromptText = coreInstructions.trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '); 

    // CRITICAL: Construct the systemInstruction as a structured object
    const finalPayloadInstructions = {
        systemInstruction: {
            parts: [{ text: systemPromptText }]
        }
    };

    // --- 3. API Key & URL Setup with CORS Proxy ---
    
    // Use the Gemini API key (Assumed to be the first key in the array: index 0)
    const geminiKey = API_KEYS[0]; 
    if (!geminiKey) {
        throw new Error("Gemini API key (index 0) is missing from config.");
    }
    
    // 3a. Target Gemini URL (Direct API endpoint)
    const geminiBase = API_BASE[1];
    
    // **UPDATE:** Append the API key as a query parameter for CORS proxy compatibility.
    const targetUrl = `${geminiBase}/${model}:generateContent?key=${geminiKey}`; 

    // 3b. Final Proxied URL
    // **UPDATE:** Use the proxiedURL function to wrap the target URL.
    const finalUrl = proxiedURL(targetUrl); 

    // --- 4. Payload Construction ---
    const geminiContents = [
        { 
            role: "user", 
            parts: [{ text: `${context}\n\nUser: ${msg}` }]
        }
    ];

    const generationConfig = {};
    const configKeys = ['temperature', 'topK', 'topP', 'maxOutputTokens', 'stopSequences']; 
    configKeys.forEach(key => {
        if (generationParams[key] !== undefined) {
            generationConfig[key] = generationParams[key];
        }
    });

    const payload = {
        model,
        contents: geminiContents,
        
        // Include the structured systemInstruction object
        ...finalPayloadInstructions, 
        
        ...(Object.keys(generationConfig).length > 0 && { generationConfig: generationConfig }),
        
        // Include tools for lite mode
        ...(tools.length > 0 && { tools: tools }),
    };


    // --- 5. Fetch and Return Reply ---
    try {
        const headers = {
            // **UPDATE:** Only Content-Type is needed, as the API key is now in the URL.
            'Content-Type': 'application/json',
        };

        // **UPDATE:** Use the proxied URL
        const res = await fetch(finalUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Gemini API Error Status: ${res.status}. Text: ${errorText}`);
            // Provide more context in the error message, since it's now proxied
            throw new Error(`Proxy/API call failed. Status: ${res.status}. Response: ${errorText.substring(0, 150)}...`);
        }
        
        const data = await res.json();
        
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
             throw new Error("Gemini API returned an empty or unparsable response.");
        }
        
        return reply;

    } catch (e) {
        console.error("Gemini Fetch Error:", e);
        // Re-throw with more specific context for chat.js
        throw new Error(`Failed to fetch. Check network or proxy configuration. Original error: ${e.message}`); 
    }
}

// --- EXPORT ---
export { getGeminiReply };
