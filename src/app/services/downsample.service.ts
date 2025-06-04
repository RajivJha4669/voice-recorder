import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';

@Injectable({
    providedIn: 'root'
})
export class DownsampleService {
    private isWeb: boolean;
    private TARGET_SAMPLE_RATE = 16000; // 16kHz

    constructor(private platform: Platform) {
        this.isWeb = !this.platform.is('hybrid');
    }

    async downsampleAudio(base64Audio: string, mimeType: string): Promise<string> {
        try {
            // Convert base64 to ArrayBuffer
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            // Process in chunks to avoid stack overflow
            for (let i = 0; i < binaryString.length; i += 1024) {
                const chunk = binaryString.slice(i, i + 1024);
                for (let j = 0; j < chunk.length; j++) {
                    bytes[i + j] = chunk.charCodeAt(j);
                }
            }

            // Create AudioContext
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            // Decode the audio data
            const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
            
            // Create offline context for downsampling
            const offlineContext = new OfflineAudioContext(
                1, // Force mono channel
                Math.ceil(audioBuffer.duration * this.TARGET_SAMPLE_RATE),
                this.TARGET_SAMPLE_RATE
            );

            // Create buffer source
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();

            // Render the downsampled audio
            const renderedBuffer = await offlineContext.startRendering();

            // Convert to WAV format
            const wavData = this.audioBufferToWav(renderedBuffer);
            
            // Convert back to base64 in chunks
            const uint8Array = new Uint8Array(wavData);
            const chunks: string[] = [];
            for (let i = 0; i < uint8Array.length; i += 1024) {
                chunks.push(String.fromCharCode.apply(null, 
                    Array.from(uint8Array.subarray(i, i + 1024))
                ));
            }
            return btoa(chunks.join(''));
        } catch (error) {
            console.error('Error downsampling audio:', error);
            throw error;
        }
    }

    private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
        const length = buffer.length * 2; // 16-bit samples
        const data = new DataView(new ArrayBuffer(44 + length));

        // WAV header
        this.writeString(data, 0, 'RIFF');
        data.setUint32(4, 36 + length, true);
        this.writeString(data, 8, 'WAVE');
        this.writeString(data, 12, 'fmt ');
        data.setUint32(16, 16, true);
        data.setUint16(20, 1, true); // PCM format
        data.setUint16(22, 1, true); // Mono channel
        data.setUint32(24, this.TARGET_SAMPLE_RATE, true);
        data.setUint32(28, this.TARGET_SAMPLE_RATE * 2, true); // Byte rate
        data.setUint16(32, 2, true); // Block align
        data.setUint16(34, 16, true); // Bits per sample
        this.writeString(data, 36, 'data');
        data.setUint32(40, length, true);

        // Write audio data
        const samples = buffer.getChannelData(0);
        let offset = 44;
        for (let i = 0; i < samples.length; i += 512) { // Process in chunks
            const chunk = samples.slice(i, i + 512);
            for (let j = 0; j < chunk.length; j++) {
                const sample = Math.max(-1, Math.min(1, chunk[j]));
                data.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return data.buffer;
    }

    private writeString(view: DataView, offset: number, string: string): void {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
} 