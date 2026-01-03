// puter.js - SteveAI: Bridge Transmitter (Netlify Side)
// Developed by Saadpie - Precision, Efficiency, Scale.

const SATELLITE_URL = "https://steve-ai.puter.site";
let bridgeFrame = null;
const pendingRequests = new Map();

// Initialize the Invisible Satellite Bridge
function initBridge() {
    if (bridgeFrame) return;
    bridgeFrame = document.createElement('iframe');
    bridgeFrame.src = SATELLITE_URL;
    bridgeFrame.id = "steve-satellite-engine";
    // Invisible 1x1 Pixel Trap
    bridgeFrame.style.cssText = "position:fixed; top:-10px; left:-10px; width:1px; height:1px; opacity:0; pointer-events:none; border:none;";
    document.body.appendChild(bridgeFrame);

    window.addEventListener("message", (event) => {
        if (event.origin !== SATELLITE_URL) return;
        const { type, requestId, answer, error } = event.data;
        if (pendingRequests.has(requestId)) {
            const { resolve, reject } = pendingRequests.get(requestId);
            if (type === "STEVE_RES") resolve(answer);
            else reject(new Error(error));
            pendingRequests.delete(requestId);
        }
    });
}

export async function getPuterReply(msg, context, initialModelId) {
    initBridge();
    const requestId = Math.random().toString(36).substring(7);

    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });

        const sendPayload = () => {
            bridgeFrame.contentWindow.postMessage({
                msg,
                context,
                modelId: initialModelId,
                requestId
            }, SATELLITE_URL);
        };

        // If iframe is already loaded, send immediately; otherwise wait for load
        if (bridgeFrame.contentWindow && bridgeFrame.dataset.loaded === "true") {
            sendPayload();
        } else {
            bridgeFrame.onload = () => {
                bridgeFrame.dataset.loaded = "true";
                sendPayload();
            };
        }

        // 70s Timeout for heavy 2026 reasoning models
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error("SteveAI Satellite Link Timeout. Check Puter connection."));
            }
        }, 70000);
    });
}

export const PUTER_MODELS = [
    { id: 'openrouter:x-ai/grok-4.1-fast', label: '🧠 GROK 4.1 (FAST)' },
    { id: 'deepseek-reasoner', label: '🛸 DEEPSEEK R1 (THINKING)' },
    { id: 'gpt-5.2-pro-2025-12-11', label: '🏛️ GPT-5.2 PRO' },
    { id: 'gemini-3-flash-preview', label: '🍃 GEMINI 3 (FLASH)' }
];
