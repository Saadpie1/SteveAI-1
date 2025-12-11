// gemini.js

// --- Module Imports ---
import { IMAGE_MODELS } from './image.js'; 
import config from './config.js'; 
// 🟢 NEW: Destructure GEMINI_MODELS from config
const { API_BASE, API_KEYS, proxiedURL, GEMINI_MODELS } = config; 

/**
 * Sends a message to the Gemini API, handling different modes, system instructions, and image data.
 * @param {string} msg - The user's new message.
 * @param {string} context - The summarized and recent chat history.
 * @param {string} mode - The current operational mode ('lite' or 'fast').
 * @param {string | null} imageToSend - The Base64 image data string (e.g., "data:image/jpeg;base64,...") or null.
 * @param {string | null} customSystemInstruction - An optional custom system prompt to override the default.
 * @returns {Promise<string>} The raw text response from the model.
 */
async function getGeminiReply(msg, context, mode, imageToSend = null, customSystemInstruction = null) {
    
    // --- 1. Setup & Model Selection ---
    const isLite = mode === 'lite';
    // 🟢 UPDATE: Use the model map from config
    const model = GEMINI_MODELS[mode] || GEMINI_MODELS['fast']; // Fallback to fast
    const botName = 'SteveAI-' + mode;

    // Parameters for Gemini requests (can be loaded from a config if necessary)
    const generationParams = {
        temperature: 0.8,
        topP: 0.9,
        // 🟢 FIX: You must pass the tools array in the generationConfig for Gemini
        // Tools setup (Google Search is the only tool for 'lite' mode)
        tools: isLite ? [{ googleSearch: {} }] : [],
    };
    
    // ⚠️ The old `tools` variable is no longer needed

    // --- 2. System Prompt Construction and Formatting ---
    let systemInstruction;

    if (customSystemInstruction) {
        // 🟢 USE CUSTOM INSTRUCTION (for hidden analysis calls from chat.js)
        systemInstruction = customSystemInstruction.trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '); 
    } else {
        // 🟡 USE DEFAULT INSTRUCTION (for standard chat calls)
        let coreInstructions = `You are ${botName}, made by saadpie and vice ceo shawaiz ali yasin. You enjoy getting previous conversation. 

  1. **Reasoning:** You must always output your reasoning steps inside <think> tags, followed by the final answer. This rule applies to ALL non-generation tasks, including image analysis, description, and discussion of an attached image.
  2. **Image Generation/Editing Command (STRICT):** You can generate or edit images. This requires a specific command pattern. **You MUST ONLY use this command pattern if the user explicitly uses the keywords:** *generate*, *create*, *make*, or *show* (in the context of image creation), or if the user requests an *edit* to an attached image. 
     
     If the condition is met, your reply MUST be **ONLY** the following single, raw command string: 
     Image Generated:model:Imagen 4 (Original),prompt:prompt text
     **DO NOT** add any reasoning, greetings, or extra text when generating this command. For all other requests, including image analysis/description, follow Rule 1 (use <think> tags). The model name **MUST** be "Imagen 4 (Original)".
     `;

        // ⚠️ REMOVED: Tool instructions are now part of the `tools` array in generationConfig, 
        // they don't need to be explicitly mentioned in the system prompt anymore for tool *use*.

        systemInstruction = coreInstructions.trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '); 
    }

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
    
    // Construct the parts array for the final user message
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
    
    // ⚠️ CRITICAL: If a custom instruction is used (analysis mode), we do NOT send the full context, 
    // we only send the user's new message (`msg`) to prevent the context from polluting the analysis.
    const textContext = customSystemInstruction ? `User: ${msg}` : `${context}\n\nUser: ${msg}`;

    // 4b. Add Text Part (Context and Message)
    userParts.push({ 
        text: textContext 
    });


    // 4c. Construct the final contents array
    const geminiContents = [
        // 🟢 FIX: The system instruction should be passed in the generationConfig object's systemInstruction field, 
        // not as a separate user turn, for proper API usage.
        { role: "user", parts: userParts } 
    ];


    // 🟢 FIX: Restructure generationConfig to correctly pass System Instruction and Tools
    const generationConfig = {
        systemInstruction: systemInstruction, // Moved here
    };

    const configKeys = ['temperature', 'topK', 'topP', 'maxOutputTokens', 'stopSequences', 'tools']; 
    configKeys.forEach(key => {
        if (generationParams[key] !== undefined) {
            generationConfig[key] = generationParams[key];
        }
    });

    const payload = {
        contents: geminiContents,
        
        ...(Object.keys(generationConfig).length > 0 && { generationConfig: generationConfig }),
    };


    // --- 5. Fetch and Return Reply ---
    // ... (rest of the fetch logic remains the same)
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
             // Check for blocked reasons (e.g., safety)
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
