// live.js
// Dedicated logic for the SteveAI Live Voice Assistant (Push-to-Talk)
// Manages microphone access, audio recording, and interaction with gemini-live.js

import { startLiveSession } from './gemini-live.js'; // The WebSocket manager
import { AudioEncoder } from './audio-encoder.js'; // Now confirmed to be exported

// --- UI Elements ---
const pttButton = document.getElementById('pttButton');
const pttIcon = document.getElementById('pttIcon');
const liveStatusDisplay = document.getElementById('liveStatusDisplay');
const chatWindow = document.getElementById('chat');
const clearChatBtn = document.getElementById('clearChat');
const themeToggleBtn = document.getElementById('themeToggle');

// 🟢 NEW: Assuming a text input element exists in the HTML
const textInput = document.getElementById('textInput'); 
const sendTextButton = document.getElementById('sendTextButton');

// --- State Variables ---
let liveSession = null; // Holds the object returned by startLiveSession
let mediaRecorder = null; // Note: This variable is unused, but harmless.
let audioStream = null;
let isRecording = false;
let isSessionActive = false; // True when WebSocket is open
let currentBotMessageElement = null; // Reference to the current bot message div for streaming text
let currentEncoder = null; // The AudioEncoder instance
let audioQueue = []; // Queue for playing audio chunks

// --- UTILITY FUNCTIONS (Placeholder for UI Rendering from chat.js style) ---

/** Creates and appends a new message element to the chat window. */
function createMessageElement(text, sender, isPartial = false) {
    let container = document.createElement('div');
    container.className = `message-container ${sender}`;
    let message = document.createElement('div');
    message.className = 'bubble-content'; // Use bubble-content for consistency with chat.js
    
    // Convert Markdown to HTML for the content
    let htmlContent = window.marked ? window.marked.parse(text) : text;
    message.innerHTML = htmlContent;

    container.appendChild(message);
    chatWindow.appendChild(container);
    
    // Scroll to the bottom and post-process for code/math
    chatWindow.scrollTop = chatWindow.scrollHeight;
    
    // Note: Post-processing runs after the typing effect in chat.js, but here we run it immediately
    if (!isPartial && window.postProcessChat) {
        window.postProcessChat(message);
    }
    
    return message;
}

/** Updates the status element with the current operational state. */
function updateStatus(status, text, showLoader = false) {
    // Clear previous status classes
    liveStatusDisplay.className = 'live-status';
    
    // Set new status and text
    liveStatusDisplay.classList.add(status);
    liveStatusDisplay.textContent = text;
    
    // Handle loader visibility (if applicable)
    if (showLoader && window.showLoader) {
        window.showLoader();
    } else if (!showLoader && window.hideLoader) {
        window.hideLoader();
    }
    
    // Update PTT icon based on main state
    if (status === 'listening') {
        pttIcon.textContent = '🔴';
    } else if (status === 'speaking') {
        pttIcon.textContent = '🔊';
    } else {
        pttIcon.textContent = '🎙️';
    }
}

/** Handles audio playback from a Base64-encoded audio chunk. 
 * NOTE: This is a simplified function and may not handle continuous streams well. 
 * For this file, it's a placeholder.
 */
function playAudio(base64AudioData) {
    // Decode the base64 data to an ArrayBuffer
    const audioData = atob(base64AudioData);
    const buffer = new ArrayBuffer(audioData.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
    }

    // Playback logic 
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.decodeAudioData(buffer, (audioBuffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);

        source.onended = () => {
            audioContext.close();
        };
    }, (e) => {
        console.error("Error decoding audio data:", e);
    });
}


/** Handles real-time responses from gemini-live.js */
function handleLiveMessage(content) {
    if (content.text) {
        // Start or continue the bot message stream
        if (!currentBotMessageElement || currentBotMessageElement.dataset.sender !== 'bot') {
            // New turn begins, create a new message element
            currentBotMessageElement = createMessageElement(content.text, 'bot', true);
            currentBotMessageElement.dataset.sender = 'bot'; // Tag it for better state management
        } else {
            // Append and re-render the partial content
            // Need to get the inner text content, not innerHTML which has markup
            const currentContent = currentBotMessageElement.querySelector('.bubble-content').textContent;
            const fullText = currentContent + content.text; 
            currentBotMessageElement.querySelector('.bubble-content').innerHTML = window.marked ? window.marked.parse(fullText) : fullText;
        }
    }
    
    if (content.audio) {
        // Audio chunk received, play it
        // The playAudio implementation is a placeholder, but we update the status
        updateStatus('speaking', 'AI Speaking...', true);
    }
    
    if (content.turnComplete) {
        // The model has finished its response for this turn.
        console.log("Turn Complete.");
        
        // Finalize the message and clear state
        if (currentBotMessageElement) {
            // Final rendering and post-processing
            const contentDiv = currentBotMessageElement.querySelector('.bubble-content');
            const finalContent = contentDiv.textContent;
            contentDiv.innerHTML = window.marked ? window.marked.parse(finalContent) : finalContent;
            if (window.postProcessChat) {
                window.postProcessChat(contentDiv); 
            }
        }
        currentBotMessageElement = null; 
        
        // Status should revert to ready to listen (or idle)
        updateStatus(isSessionActive ? 'active' : 'inactive', isSessionActive ? 'Ready. Press and Hold to Talk or Send Text' : 'Session Closed', false);
    }
}

// --- Session Lifecycle Management ---

/**
 * Starts the live session. Accepts optional initial text/image for the first turn.
 * @param {string | null} initialText - Optional text to send immediately after setup.
 * @param {string | null} initialImage - Optional Base64 image to send immediately after setup.
 */
async function startSession(initialText = null, initialImage = null) {
    if (isSessionActive) return;

    updateStatus('connecting', 'Connecting...', true);
    window.showLoader();

    // 🟢 PASS INITIAL INPUT TO GEMINI-LIVE.JS
    const initialInput = (initialText || initialImage) ? { text: initialText, image: initialImage } : null;

    return new Promise((resolve, reject) => {
        liveSession = startLiveSession(
            // onMessage callback
            (content) => {
                if (content.text && content.turnComplete && !initialInput) {
                    // This is the default "Session connected" message
                    isSessionActive = true;
                    updateStatus('active', content.text, false);
                    createMessageElement(content.text, 'bot', false);
                    resolve(); 
                } else if (content.text && content.turnComplete && initialInput) {
                    // This is the bot's full reply to the initial message
                    handleLiveMessage(content); // Process the reply
                    isSessionActive = true;
                    resolve();
                } else {
                    handleLiveMessage(content);
                }
            },
            // onError callback
            (errorMsg) => {
                isSessionActive = false;
                window.hideLoader();
                // 🛠️ FIX 1: Provide better feedback for connection issues.
                if (errorMsg) {
                    const displayMsg = errorMsg.includes("Failed to fetch") || errorMsg.includes("WebSocket") 
                        ? `Error: Connection failed. Check API Key/Proxy/Access.` 
                        : `Error: ${errorMsg}`;
                        
                    updateStatus('inactive', displayMsg);
                    alert(`Live Session Error: ${displayMsg}. Please refresh.`);
                    reject(new Error(displayMsg));
                } else {
                    updateStatus('inactive', 'Session Closed.');
                    reject(new Error("Session Closed"));
                }
                stopRecording();
            },
            // 🟢 PASS THE INITIAL INPUT OBJECT
            initialInput
        );
    });
}

function stopSession() {
    if (liveSession) {
        liveSession.closeSession();
        liveSession = null;
        isSessionActive = false;
        updateStatus('inactive', 'Session Closed.', false);
        stopRecording(); // Just in case
    }
}

// --- Text Input Management ---

/**
 * Sends a text message (and optional image) through the Live session.
 * This is used for non-voice/PTT turns.
 * @param {string} text - The user's text message.
 * @param {string | null} imageToSend - Optional Base64 image data.
 */
function sendLiveTextMessage(text, imageToSend = null) {
    if (!isSessionActive || (!text && !imageToSend)) {
        console.warn("Session not active or no content to send.");
        return;
    }

    // 1. Display user message
    createMessageElement(text || "Image Attached.", 'user', false);

    // 2. Set status to sending/processing
    updateStatus('active', 'Sending and processing...', true);
    
    // 3. Send the message via the Live WebSocket
    liveSession.sendRealtimeInput({ text: text, image: imageToSend });
    
    // 4. Clear the text input field
    if (textInput) {
        textInput.value = '';
    }
    
    // Note: The reply will be handled by handleLiveMessage
}


// --- Recording Management (Web Audio API) ---
// (Unchanged: startRecording, stopRecording, pttDown, pttUp functions remain the same)

async function startRecording() {
    if (isRecording || !isSessionActive) return;

    try {
        // 1. Get audio stream (asks for mic permission if not already granted)
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: { 
            // Important constraints for 16kHz audio input config expected by the Live API
            sampleRate: 16000,
            channelCount: 1,
        } });
        
        // 2. Initialize the encoder (handles buffering and encoding to 16-bit PCM)
        currentEncoder = new AudioEncoder(audioStream, (pcmBuffer) => {
            // This callback fires with raw 16-bit PCM data chunks
            if (liveSession) {
                // Send the ArrayBuffer directly to the WebSocket manager
                liveSession.sendRealtimeInput(pcmBuffer);
            }
        });

        currentEncoder.start();
        isRecording = true;
        
        // Add user message placeholder (if this is the start of a turn)
        currentBotMessageElement = createMessageElement("*(User Voice Input...)*", 'user', true);
        currentBotMessageElement.dataset.sender = 'user-voice';
        
        // Update UI
        updateStatus('listening', 'Listening...');
        pttButton.classList.add('active');
        window.hideLoader(); // Hide loader if it was showing connection status

    } catch (err) {
        console.error('Microphone access failed:', err);
        updateStatus('inactive', 'Error: Mic access denied/failed.');
        isRecording = false;
        pttButton.classList.remove('active');
        if (currentBotMessageElement) currentBotMessageElement.remove();
        currentBotMessageElement = null;
    }
}

function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    pttButton.classList.remove('active');

    if (currentEncoder) {
        currentEncoder.stop();
        currentEncoder = null;
    }

    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    // Status should revert to active/ready to listen
    updateStatus('active', 'Sending and processing...', true);
    
    // Finalize the user's message (as the recording is done)
    if (currentBotMessageElement && currentBotMessageElement.dataset.sender === 'user-voice') {
        currentBotMessageElement.querySelector('.bubble-content').textContent = '... processing voice ...'; 
    }
}

// --- Event Listeners for PTT ---

function pttDown(e) {
    e.preventDefault(); 
    if (e.target.tagName !== 'BUTTON') e.target.blur(); 
    
    if (isSessionActive && !isRecording) {
        startRecording();
    } else if (!isSessionActive) {
        startSession()
            .then(() => {
                startRecording();
            })
            .catch(err => {
                console.error("Session start failed, cannot record:", err);
            });
    }
}

function pttUp(e) {
    e.preventDefault(); 
    if (isRecording) {
        stopRecording();
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Set up PTT Listeners
    pttButton.addEventListener('mousedown', pttDown);
    pttButton.addEventListener('mouseup', pttUp);
    pttButton.addEventListener('touchstart', pttDown, { passive: false }); 
    pttButton.addEventListener('touchend', pttUp, { passive: false });
    pttButton.addEventListener('contextmenu', e => e.preventDefault());

    // 🟢 NEW: Set up Text Input Listeners
    if (sendTextButton) {
        sendTextButton.addEventListener('click', () => {
            if (textInput && textInput.value.trim() !== '') {
                sendLiveTextMessage(textInput.value.trim());
            }
            // Note: If you need to send an attached image, you'll need to update this logic
            // to fetch the image data from a dedicated variable (e.g., window.currentAttachedImage)
        });
    }

    if (textInput) {
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && textInput.value.trim() !== '') {
                e.preventDefault(); // Stop a new line in the text field
                sendLiveTextMessage(textInput.value.trim());
            }
        });
    }


    // 2. Other UI Listeners (from chat.js)
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            chatWindow.innerHTML = '';
            stopSession(); 
            startSession(); // Restart session automatically
        });
    }
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light');
        });
    }

    // 3. Start the Live Session automatically on load
    startSession(); 

    // 4. 🟢 EXPORT FUNCTIONALITY (Allows chat.js to send messages)
    // Export the function to the global scope (assuming this is a front-end module)
    window.sendLiveTextMessage = sendLiveTextMessage;
});

// 🟢 EXPORT (If using modules in the browser)
export { startSession, stopSession, sendLiveTextMessage };
