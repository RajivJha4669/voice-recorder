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

}
