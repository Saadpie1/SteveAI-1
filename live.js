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

// --- State Variables ---
let liveSession = null; // Holds the object returned by startLiveSession
let mediaRecorder = null; // Note: This variable is unused, but harmless.
let audioStream = null;
let isRecording = false;
let isSessionActive = false; // True when WebSocket is open
let currentBotMessageElement = null; // Reference to the current bot message div for streaming text
let currentEncoder = null; // The AudioEncoder instance

// --- UTILITY FUNCTIONS (Placeholder for UI Rendering from chat.js style) ---

/** Creates and appends a new message element to the chat window. */
function createMessageElement(text, sender, isPartial = false) {
    let container = document.createElement('div');
    container.className = `message-container ${sender}`;
    let message = document.createElement('div');
    message.className = `${sender}-message`;
    
    // Convert Markdown to HTML for the content
    let htmlContent = window.marked ? window.marked.parse(text) : text;
    message.innerHTML = htmlContent;

    container.appendChild(message);
    chatWindow.appendChild(container);
    
    // Scroll to the bottom and post-process for code/math
    chatWindow.scrollTop = chatWindow.scrollHeight;
    
    if (window.postProcessChat) {
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

/** Handles real-time responses from gemini-live.js */
function handleLiveMessage(content) {
    if (content.text) {
        // Start or continue the bot message stream
        if (!currentBotMessageElement) {
            // New turn begins, create a new message element
            currentBotMessageElement = createMessageElement(content.text, 'bot', true);
        } else {
            // Append and re-render the partial content
            const fullText = currentBotMessageElement.innerHTML + content.text;
            currentBotMessageElement.innerHTML = window.marked ? window.marked.parse(fullText) : fullText;
        }
    }
    
    if (content.audio) {
        // Audio chunk received, play it
        if (window.playAudio) {
            window.playAudio(content.audio.data);
            updateStatus('speaking', 'AI Speaking...', true);
        }
    }
    
    if (content.turnComplete) {
        // The model has finished its response for this turn.
        console.log("Turn Complete.");
        
        // Finalize the message and clear state
        if (currentBotMessageElement && window.postProcessChat) {
            window.postProcessChat(currentBotMessageElement); // Final rendering
        }
        currentBotMessageElement = null; 
        
        // Status should revert to ready to listen (or idle)
        updateStatus(isSessionActive ? 'active' : 'inactive', isSessionActive ? 'Ready. Press and Hold to Talk' : 'Session Closed', false);
    }
}

// --- Session Lifecycle Management ---

async function startSession() {
    if (isSessionActive) return;

    updateStatus('connecting', 'Connecting...', true);
    window.showLoader();

    liveSession = startLiveSession(
        // onMessage callback
        (content) => {
            // Initial setup message is received here, but also real-time content
            if (content.text && content.turnComplete) {
                // This is typically the "Session connected. Ready to listen." message
                isSessionActive = true;
                updateStatus('active', content.text, false);
                // Create the initial greeting message in the chat history
                createMessageElement(content.text, 'bot', false);
            } else {
                handleLiveMessage(content);
            }
        },
        // onError callback
        (errorMsg) => {
            isSessionActive = false;
            window.hideLoader();
            if (errorMsg) {
                // 🛠️ FIX 1: Provide better feedback for connection issues.
                const displayMsg = errorMsg.includes("WebSocket") 
                    ? `Error: Connection failed. Check API Key/Access.` 
                    : `Error: ${errorMsg}`;
                    
                updateStatus('inactive', displayMsg);
                alert(`Live Session Error: ${displayMsg}. Please refresh.`);
            } else {
                updateStatus('inactive', 'Session Closed.');
            }
            // Ensure mic/recording is stopped if an error occurs
            stopRecording();
        }
    );
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

// --- Recording Management (Web Audio API) ---

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
    if (currentBotMessageElement) {
        currentBotMessageElement.querySelector('.message-content').textContent = '... processing voice ...'; 
        window.postProcessChat(currentBotMessageElement);
    }
}

// --- Event Listeners for PTT ---

function pttDown(e) {
    // 🟢 CRITICAL: Prevent default browser behavior (context menu, image save, selection)
    e.preventDefault(); 
    // This return ensures no other PTT logic runs if preventDefault() worked.
    // If we return, we prevent the "Press and Hold to Talk" menu from appearing.
    // However, we still need to run our recording logic below.
    
    if (e.target.tagName !== 'BUTTON') e.target.blur(); 
    
    if (isSessionActive && !isRecording) {
        startRecording();
    } else if (!isSessionActive) {
        // If not active, try to start the session first
        startSession().then(() => {
             // You may need a delay here before starting recording, depending on WSS setup speed
        }).catch(err => console.error("Session start failed:", err));
    }
}

function pttUp(e) {
    // 🛠️ FIX 3: Also call preventDefault on mouseup/touchend to prevent any lingering click events
    e.preventDefault(); 
    if (isRecording) {
        stopRecording();
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Set up PTT Listeners
    // Use touch events for mobile and mouse events for desktop PTT
    pttButton.addEventListener('mousedown', pttDown);
    pttButton.addEventListener('mouseup', pttUp);
    
    // 🛠️ FIX 2: Explicitly apply { passive: false } to both touchstart and touchend 
    // to ensure max compatibility for suppressing context menus and clicks.
    pttButton.addEventListener('touchstart', pttDown, { passive: false }); 
    pttButton.addEventListener('touchend', pttUp, { passive: false });
    
    // Prevent context menu on long press anywhere on the button
    pttButton.addEventListener('contextmenu', e => e.preventDefault());

    // 2. Other UI Listeners (from chat.js)
    clearChatBtn.addEventListener('click', () => {
        chatWindow.innerHTML = '';
        // Also clear the session if active
        stopSession(); 
        startSession(); // Restart session automatically
    });
    
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light');
    });

    // 3. Start the Live Session automatically on load
    startSession(); 
});
