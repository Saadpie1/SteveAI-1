// gemini-live.js
// Dedicated module for managing the stateful WebSocket connection to the Gemini Live API.

// --- Module Imports ---
// NOTE: Assuming config.js exports API_KEYS, LIVE_API_BASE, and GEMINI_MODELS.
import config from './config.js'; 

const { API_KEYS, LIVE_API_BASE, GEMINI_MODELS } = config; 

// The Live API model is specifically optimized for low-latency voice/vision
const LIVE_MODEL = GEMINI_MODELS.live; 

/**
 * Manages the WebSocket connection for the Gemini Live API.
 * This is a stateful session for continuous, real-time communication.
 * @param {Function} onMessage - Callback(content) for real-time model responses (text, audio, turnComplete).
 * @param {Function} onError - Callback(errorMsg) for connection or session errors.
 * @returns {object} An object with methods to start/stop the session and send media.
 */
function startLiveSession(onMessage, onError) {
    const geminiKey = API_KEYS[0]; 
    if (!geminiKey) {
        onError("Gemini API key is missing from config.");
        return { closeSession: () => {} };
    }

    // --- 1. SETUP URL & CONNECTION ---
    // The Live API uses a specific, versioned WebSocket endpoint.
    const serviceUrl = `${LIVE_API_BASE}/v1beta/generative/bidirectional/sessions?key=${geminiKey}`; 
    
    // NOTE: In a production environment, you may need to use a proxy 
    // or a server-side authentication layer to manage the WSS connection securely.
    
    const ws = new WebSocket(serviceUrl);
    let isSetupComplete = false;

    // --- 2. WEBSOCKET EVENT HANDLERS ---
    
    ws.onopen = () => {
        // --- A. SEND SESSION CONFIGURATION (BidiGenerateContentSetup) ---
        const setupMessage = {
            setup: {
                model: LIVE_MODEL,
                // System Instruction for a live, fast-responding assistant
                system_instruction: { 
                    parts: [{ text: "You are the SteveAI Live Assistant. You provide brief, immediate, and interruptible verbal responses. You have access to Google Search for real-time knowledge." }] 
                },
                generation_config: {
                    temperature: 0.8,
                    // Request both audio (TTS) and text responses
                    response_modalities: ["audio", "text"], 
                    // Configure text-to-speech (TTS) parameters
                    speech_config: { 
                        language_code: "en-US", 
                        // You might add specific voice models here if supported
                    },
                    // Integrate the Google Search tool for current information
                    tools: [{ googleSearch: {} }],
                    // Use a lower thinking level for faster response times (crucial for live)
                    thinking_level: "low", 
                },
                // Set the audio input format the model expects (16kHz, 16-bit PCM, mono)
                audio_input_config: {
                    sample_rate_hertz: 16000,
                    encoding: "LINEAR_PCM", // Required for raw audio stream
                },
            }
        };
        // The Live API uses a specific, slightly different JSON structure than the REST API
        ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // --- B. HANDLE SERVER MESSAGES ---
        if (data.setupComplete) {
            isSetupComplete = true;
            console.log("Gemini Live Session Setup Complete.");
            // Send a ready message to the live.js front-end
            onMessage({ text: 'Session connected. Ready to listen.', turnComplete: true });
        } else if (data.serverContent) {
            // This is the model's real-time response stream
            onMessage(data.serverContent);
            
            if (data.serverContent.toolCall) {
                // Tool calls need to be routed to SteveAI's 33+ models here
                console.log("Live Tool Call Triggered:", data.serverContent.toolCall);
                // NOTE: Implement logic to route toolCall to other SteveAI models, 
                // get the result, and send it back to the Live session via `sendRealtimeInput`.
            }
        }
    };

    ws.onerror = (e) => {
        console.error("Live WebSocket Error:", e);
        // e.message might be undefined for some WS errors
        const errorMsg = e.message || "Unknown WebSocket error.";
        onError(`Live session failed. Error: ${errorMsg}`);
    };

    ws.onclose = () => {
        console.log("Live session closed.");
        // Clear any UI state in the chat handler
        onError(null); 
    };
    
    // --- 3. SESSION CONTROLS ---

    const sessionControls = {
        /** * Sends real-time input (audio chunks or text) to the Live API.
         * For audio, `input` must be a raw 16-bit PCM ArrayBuffer.
         * For text, `input` must be an object like `{ text: "user message" }`.
         */
        sendRealtimeInput: (input) => {
            if (!isSetupComplete || ws.readyState !== WebSocket.OPEN) {
                console.warn("Live session not ready to send input.");
                return;
            }
            
            let message = {};
            
            if (input instanceof ArrayBuffer) {
                // Sending raw audio data (ArrayBuffer)
                // Convert ArrayBuffer to a binary string, then Base64 encode it.
                const bytes = new Uint8Array(input);
                let binaryString = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binaryString += String.fromCharCode(bytes[i]);
                }
                const base64Audio = btoa(binaryString);
                
                message.audioChunk = { data: base64Audio };

            } else if (input.text) {
                // Sending text data 
                message.clientContent = { text: input.text };
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
