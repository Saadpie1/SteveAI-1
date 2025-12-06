// gemini.js
// --- Module Imports ---
import config from './config.js'; 
import { IMAGE_MODELS } from './image.js'; // Needed for system prompt reference

// --- API Fetch Function (Duplicated from chat.js but focused on fetching) ---
/**
 * Sends the request, routing keys based on the target API type.
 * This is a stripped-down version of fetchAI from chat.js, optimized for Gemini.
 * @param {object} payload - The body of the request.
 * @param {string} model - The model ID being used.
 * @returns {Promise<object>} The successful response data.
 */
async function fetchGemini(payload, model) {
    
    // --- Determine API Routing (Always GEMINI) ---
    const geminiBase = config.API_BASE[1];
    
    // Define the configuration for the Gemini Direct URL
    const urlConfig = { 
        base: geminiBase, 
        // Gemini URL structure: /v1beta/models/MODEL_ID:generateContent
        urlBuilder: (b, m) => `${b}/models/${m}:generateContent`,
        requiresBearer: false, // Key in URL query
        name: 'Gemini Direct',
        keySource: 'GEMINI'
    };

    let lastErrText = "";
    
    const baseUrl = urlConfig.urlBuilder(urlConfig.base, model);

    // --- Select Keys ---
    // Use only the first key for Gemini
    let keysToTry = [config.API_KEYS[0]];
    if (!keysToTry[0]) {
        console.error("Gemini API key (index 0) is undefined. Cannot proceed.");
        throw new Error("Gemini key missing from config.");
    }
    
    // --- Inner loop iterates through selected keys ---
    for (const key of keysToTry) {
        try {
            let finalUrl = `${baseUrl}?key=${key}`; 
            let headers = { 'Content-Type': 'application/json' };

            const res = await fetch(finalUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                
                if (data && data.error) {
                    console.error("Gemini Direct Error Object:", data.error);
                    lastErrText = data.error.message;
                    continue; 
                }
                
                return data; // Success!
            }
            
            lastErrText = await res.text();
            console.error(`Gemini Direct Error Status: ${res.status}. Text: ${lastErrText}`);

        } catch (e) {
            console.error("Network/Fetch Error:", e);
            lastErrText = e.message;
        }
    }
    
    // Re-throw the error with a message that chat.js can catch and display
    throw new Error(`Gemini unreachable. Last Error: ${lastErrText.substring(0, 80)}...`);
}


// --- Main Logic Function ---
/**
 * Handles all logic for fetching replies from the Gemini API.
 * @param {string} msg - The current user message.
 * @param {string} context - The chat history context.
 * @param {string} mode - The current chat mode ('lite' or 'fast').
 * @returns {Promise<string>} The AI's text reply.
 */
export async function getGeminiReply(msg, context, mode) {
    let model;
    let botName;
    let generationParams = {}; 
    let tools = [];

    // 1. Model & Config Setup
    switch (mode) {
        case 'lite': 
            model = "gemini-2.5-flash-lite"; 
            botName = "SteveAI-lite";
            // Set tool and parameters for Lite mode
            tools = [{ googleSearch: {} }]; 
            generationParams = { temperature: 0.7 };
            break;
        case 'fast': 
            model = "gemini-2.5-flash";
            botName = "SteveAI-fast";
            generationParams = {}; 
            break;
        default:
            throw new Error("Invalid mode passed to getGeminiReply.");
    }

    const imageModelNames = IMAGE_MODELS.map(m => m.name).join(', ');

    // 2. System Prompt Construction
    const systemPrompt = `You are ${botName}, made by saadpie and vice ceo shawaiz ali yasin. You enjoy getting previous conversation. 
    
    ${mode === 'lite' ? '3. **Real-Time Knowledge:** You have access to the Google Search tool to answer questions about current events or information not present in your training data.' : ''}

    1. **Reasoning:** You must always output your reasoning steps inside <think> tags, followed by the final answer, UNLESS an image is being generated.
    2. **Image Generation:** If the user asks you to *generate*, *create*, or *show* an image, you must reply with **ONLY** the following exact pattern. **DO NOT add any greetings, explanations, emojis, periods, newlines, or follow-up text whatsoever.** Your output must be the single, raw command string: 
        Image Generated:model:model name,prompt:prompt text
        Available image models: ${imageModelNames}. Use the most relevant model name in your response.
    
    The user has asked: ${msg}`;

    // 3. Payload Construction (Spec Compliant)
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
        
        // Use top-level systemInstruction (Official requirement, resolves the 'user, model' role error)
        systemInstruction: systemPrompt, 
        
        ...(Object.keys(generationConfig).length > 0 && { generationConfig: generationConfig }),
        
        // Add tools at the top level
        ...(tools.length > 0 && { tools: tools }),
    };

    // 4. Fetch and Parse Response
    const data = await fetchGemini(payload, model);
    
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";
    
    return reply;
}
