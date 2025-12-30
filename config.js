// config.js
const API_BASE = [
  "https://api.a4f.co/v1",
  "https://generativelanguage.googleapis.com/v1"
];

const LIVE_API_BASE = "wss://generativelanguage.googleapis.com"; 

const PROXY = "https://corsproxy.io/?url=";
const proxiedURL = (base) => PROXY + encodeURIComponent(base);

const API_KEYS = [
  "SECRET_KEY_PLACEHOLDER", // This placeholder protects you from AI Studio
  "ddc-a4f-b8f8cda5737b4dcc98a3df9764a0579a", 
  "ddc-a4f-d61cbe09b0f945ea93403a420dba8155", 
  "ddc-a4f-93af1cce14774a6f831d244f4df3eb9e"
];

const GEMINI_MODELS = {
    'lite': 'gemini-2.5-flash-lite',
    'fast': 'gemini-2.5-flash',
    'live': 'gemini-live-2.5-flash-preview',
};

const config = {
    API_BASE,
    LIVE_API_BASE,
    PROXY,
    proxiedURL,
    API_KEYS,
    GEMINI_MODELS
};

export default config;
