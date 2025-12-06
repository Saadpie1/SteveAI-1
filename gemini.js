// gemini.js

// --- Module Imports ---
// Import necessary helper functions and state variables from chat.js
// NOTE: IMAGE_MODELS is imported from image.js in chat.js, but we'll 
// assume for this module's context that the necessary image data is available 
// either via a direct import here or passed in, but typically in a modular JS environment, 
// we only pass what's strictly necessary or import from a shared config/data file.

// For simplicity and adherence to typical structure, we'll assume a shared constant file 
// or that the IMAGE_MODELS array is accessible, which is a key part of your system prompt.

// Since the user didn't provide a direct path for IMAGE_MODELS outside of chat.js,
// we will structure the function to accept the image model list as an argument
// if it cannot be imported directly, or assume its available here.
// Based on chat.js logic, IMAGE_MODELS comes from image.js. Let's import it.
import { IMAGE_MODELS } from './image.js'; 

import config from './config.js'; // Assuming config is needed for API keys/URLs

// --- Configuration ---
const API_BASE = config.API_BASE; // Array: [A4F, Gemini]
const API_KEYS = config.API_KEYS; // Array of keys

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
    // We keep the formatting for readability inside the prompt, but ensure it's clean for the API.
    const systemPromptText = coreInstructions.trim().replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' '); 

    // CRITICAL: Construct the systemInstruction as a structured object
    // that the REST API requires for validation.
    const finalPayloadInstructions = {
        systemInstruction: {
            parts: [{ text: systemPromptText }]
        }
    };

    // --- 3. API Key & URL Setup ---
    
    // Use the Gemini API key (Assumed to be the first key in the array)
    const geminiKey = API_KEYS[0]; 
    if (!geminiKey) {
        throw new Error("Gemini API key (index 0) is missing from config.");
    }
    
    // Gemini Base URL (Assumed to be the second base URL in the array)
    const geminiBase = API_BASE[1];
    const finalUrl = `${geminiBase}/${model}:generateContent`;

    // --- 4. Payload Construction ---
    const geminiContents = [
        { 
            role: "user", 
            // The contents contain the full history/context and the new user message.
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
            'Content-Type': 'application/json',
            'x-api-key': geminiKey // Standard for Gemini API
        };

        const res = await fetch(finalUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Gemini API Error Status: ${res.status}. Text: ${errorText}`);
            throw new Error(`API call failed: ${res.statusText}. Response: ${errorText.substring(0, 150)}...`);
        }
        
        const data = await res.json();
        
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
             throw new Error("Gemini API returned an empty or unparsable response.");
        }
        
        return reply;

    } catch (e) {
        console.error("Gemini Fetch Error:", e);
        throw e; // Re-throw the error to be handled by chat.js
    }
}

// --- EXPORT ---
export { getGeminiReply };
