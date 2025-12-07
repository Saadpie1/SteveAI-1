// gemini.js

// --- Module Imports ---
import { IMAGE_MODELS } from './image.js'; 
import { FUNCTION_TOOLS } from './function_tools.js'; // <-- NEW IMPORT (You will need to create this file)
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
 * @param {string | null} customSystemInstruction - An optional custom system prompt to override the default.
 * @returns {Promise<string>} The raw text response from the model.
 */
async function getGeminiReply(msg, context, mode, imageToSend = null, customSystemInstruction = null) {
    
    // --- 1. Setup & Model Selection ---
    const isLite = mode === 'lite';
    const model = isLite ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
    const botName = 'SteveAI-' + mode;

    // Parameters for Gemini requests (can be loaded from a config if necessary)
    const generationParams = {
        temperature: 0.8,
        topP: 0.9,
    };

    // 🟢 UPDATED: Tools Setup
    let tools = [];
    const googleSearchTool = { "googleSearch": {} };

    if (isLite) {
        // 'lite' mode only gets Google Search
        tools.push(googleSearchTool);
    } else {
        // 'fast' mode gets Function Calling tools AND Google Search
        if (FUNCTION_TOOLS) {
            // Add custom function declarations
            tools = [...FUNCTION_TOOLS];
        }
        tools.push(googleSearchTool);
    }
    // -------------------------

    // --- 2. System Prompt Construction and Formatting ---
    let systemInstruction;

    if (customSystemInstruction) {
        // 🟢 USE CUSTOM INSTRUCTION (for hidden analysis calls from chat.js)
        systemInstruction = customSystemInstruction.trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '); 
    } else {
        // 🟡 USE DEFAULT INSTRUCTION (for standard chat calls)
        let coreInstructions = `You are ${botName}, made by saadpie and vice ceo shawaiz ali yasin. You enjoy getting previous conversation. 

  1. **Reasoning:** You must always output your reasoning steps inside <think> tags, followed by the final answer, UNLESS an image is being generated or a function is being called.
  2. **Image Generation/Editing:** You can be asked to generate or edit images. When constructing the command, you **MUST** ensure the 'prompt' field is **VERY SPECIFIC**, detailed, and descriptive, especially if an image is provided for editing. The prompt must describe the **desired outcome** clearly (e.g., "a photorealistic 1950s car driving on a rainy street"). If the user provided an image, your prompt must describe the new image, incorporating the original image content and the requested edits.
  
     If the user asks you to *generate*, *create*, or *show* an image, you must reply with **ONLY** the following exact pattern. **DO NOT add any greetings, explanations, emojis, periods, newlines, or follow-up text whatsoever.** Your output must be the single, raw command string: 
     Image Generated:model:Imagen 4 (Original),prompt:prompt text
     **IMPORTANT:** You must always use "Imagen 4 (Original)" as the model name in the output pattern, as this is the only model available for generation.
     `;

        // Add tool instruction context only if tools are enabled
        if (tools.length > 0) {
            const toolContext = `\n3. Tool Use: You have access to external tools (like Google Search and custom functions) to answer questions, access real-time data, or perform actions. If a tool is relevant, you must use it before generating a final response.`;
            coreInstructions += toolContext;
        }

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


    // 4c. Construct the final contents array - ONLY conversational turns go here.
    const geminiContents = [
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
        
        ...(systemInstruction && { systemInstruction: systemInstruction }), 
        
        // 🟢 TOOLS: Only include the tools field if the tools array is populated
        ...(tools.length > 0 && { tools: tools }),
        
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
        
        // --- 6. Function Calling Check (Crucial for the next step in chat.js) ---
        const functionCall = data?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
        if (functionCall) {
            // The model is requesting a function call. We return a custom JSON/String 
            // that chat.js can easily parse to execute the function.
            // Example: "TOOL_CALL:get_weather:{\"city\":\"London\"}"
            const funcName = functionCall.name;
            const funcArgs = JSON.stringify(functionCall.args);
            // You will need to implement the parsing of this in your chat.js
            return `TOOL_CALL:${funcName}:${funcArgs}`;
        }
        // ------------------------------------------------------------------------

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
