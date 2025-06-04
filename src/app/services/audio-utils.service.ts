import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class AudioUtilsService {
    private readonly CHUNK_SIZE = 1024;
    
    constructor() { }

    async convertToWav(base64Audio: string, sampleRate?: number): Promise<string> {
        let audioContext: AudioContext | null = null;
        try {
            if (!base64Audio) {
                throw new Error('No audio data provided');
            }

            // Remove any data URL prefix if present
            const base64Data = base64Audio.replace(/^data:audio\/\w+;base64,/, '');
            
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await this.decodeBase64Audio(base64Data, audioContext);
            
            if (!audioBuffer) {
                throw new Error('Failed to decode audio data');
            }

            const wavData = this.audioBufferToWav(audioBuffer, sampleRate || audioBuffer.sampleRate);
            return this.arrayBufferToBase64(wavData);
        } catch (error) {
            console.error('Error converting audio to WAV:', error);
            throw error;
        } finally {
            if (audioContext) {
                try {
                    await audioContext.close();
                } catch (e) {
                    console.error('Error closing audio context:', e);
                }
            }
        }
    }

    private async decodeBase64Audio(base64Audio: string, audioContext: AudioContext): Promise<AudioBuffer> {
        try {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            
            // Fill bytes array directly without chunking
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            return await audioContext.decodeAudioData(bytes.buffer);
        } catch (error) {
            console.error('Error decoding audio data:', error);
            throw error;
        }
    }

    private audioBufferToWav(buffer: AudioBuffer, sampleRate: number): ArrayBuffer {
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length * numChannels * 2; // 16-bit samples
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);

        // Write WAV header
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');                    // RIFF identifier
        view.setUint32(4, 36 + length, true);     // File length
        writeString(8, 'WAVE');                    // WAVE identifier
        writeString(12, 'fmt ');                   // Format chunk identifier
        view.setUint32(16, 16, true);             // Format chunk length
        view.setUint16(20, 1, true);              // Sample format (PCM)
        view.setUint16(22, numChannels, true);    // Channel count
        view.setUint32(24, sampleRate, true);     // Sample rate
        view.setUint32(28, sampleRate * 2, true); // Byte rate (sample rate * block align)
        view.setUint16(32, 2, true);              // Block align (channel count * bytes per sample)
        view.setUint16(34, 16, true);             // Bits per sample
        writeString(36, 'data');                   // Data chunk identifier
        view.setUint32(40, length, true);         // Data chunk length

        // Write audio data
        const channelData = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i));
        let offset = 44;
        const volume = 1;
        const blockAlign = numChannels * 2;

        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                let sample = channelData[channel][i] * volume;
                sample = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return arrayBuffer;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
} 