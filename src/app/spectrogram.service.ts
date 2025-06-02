import { Injectable } from '@angular/core';
import FFT from 'fft.js';

@Injectable({
  providedIn: 'root'
})
export class AudioProcessingService {
  private audioContext: AudioContext;
  private readonly fftSize = 512; // Results in 257 frequency bins (FFTSize/2 + 1)
  private readonly melBins = 64; // Exactly 64 frequency bins
  private readonly timeFrames = 173; // Exactly 173 time frames
  private readonly sampleRate = 16000; // Standard for speech processing
  private readonly hopTime = 0.01; // 10ms hop size (for 173 frames ≈ 1.73s audio)

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('Failed to resume AudioContext:', err));
    }
  }

  async generateStandardMelSpectrogram(audioFile: File): Promise<Float32Array> {
    const audioBuffer = await this.loadAudioFile(audioFile);
    const pcmData = this.extractAndResamplePCMData(audioBuffer);
    const spectrogram = this.computeSTFT(pcmData);
    const melSpectrogram = this.computeMelSpectrogram(spectrogram);
    const normalizedMel = this.normalizeToZeroOne(melSpectrogram);

    // Convert to Float32Array in [64][173] layout
    return this.formatForML(normalizedMel);
  }

  private async loadAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  private extractAndResamplePCMData(audioBuffer: AudioBuffer): Float32Array {
    // If source sample rate matches, just return first channel
    if (Math.abs(audioBuffer.sampleRate - this.sampleRate) < 0.1) {
      return audioBuffer.getChannelData(0);
    }

    // Simple resampling (for production use a proper resampler)
    const sourceSR = audioBuffer.sampleRate;
    const targetSR = this.sampleRate;
    const ratio = sourceSR / targetSR;
    const sourceData = audioBuffer.getChannelData(0);
    const targetLength = Math.floor(sourceData.length / ratio);
    const targetData = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      targetData[i] = sourceData[Math.floor(i * ratio)];
    }

    return targetData;
  }

  private computeSTFT(pcmData: Float32Array): number[][] {
    const fft = new FFT(this.fftSize);
    const hopSize = Math.floor(this.hopTime * this.sampleRate);
    const windowSize = this.fftSize;
    const requiredLength = (this.timeFrames - 1) * hopSize + windowSize;

    // Pad or truncate to get exactly 173 frames
    const processedData = this.ensureLength(pcmData, requiredLength);
    const spectrogram: number[][] = [];
    const windowFunction = this.hannWindow(windowSize);

    for (let i = 0; i < this.timeFrames; i++) {
      const start = i * hopSize;
      const frame = new Array(windowSize);

      // Apply window function
      for (let j = 0; j < windowSize; j++) {
        frame[j] = processedData[start + j] * windowFunction[j];
      }

      // Compute FFT (real input)
      const fftOutput = new Array(windowSize * 2);
      fft.realTransform(fftOutput, frame);
      fft.completeSpectrum(fftOutput);

      // Compute magnitude spectrum (first half)
      const magnitudeSpectrum: number[] = [];
      for (let j = 0; j <= windowSize / 2; j++) {
        const re = fftOutput[2 * j];
        const im = fftOutput[2 * j + 1];
        magnitudeSpectrum.push(Math.sqrt(re * re + im * im));
      }

      spectrogram.push(magnitudeSpectrum);
    }

    return spectrogram;
  }

  private computeMelSpectrogram(spectrogram: number[][]): number[][] {
    const melFilter = this.createMelFilterBank();
    const melSpectrogram: number[][] = [];

    for (const spectrum of spectrogram) {
      const melSpectrum = new Array(this.melBins).fill(0);

      for (let m = 0; m < this.melBins; m++) {
        for (let k = 0; k < spectrum.length; k++) {
          melSpectrum[m] += spectrum[k] * melFilter[m][k];
        }
        // Convert to dB (with small epsilon to avoid log(0))
        melSpectrum[m] = 10 * Math.log10(Math.max(1e-10, melSpectrum[m]));
      }

      melSpectrogram.push(melSpectrum);
    }

    return melSpectrogram;
  }

  private createMelFilterBank(): number[][] {
    const melFilter = Array.from({ length: this.melBins }, () =>
      new Array(this.fftSize / 2 + 1).fill(0));

    const minHz = 0;
    const maxHz = this.sampleRate / 2;

    // Convert Hz to Mel scale
    const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
    const melToHz = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

    const minMel = hzToMel(minHz);
    const maxMel = hzToMel(maxHz);

    // Create mel points
    const melPoints = Array.from({ length: this.melBins + 2 }, (_, i) =>
      minMel + i * (maxMel - minMel) / (this.melBins + 1));

    const hzPoints = melPoints.map(melToHz);
    const binPoints = hzPoints.map(hz =>
      Math.floor((this.fftSize / 2 + 1) * hz / maxHz));

    // Create triangular filters
    for (let m = 1; m <= this.melBins; m++) {
      const left = binPoints[m - 1];
      const center = binPoints[m];
      const right = binPoints[m + 1];

      for (let k = left; k < center; k++) {
        melFilter[m - 1][k] = (k - left) / (center - left);
      }

      for (let k = center; k < right; k++) {
        melFilter[m - 1][k] = (right - k) / (right - center);
      }
    }

    return melFilter;
  }

  private normalizeToZeroOne(melSpectrogram: number[][]): number[][] {
    // Find global min and max across entire spectrogram
    let min = Infinity;
    let max = -Infinity;

    for (const frame of melSpectrogram) {
      for (const val of frame) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    // Normalize to [0, 1] range
    return melSpectrogram.map(frame =>
      frame.map(val => (val - min) / (max - min))
    );
  }

  private formatForML(melSpectrogram: number[][]): Float32Array {
    // Create a flat Float32Array in column-major order (frequency bins first)
    const flatArray = new Float32Array(this.melBins * this.timeFrames);

    for (let t = 0; t < this.timeFrames; t++) {
      for (let m = 0; m < this.melBins; m++) {
        flatArray[t * this.melBins + m] = melSpectrogram[t][m];
      }
    }

    return flatArray;
  }

  private ensureLength(data: Float32Array, requiredLength: number): Float32Array {
    if (data.length === requiredLength) return data;

    const newData = new Float32Array(requiredLength);
    if (data.length > requiredLength) {
      // Truncate
      newData.set(data.subarray(0, requiredLength));
    } else {
      // Pad with zeros
      newData.set(data);
    }

    return newData;
  }

  private hannWindow(size: number): number[] {
    const window = new Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return window;
  }

  base64ToFile(base64String: string, filename: string, mimeType: string): File {
    const byteString = atob(base64String.split(',')[1]);
    const byteNumbers = new Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteNumbers[i] = byteString.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], filename, { type: mimeType });
  }


async downsampleAndExportAudio(audioFile: File): Promise<File> {
    try {
      console.log('Starting downsampleAndExportAudio for file:', audioFile.name);
      const audioBuffer = await this.loadAudioFile(audioFile);
      console.log('Audio buffer loaded:', audioBuffer.sampleRate, 'Hz, duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);
      const downsampledBuffer = await this.downsampleAudioBuffer(audioBuffer);
      console.log('Downsampled buffer:', downsampledBuffer.sampleRate, 'Hz, duration:', downsampledBuffer.duration, 'channels:', downsampledBuffer.numberOfChannels);
      const wavBlob = await this.audioBufferToWav(downsampledBuffer);
      console.log('WAV blob created, size:', wavBlob.size);
      return new File([wavBlob], `downsampled_${audioFile.name}`, { type: 'audio/wav' });
    } catch (err) {
      console.error('Error in downsampleAndExportAudio:', err);
      if (err instanceof Error) {
        throw new Error(`Failed to downsample audio: ${err.message}`);
      } else {
        throw new Error('Failed to downsample audio: Unknown error');
      }
    }
  }



  private async downsampleAudioBuffer(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
    const targetSampleRate = this.sampleRate;
    if (Math.abs(audioBuffer.sampleRate - targetSampleRate) < 0.1) {
      console.log('No resampling needed, sample rate matches:', audioBuffer.sampleRate);
      return audioBuffer;
    }

    try {
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.floor(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate),
        targetSampleRate
      );
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();
      console.log('Starting offline rendering for resampling');
      const renderedBuffer = await offlineContext.startRendering();
      console.log('Offline rendering completed');
      return renderedBuffer;
    } catch (err) {
      console.error('Error in downsampleAudioBuffer:', err);
      throw new Error('Failed to resample audio');
    }
  }

  private async audioBufferToWav(audioBuffer: AudioBuffer): Promise<Blob> {
    try {
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const bitsPerSample = 16;
      const bytesPerSample = bitsPerSample / 8;
      const blockAlign = numChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = length * blockAlign;

      // WAV file size: 44-byte header + data
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // Write WAV header
      this.writeString(view, 0, 'RIFF'); // ChunkID
      view.setUint32(4, 36 + dataSize, true); // ChunkSize (total size - 8)
      this.writeString(view, 8, 'WAVE'); // Format
      this.writeString(view, 12, 'fmt '); // Subchunk1ID
      view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
      view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
      view.setUint16(22, numChannels, true); // NumChannels
      view.setUint32(24, sampleRate, true); // SampleRate
      view.setUint32(28, byteRate, true); // ByteRate
      view.setUint16(32, blockAlign, true); // BlockAlign
      view.setUint16(34, bitsPerSample, true); // BitsPerSample
      this.writeString(view, 36, 'data'); // Subchunk2ID
      view.setUint32(40, dataSize, true); // Subchunk2Size

      // Write PCM data (interleaved for multiple channels)
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
          const sample = audioBuffer.getChannelData(channel)[i];
          // Clamp sample to [-1, 1] and scale to 16-bit integer
          const value = Math.max(-1, Math.min(1, sample)) * 32767;
          view.setInt16(offset, value, true); // Little-endian
          offset += bytesPerSample;
        }
      }

      console.log('WAV file created: channels=', numChannels, 'sampleRate=', sampleRate, 'dataSize=', dataSize);
      return new Blob([buffer], { type: 'audio/wav' });
    } catch (err) {
      console.error('Error in audioBufferToWav:', err);
      throw new Error('Failed to convert audio buffer to WAV');
    }
  }

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

}
