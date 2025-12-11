// gemini-live.js
// Dedicated module for managing the stateful WebSocket connection to the Gemini Live API.

// --- Module Imports ---
import config from './config.js'; 

const { API_KEYS, LIVE_API_BASE, GEMINI_MODELS } = config; 

// The Live API model is specifically optimized for low-latency voice/vision
const LIVE_MODEL = GEMINI_MODELS.live; 

/**
 * Manages the WebSocket connection for the Gemini Live API.
 * This is a stateful session for continuous, real-time communication.
 * @param {Function} onMessage - Callback(content) for real-time model responses (text, audio, turnComplete).
 * @param {Function} onError - Callback(errorMsg) for connection or session errors.
 * @param {object | null} initialInput - Optional object { text: string, image: string } for the first turn.
 * @returns {object} An object with methods to start/stop the session and send media.
 */
function startLiveSession(onMessage, onError, initialInput = null) {
    const geminiKey = API_KEYS[0]; 
    if (!geminiKey) {
        onError("Gemini API key is missing from config.");
        return { closeSession: () => {} };
    }

    // --- 1. SETUP URL & CONNECTION ---
    const serviceUrl = `${LIVE_API_BASE}/v1beta/generative/bidirectional/sessions?key=${geminiKey}`; 
    
    const ws = new WebSocket(serviceUrl);
    let isSetupComplete = false;

    // --- Helper for Image to Live API Format ---
    const createInlineDataPart = (base64Image) => {
        if (!base64Image || typeof base64Image !== 'string') return null;

        // The data URL format is "data:<mime type>;base64,<data>"
        const [mimeTypePart, base64Data] = base64Image.split(',');
        const mimeType = mimeTypePart.split(':')[1].split(';')[0];
        
        return {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };
    };

    // --- 2. WEBSOCKET EVENT HANDLERS ---
    
    ws.onopen = () => {
        // --- A. SEND SESSION CONFIGURATION (BidiGenerateContentSetup) ---
        let initialClientContent = undefined;

        if (initialInput && (initialInput.text || initialInput.image)) {
            const parts = [];
            
            // 1. Add Image Part if present
            const imagePart = createInlineDataPart(initialInput.image);
            if (imagePart) {
                parts.push(imagePart);
            }
            // 2. Add Text Part if present
            if (initialInput.text) {
                parts.push({ text: initialInput.text });
            }

            if (parts.length > 0) {
                // This will be the first user turn sent with the setup message
                initialClientContent = { parts: parts };
            }
        }
        
        const setupMessage = {
            setup: {
                model: LIVE_MODEL,
                system_instruction: { 
                    parts: [{ text: "You are the SteveAI Live Assistant. You provide brief, immediate, and interruptible verbal responses. You have access to Google Search for real-time knowledge." }] 
                },
                generation_config: {
                    temperature: 0.8,
                    response_modalities: ["audio", "text"], 
                    speech_config: { 
                        language_code: "en-US", 
                    },
                    tools: [{ googleSearch: {} }],
                    thinking_level: "low", 
                },
                audio_input_config: {
                    sample_rate_hertz: 16000,
                    encoding: "LINEAR_PCM", 
                },
                // 🟢 NEW: Include the first turn content with setup
                ...(initialClientContent && { client_content: initialClientContent }), 
            }
        };
        
        ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // --- B. HANDLE SERVER MESSAGES ---
        if (data.setupComplete) {
            isSetupComplete = true;
            console.log("Gemini Live Session Setup Complete.");
            // Send a ready message to the live.js front-end
            if (!initialInput) {
                 // Only send the default ready message if no initial input was provided
                 onMessage({ text: 'Session connected. Ready to listen.', turnComplete: true });
            }
            // If initialInput was used, the first response will be the model's reply.
        } else if (data.serverContent) {
            // This is the model's real-time response stream
            onMessage(data.serverContent);
            
            if (data.serverContent.toolCall) {
                console.log("Live Tool Call Triggered:", data.serverContent.toolCall);
                // NOTE: Logic to route toolCall and send toolResult is needed here.
            }
        }
    };

    ws.onerror = (e) => {
        console.error("Live WebSocket Error:", e);
        const errorMsg = e.message || "Unknown WebSocket error.";
        onError(`Live session failed. Error: ${errorMsg}`);
    };

    ws.onclose = () => {
        console.log("Live session closed.");
        onError(null); 
    };
    
    // --- 3. SESSION CONTROLS ---

    const sessionControls = {
        /** * Sends real-time input (audio chunks, text, or tool results) to the Live API.
         * @param {ArrayBuffer | object} input - Raw 16-bit PCM ArrayBuffer (for audio), 
         * or an object: 
         * - { text: "user message", image: "Base64 image data" }
         * - { toolResult: { toolCallId: "...", parts: [{ text: "..." }] } }
         */
        sendRealtimeInput: (input) => {
            if (!isSetupComplete || ws.readyState !== WebSocket.OPEN) {
                console.warn("Live session not ready to send input.");
                return;
            }
            
            let message = {};
            
            if (input instanceof ArrayBuffer) {
                // Sending raw audio data
                const bytes = new Uint8Array(input);
                let binaryString = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binaryString += String.fromCharCode(bytes[i]);
                }
                const base64Audio = btoa(binaryString);
                
                message.audioChunk = { data: base64Audio };

            } else if (input.text || input.image) {
                // 🟢 UPDATED: Sending text and/or image data
                const parts = [];
                const imagePart = createInlineDataPart(input.image);
                if (imagePart) {
                    parts.push(imagePart);
                }
                if (input.text) {
                    parts.push({ text: input.text });
                }

                if (parts.length > 0) {
                    message.clientContent = { parts: parts };
                } else {
                    return; // No content to send
                }
            } else if (input.toolResult) {
                // Sending tool result (for completeness, though not fully implemented here)
                message.toolResult = input.toolResult;
            } else {
                return;
            }

            ws.send(JSON.stringify({ realtimeInput: message }));
        },
        
        /** Closes the WebSocket connection. */
        closeSession: () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
    };

    return sessionControls;
}

// --- EXPORT ---
export { startLiveSession };
