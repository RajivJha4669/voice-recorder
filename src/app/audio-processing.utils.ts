/**
 * Audio Processing Utilities
 * Provides functions for generating mel spectrograms from audio files, including FFT computation,
 * resampling, and normalization for machine learning. Includes an Angular injectable service to orchestrate the utilities.
 */
import { Injectable } from '@angular/core';
import FFT from 'fft.js';

/**
 * Generates a mel spectrogram from an audio file for machine learning input.
 * @param audioFile - The input audio file to process
 * @param audioContext - Web Audio API context
 * @param fftSize - FFT size for STFT
 * @param melBins - Number of mel frequency bins
 * @param timeFrames - Number of time frames
 * @param sampleRate - Target sample rate (Hz)
 * @param hopTime - Hop size in seconds
 * @returns A Float32Array containing the normalized mel spectrogram
 */
export async function generateStandardMelSpectrogram(
  audioFile: File,
  audioContext: AudioContext,
  fftSize: number,
  melBins: number,
  timeFrames: number,
  sampleRate: number,
  hopTime: number
): Promise<Float32Array> {
  const audioBuffer = await loadAudioFile(audioFile, audioContext);
  const pcmData = extractAndResamplePCMData(audioBuffer, sampleRate);
  const spectrogram = computeSTFT(pcmData, fftSize, timeFrames, sampleRate, hopTime);
  const melSpectrogram = computeMelSpectrogram(spectrogram, fftSize, melBins, sampleRate);
  const normalizedMel = normalizeToZeroOne(melSpectrogram);
  return formatForML(normalizedMel, melBins, timeFrames);
}

/**
 * Loads and decodes an audio file into an AudioBuffer.
 * @param file - The audio file to decode
 * @param audioContext - Web Audio API context
 * @returns Decoded AudioBuffer
 */
export async function loadAudioFile(file: File, audioContext: AudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Extracts PCM data from an AudioBuffer and resamples if necessary.
 * @param audioBuffer - The decoded audio buffer
 * @param sampleRate - Target sample rate (Hz)
 * @returns Float32Array of PCM data at target sample rate
 */
export function extractAndResamplePCMData(audioBuffer: AudioBuffer, sampleRate: number): Float32Array {
  // Check if resampling is needed
  if (Math.abs(audioBuffer.sampleRate - sampleRate) < 0.1) {
    return audioBuffer.getChannelData(0); // Return first channel if sample rates match
  }

  // Perform simple resampling (linear interpolation)
  const sourceSR = audioBuffer.sampleRate;
  const targetSR = sampleRate;
  const ratio = sourceSR / targetSR;
  const sourceData = audioBuffer.getChannelData(0);
  const targetLength = Math.floor(sourceData.length / ratio);
  const targetData = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    targetData[i] = sourceData[Math.floor(i * ratio)];
  }

  return targetData;
}

/**
 * Computes Short-Time Fourier Transform (STFT) on PCM data.
 * @param pcmData - Input PCM data
 * @param fftSize - FFT size
 * @param timeFrames - Number of time frames
 * @param sampleRate - Sample rate (Hz)
 * @param hopTime - Hop size in seconds
 * @returns 2D array of magnitude spectra (timeFrames x frequencyBins)
 */
export function computeSTFT(pcmData: Float32Array,fftSize: number,timeFrames: number,sampleRate: number,hopTime: number): number[][] {
  const fft = new FFT(fftSize);
  const hopSize = Math.floor(hopTime * sampleRate);
  const windowSize = fftSize;
  const requiredLength = (timeFrames - 1) * hopSize + windowSize;
  const processedData = ensureLength(pcmData, requiredLength);
  const spectrogram: number[][] = [];
  const windowFunction = hannWindow(windowSize);

  for (let i = 0; i < timeFrames; i++) {
    const start = i * hopSize;
    const frame = new Array(windowSize);

    // Apply Hann window
    for (let j = 0; j < windowSize; j++) {
      frame[j] = processedData[start + j] * windowFunction[j];
    }

    // Compute FFT and magnitude spectrum
    const fftOutput = new Array(windowSize * 2);
    fft.realTransform(fftOutput, frame);
    fft.completeSpectrum(fftOutput);

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

/**
 * Converts STFT spectrogram to mel spectrogram using mel filter bank.
 * @param spectrogram - Input STFT spectrogram
 * @param fftSize - FFT size
 * @param melBins - Number of mel frequency bins
 * @param sampleRate - Sample rate (Hz)
 * @returns 2D array of mel spectrogram (timeFrames x melBins)
 */
export function computeMelSpectrogram(spectrogram: number[][],fftSize: number,melBins: number,sampleRate: number): number[][] {
  const melFilter = createMelFilterBank(fftSize, melBins, sampleRate);
  const melSpectrogram: number[][] = [];

  for (const spectrum of spectrogram) {
    const melSpectrum = new Array(melBins).fill(0);

    // Apply mel filter bank
    for (let m = 0; m < melBins; m++) {
      for (let k = 0; k < spectrum.length; k++) {
        melSpectrum[m] += spectrum[k] * melFilter[m][k];
      }
      // Convert to dB scale, avoiding log(0)
      melSpectrum[m] = 10 * Math.log10(Math.max(1e-10, melSpectrum[m]));
    }

    melSpectrogram.push(melSpectrum);
  }

  return melSpectrogram;
}

/**
 * Creates a mel filter bank for frequency bin conversion.
 * @param fftSize - FFT size
 * @param melBins - Number of mel frequency bins
 * @param sampleRate - Sample rate (Hz)
 * @returns 2D array of mel filter weights (melBins x frequencyBins)
 */
export function createMelFilterBank(fftSize: number, melBins: number, sampleRate: number): number[][] {
  const melFilter = Array.from({ length: melBins }, () =>
    new Array(fftSize / 2 + 1).fill(0));

  const minHz = 0;
  const maxHz = sampleRate / 2;

  // Hz to Mel scale conversion functions
  const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
  const melToHz = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

  const minMel = hzToMel(minHz);
  const maxMel = hzToMel(maxHz);

  // Generate mel points and corresponding frequency bins
  const melPoints = Array.from({ length: melBins + 2 }, (_, i) =>
    minMel + i * (maxMel - minMel) / (melBins + 1));
  const hzPoints = melPoints.map(melToHz);
  const binPoints = hzPoints.map(hz =>
    Math.floor((fftSize / 2 + 1) * hz / maxHz));

  // Create triangular mel filters
  for (let m = 1; m <= melBins; m++) {
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

/**
 * Normalizes mel spectrogram values to [0, 1] range.
 * @param melSpectrogram - Input mel spectrogram
 * @returns Normalized 2D array
 */
export function normalizeToZeroOne(melSpectrogram: number[][]): number[][] {
  let min = Infinity;
  let max = -Infinity;

  // Find global min and max
  for (const frame of melSpectrogram) {
    for (const val of frame) {
      min = Math.min(min, val);
      max = Math.max(max, val);
    }
  }

  // Normalize to [0, 1]
  return melSpectrogram.map(frame =>
    frame.map(val => (val - min) / (max - min))
  );
}

/**
 * Formats mel spectrogram into a flat Float32Array for ML input.
 * @param melSpectrogram - Normalized mel spectrogram
 * @param melBins - Number of mel frequency bins
 * @param timeFrames - Number of time frames
 * @returns Float32Array in column-major order (frequency bins first)
 */
export function formatForML(
  melSpectrogram: number[][],
  melBins: number,
  timeFrames: number
): Float32Array {
  const flatArray = new Float32Array(melBins * timeFrames);

  for (let t = 0; t < timeFrames; t++) {
    for (let m = 0; m < melBins; m++) {
      flatArray[t * melBins + m] = melSpectrogram[t][m];
    }
  }

  return flatArray;
}

/**
 * Ensures PCM data is the required length by padding or truncating.
 * @param data - Input PCM data
 * @param requiredLength - Desired length
 * @returns Float32Array of specified length
 */
export function ensureLength(data: Float32Array, requiredLength: number): Float32Array {
  if (data.length === requiredLength) return data;

  const newData = new Float32Array(requiredLength);
  if (data.length > requiredLength) {
    newData.set(data.subarray(0, requiredLength)); // Truncate
  } else {
    newData.set(data); // Pad with zeros
  }

  return newData;
}

/**
 * Generates a Hann window for STFT.
 * @param size - Window size
 * @returns Array of window coefficients
 */
export function hannWindow(size: number): number[] {
  return Array.from({ length: size }, (_, i) =>
    0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)))
  );
}

/**
 * Converts a base64 string to a File object.
 * @param base64String - Base64 encoded string
 * @param filename - Desired filename
 * @param mimeType - MIME type of the file
 * @returns File object
 */
export function base64ToFile(base64String: string, filename: string, mimeType: string): File {
  const byteString = atob(base64String.split(',')[1]);
  const byteNumbers = new Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteNumbers[i] = byteString.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
}

/**
 * Angular service to orchestrate audio processing utilities.
 */
@Injectable({
  providedIn: 'root'
})
export class AudioProcessingUtils {
  private readonly audioContext: AudioContext;
  private readonly fftSize = 512; // FFT size (results in 257 frequency bins)
  private readonly melBins = 64; // Number of mel frequency bins
  private readonly timeFrames = 173; // Number of time frames
  private readonly sampleRate = 16000; // Standard sample rate (Hz)
  private readonly hopTime = 0.01; // Hop size in seconds (10ms)

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });
  }

  /**
   * Generates a mel spectrogram from an audio file for machine learning input.
   * @param audioFile - The input audio file to process
   * @returns A Float32Array containing the normalized mel spectrogram
   */
  async generateStandardMelSpectrogram(audioFile: File): Promise<Float32Array> {
    return generateStandardMelSpectrogram(audioFile,this.audioContext,this.fftSize,this.melBins,this.timeFrames,this.sampleRate,this.hopTime);
  }

  /**
   * Converts a base64 string to a File object.
   * @param base64String - Base64 encoded string
   * @param filename - Desired filename
   * @param mimeType - MIME type of the file
   * @returns File object
   */
  base64ToFile(base64String: string, filename: string, mimeType: string): File {
    return base64ToFile(base64String, filename, mimeType);
  }
}
