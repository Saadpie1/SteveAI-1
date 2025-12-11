// audio-encoder.js
// Handles capturing, resampling, and encoding audio stream to 16-bit PCM (16kHz) 
// for the Gemini Live WebSocket API.

/**
 * Encodes incoming audio stream data into 16-bit PCM format at a 16kHz sample rate.
 */
export class AudioEncoder {
    constructor(audioStream, callback) {
        // Target sample rate for Gemini Live API
        this.TARGET_SAMPLE_RATE = 16000; 
        this.callback = callback;
        
        // 1. Setup AudioContext and Source
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.source = this.audioContext.createMediaStreamSource(audioStream);
        
        // 2. Setup ScriptProcessorNode for real-time processing
        // Buffer size (4096 is standard), mono input, mono output
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.processor.onaudioprocess = this._processAudio.bind(this);
        
        // 3. Get actual sample rate (usually 44100 or 48000)
        this.inputSampleRate = this.audioContext.sampleRate;
    }

    start() {
        // Connect the nodes to start processing
        this.source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
    }

    stop() {
        // Disconnect nodes and close context to release resources
        if (this.source) this.source.disconnect();
        if (this.processor) this.processor.disconnect();
        if (this.audioContext) this.audioContext.close();
    }

    /**
     * Resamples the audio data from the device's sample rate to the required 16kHz.
     * @param {Float32Array} buffer - The raw audio buffer from the microphone.
     * @param {number} inputRate - The actual device sample rate (e.g., 44100).
     * @param {number} outputRate - The target sample rate (16000).
     * @returns {Float32Array} The resampled audio buffer.
     */
    _resample(buffer, inputRate, outputRate) {
        if (inputRate === outputRate) {
            return buffer;
        }
        
        const ratio = inputRate / outputRate;
        const newLength = Math.round(buffer.length / ratio);
        const resampled = new Float32Array(newLength);
        
        // Simple linear interpolation for resampling
        for (let i = 0; i < newLength; i++) {
            const index = i * ratio;
            const indexFloor = Math.floor(index);
            const indexCeil = Math.ceil(index);
            const fraction = index - indexFloor;

            const valueFloor = buffer[indexFloor] || 0;
            const valueCeil = buffer[indexCeil] || 0;
            
            resampled[i] = valueFloor + (valueCeil - valueFloor) * fraction;
        }
        return resampled;
    }

    /**
     * Converts a Float32Array (Web Audio format) to a 16-bit PCM ArrayBuffer.
     * @param {Float32Array} buffer - The resampled audio data.
     * @returns {ArrayBuffer} The 16-bit PCM audio data.
     */
    _to16BitPCM(buffer) {
        // Create a new buffer large enough for 16-bit integers
        const buffer16Bit = new ArrayBuffer(buffer.length * 2);
        const view = new DataView(buffer16Bit);
        
        // Scale Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
        for (let i = 0; i < buffer.length; i++) {
            let s = Math.max(-1, Math.min(1, buffer[i]));
            // Scale and convert to signed 16-bit integer (little-endian: false)
            view.setInt16(i * 2, s * 32767, true); 
        }
        return buffer16Bit;
    }

    /**
     * Audio processing handler called by the ScriptProcessorNode.
     * @param {AudioProcessingEvent} event 
     */
    _processAudio(event) {
        // Get the audio data from the first channel (mono)
        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // 1. Resample to 16kHz
        const resampledBuffer = this._resample(
            inputBuffer, 
            this.inputSampleRate, 
            this.TARGET_SAMPLE_RATE
        );

        // 2. Encode to 16-bit PCM ArrayBuffer
        const pcmBuffer = this._to16BitPCM(resampledBuffer);
        
        // 3. Send to the WebSocket manager (gemini-live.js)
        this.callback(pcmBuffer);
    }
}
