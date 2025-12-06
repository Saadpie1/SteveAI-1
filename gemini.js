// gemini.js
// --- Module Imports ---
import config from './config.js'; 
import { IMAGE_MODELS } from './image.js'; // Needed for system prompt reference

// --- API Fetch Function (Dedicated to Gemini) ---
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

    // Initialize lastErrText to capture the most recent error
    let lastErrText = "";
    
    const baseUrl = urlConfig.urlBuilder(urlConfig.base, model);

    // --- Select Keys ---
    // Use only the first key for Gemini
    let keysToTry = [config.API_KEYS[0]];
    if (!keysToTry[0]) {
        console.error("Gemini API key (index 0) is undefined. Cannot proceed.");
        lastErrText = "Gemini key missing from config.";
        // We still need to proceed to the final throw outside the loop if keys are missing
    }
    
    // --- Inner loop iterates through selected keys ---
    for (const key of keysToTry) {
        if (!key) continue; // Skip if the key is undefined/null
        
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
                    continue; // Try next key
                }
                
                return data; // Success!
            }
            
            // Capture specific HTTP error details
            lastErrText = await res.text();
            console.error(`Gemini Direct Error Status: ${res.status}. Text: ${lastErrText}`);

        } catch (e) {
            // Capture network/fetch error details
            console.error("Network/Fetch Error:", e);
            lastErrText = e.message;
        }
    }
    
    // CRITICAL FIX APPLIED: Use the captured detailed error message in the throw statement.
    const finalErrorMessage = lastErrText || "Gemini API failed with an unknown error or no key was available.";
    
    // Re-throw the error with a message that chat.js can catch and display
    throw new Error(`Gemini unreachable. Last Error: ${finalErrorMessage.substring(0, 80)}...`);
}


// --- Main Logic Function ---
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

    // 2. System Prompt Construction
    // 💥 FINAL FIX: Stripped down to strict plain text to pass API validation. Removed <think> brackets and all Markdown.
    const rawSystemPrompt = `You are ${botName}, made by saadpie and vice ceo shawaiz ali yasin. You enjoy getting previous conversation.
    
    ${mode === 'lite' ? '3. Real-Time Knowledge: You have access to the Google Search tool to answer questions about current events or information not present in your training data.' : ''}

    1. Reasoning: You must always output your reasoning steps inside the literal text ' <think> ' and ' </think> ' tags, followed by the final answer, UNLESS an image is being generated. 
    2. Image Generation: If the user asks you to generate, create, or show an image, you must reply with ONLY the following exact pattern. DO NOT add any greetings, explanations, or follow-up text whatsoever. Your output must be the single, raw command string: Image Generated:model:model name,prompt:prompt text The model name must be a single, logical choice (e.g., "DALL-E 2", "Animagine XL 2.0").
    `;
    
    // Clean up the template string to produce a single, space-separated instruction string
    // Use a simpler replace for max compatibility.
    const systemPrompt = rawSystemPrompt.trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' '); 

    // 3. Payload Construction (CRITICALLY CORRECT)
    const geminiContents = [
        // CRITICAL: Only 'user' and 'model' roles here. The chat history and current message are passed here.
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
        
        // CORRECT: System instruction is a top-level field.
        systemInstruction: systemPrompt, 
        
        ...(Object.keys(generationConfig).length > 0 && { generationConfig: generationConfig }),
        
        // CORRECT: Tools is a top-level field.
        ...(tools.length > 0 && { tools: tools }),
    };

    // 4. Fetch and Parse Response
    const data = await fetchGemini(payload, model);
    
    // Check if data candidates exist and return text
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";

    // IMPORTANT: If candidates is empty (e.g., due to safety block), 
    // we should ideally return a helpful message. 
    // If the reply is the default "No response from Gemini." check for rejection reasons.
    if (reply === "No response from Gemini." && data?.promptFeedback?.blockReason) {
         return `⚠️ Response blocked by Gemini safety filters. Reason: ${data.promptFeedback.blockReason}`;
    }
    
    return reply;
}
