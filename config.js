// config.js

// --- API Config ---
const API_BASE = [
  "https://api.a4f.co/v1/chat/completions",
  "https://generativelanguage.googleapis.com/v1"
];
// 🟢 NEW: Add the Live API Base URL (example placeholder)
const LIVE_API_BASE = "wss://generativelanguage.googleapis.com"; 

const PROXY = "https://corsproxy.io/?url=";
const proxiedURL = (base) => PROXY + encodeURIComponent(base);

// Two API keys as fallback
const API_KEYS = [
  "AIzaSyC708uF50FRON2Hyu_M-EuoU0jecab47jU",
  "ddc-a4f-d61cbe09b0f945ea93403a420dba8155",
  "ddc-a4f-93af1cce14774a6f831d244f4df3eb9e"
];

// 🟢 NEW: Define a model map for easy access
const GEMINI_MODELS = {
    'lite': 'gemini-2.5-flash-lite',
    'fast': 'gemini-2.5-flash',
    'live': 'gemini-live-2.5-flash-preview', // The new model for the Live WSS module
};

// Combine all values into a single object
const config = {
    API_BASE,
    LIVE_API_BASE, // 🟢 EXPORT NEW VALUE
    PROXY,
    proxiedURL,
    API_KEYS,
    GEMINI_MODELS // 🟢 EXPORT NEW VALUE
};

// Export the single object as the default
export default config;
