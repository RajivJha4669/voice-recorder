// audio-processing.service.ts
import { Injectable } from '@angular/core';
import FFT from 'fft.js';

@Injectable({
  providedIn: 'root'
})
export class AudioProcessingService {
  private audioContext: AudioContext;
  private readonly fftSize = 512;
  private readonly melBins = 64;
  private readonly timeFrames = 173;
  private readonly sampleRate = 16000;
  private readonly hopTime = 0.01;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('Failed to resume AudioContext:', err));
    }
    console.log('AudioContext initialized with sample rate:', this.sampleRate);
  }

  base64ToFile(base64String: string, filename: string, mimeType: string): File {
    try {
      if (!base64String) {
        console.error('base64ToFile: Base64 string is empty');
        throw new Error('Base64 string cannot be empty');
      }

      // Clean and normalize base64 string
      let cleanBase64 = base64String.trim();
      // Remove data URI prefix if present
      if (cleanBase64.startsWith('data:')) {
        cleanBase64 = cleanBase64.split(',')[1] ?? cleanBase64;
      }
      // Remove any whitespace or line breaks
      cleanBase64 = cleanBase64.replace(/\s/g, '');

      // Validate base64 format
      if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
        console.error('base64ToFile: Invalid base64 characters detected', cleanBase64.substring(0, 50));
        throw new Error('Invalid base64 string: Contains non-base64 characters');
      }

      // Ensure length is a multiple of 4
      while (cleanBase64.length % 4 !== 0) {
        cleanBase64 += '=';
      }

      console.log('base64ToFile: Processing base64 string, length:', cleanBase64.length, 'first 50 chars:', cleanBase64.substring(0, 50));

      const byteString = atob(cleanBase64);
      const byteNumbers = new Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteNumbers[i] = byteString.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      if (byteArray.length === 0) {
        throw new Error('Converted byte array is empty');
      }
      console.log('Base64 converted to File:', filename, 'size:', byteArray.length);
      return new File([byteArray], filename, { type: mimeType });
    } catch (err) {
      console.error('Error in base64ToFile:', err, 'input base64 sample:', base64String.substring(0, 50));
      throw new Error(`Failed to convert base64 to File: ${err}`);
    }
  }

  async fileToBase64(file: File): Promise<string> {
    try {
      if (file.size === 0) {
        throw new Error('File is empty');
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] ?? result;
          if (!base64) {
            reject(new Error('Failed to convert file to base64'));
          } else {
            console.log('File converted to base64, length:', base64.length);
            resolve(base64);
          }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
    } catch (err) {
      console.error('Error in fileToBase64:', err);
      throw new Error(`Failed to convert file to base64: ${err}`);
    }
  }

  async downsampleAndExportAudio(audioFile: File): Promise<File> {
    try {
      console.log('Starting downsampleAndExportAudio for file:', audioFile.name, 'size:', audioFile.size);
      if (audioFile.size === 0) {
        throw new Error('Input file is empty');
      }
      const audioBuffer = await this.loadAudioFile(audioFile);
      console.log('Audio buffer loaded:', audioBuffer.sampleRate, 'Hz, duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);
      const downsampledBuffer = await this.downsampleAudioBuffer(audioBuffer, this.sampleRate);
      console.log('Downsampled buffer:', downsampledBuffer.sampleRate, 'Hz, duration:', downsampledBuffer.duration, 'channels:', downsampledBuffer.numberOfChannels);
      const wavBlob = await this.audioBufferToWav(downsampledBuffer);
      console.log('WAV blob created, size:', wavBlob.size);
      if (wavBlob.size === 0) {
        throw new Error('Generated WAV blob is empty');
      }
      return new File([wavBlob], `downsampled_${audioFile.name}`, { type: 'audio/wav' });
    } catch (err) {
      console.error('Error in downsampleAndExportAudio:', err);
      throw new Error(`Failed to downsample audio: ${err}`);
    }
  }

  async downsampleAudio(base64String: string, targetSampleRate: number = 16000): Promise<string> {
    try {
      console.log('Starting downsampleAudio, base64 length:', base64String.length);
      const file = this.base64ToFile(base64String, 'temp_audio.wav', 'audio/wav');
      console.log('Base64 converted to File, size:', file.size);
      if (file.size === 0) {
        throw new Error('Converted file is empty');
      }
      const audioBuffer = await this.loadAudioFile(file);
      console.log('Audio buffer loaded:', audioBuffer.sampleRate, 'Hz, duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);
      const downsampledBuffer = await this.downsampleAudioBuffer(audioBuffer, targetSampleRate);
      console.log('Downsampled buffer:', downsampledBuffer.sampleRate, 'Hz, duration:', downsampledBuffer.duration, 'channels:', downsampledBuffer.numberOfChannels);
      const wavBlob = await this.audioBufferToWav(downsampledBuffer);
      console.log('WAV blob created, size:', wavBlob.size);
      if (wavBlob.size === 0) {
        throw new Error('Generated WAV blob is empty');
      }
      const base64 = await this.blobToBase64(wavBlob);
      console.log('Base64 output length:', base64.length);
      if (!base64) {
        throw new Error('Base64 output is empty');
      }
      return base64;
    } catch (err) {
      console.error('Error in downsampleAudio:', err);
      throw new Error(`Failed to downsample audio: ${err}`);
    }
  }

  private async loadAudioFile(file: File): Promise<AudioBuffer> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Audio file is empty');
      }
      console.log('Audio file loaded, arrayBuffer size:', arrayBuffer.byteLength);
      return await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.error('Error decoding audio file:', err);
      throw new Error(`Failed to decode audio file: ${err}`);
    }
  }

  async convertToWav(base64String: string): Promise<string> {
    try {
      console.log('Starting convertToWav, base64 length:', base64String.length);
      const file = this.base64ToFile(base64String, 'temp_input.wav', 'audio/wav');
      const audioBuffer = await this.loadAudioFile(file);
      console.log('Audio buffer loaded for WAV conversion:', audioBuffer.sampleRate, 'Hz, duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);
      const wavBlob = await this.audioBufferToWav(audioBuffer); // Force mono
      console.log('WAV blob created, size:', wavBlob.size);
      if (wavBlob.size === 0) {
        throw new Error('Generated WAV blob is empty');
      }
      const base64 = await this.blobToBase64(wavBlob);
      console.log('WAV base64 output length:', base64.length);
      return base64;
    } catch (err) {
      console.error('Error in convertToWav:', err);
      throw new Error(`Failed to convert to WAV: ${err}`);
    }
  }

  private async downsampleAudioBuffer(audioBuffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
    if (Math.abs(audioBuffer.sampleRate - targetSampleRate) < 0.1) {
      console.log('No resampling needed, sample rate matches:', audioBuffer.sampleRate);
      return audioBuffer;
    }

    try {
      if (audioBuffer.length === 0) {
        throw new Error('Audio buffer is empty');
      }
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
      if (renderedBuffer.length === 0) {
        throw new Error('Downsampled buffer is empty');
      }
      return renderedBuffer;
    } catch (err) {
      console.error('Error in downsampleAudioBuffer:', err);
      throw new Error(`Failed to resample audio: ${err}`);
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

      if (length === 0) {
        throw new Error('Audio buffer is empty');
      }
      if (numChannels === 0) {
        throw new Error('Audio buffer has no channels');
      }

      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // Write WAV header
      this.writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      this.writeString(view, 8, 'WAVE');
      this.writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      this.writeString(view, 36, 'data');
      view.setUint32(40, dataSize, true);

      // Write PCM data
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
          const sample = audioBuffer.getChannelData(channel)[i] ?? 0;
          const value = Math.max(-1, Math.min(1, sample)) * 32767;
          view.setInt16(offset, value, true);
          offset += bytesPerSample;
        }
      }

      console.log('WAV file created: channels=', numChannels, 'sampleRate=', sampleRate, 'dataSize=', dataSize);
      return new Blob([buffer], { type: 'audio/wav' });
    } catch (err) {
      console.error('Error in audioBufferToWav:', err);
      throw new Error(`Failed to convert audio buffer to WAV: ${err}`);
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    try {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] ?? result;
          if (!base64) {
            reject(new Error('Failed to convert blob to base64'));
          } else {
            resolve(base64);
          }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('Error in blobToBase64:', err);
      throw new Error(`Failed to convert blob to base64: ${err}`);
    }
  }

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // Spectrogram-related methods (unchanged)
  async generateStandardMelSpectrogram(audioFile: File): Promise<Float32Array> {
    try {
      console.log('Generating mel spectrogram for file:', audioFile.name);
      const audioBuffer = await this.loadAudioFile(audioFile);
      const pcmData = this.extractAndResamplePCMData(audioBuffer);
      const spectrogram = this.computeSTFT(pcmData);
      const melSpectrogram = this.computeMelSpectrogram(spectrogram);
      const normalizedMel = this.normalizeToZeroOne(melSpectrogram);
      return this.formatForML(normalizedMel);
    } catch (err) {
      console.error('Error in generateStandardMelSpectrogram:', err);
      throw new Error(`Failed to generate mel spectrogram: ${err}`);
    }
  }

  private extractAndResamplePCMData(audioBuffer: AudioBuffer): Float32Array {
    try {
      if (audioBuffer.length === 0) {
        throw new Error('Audio buffer is empty');
      }
      if (Math.abs(audioBuffer.sampleRate - this.sampleRate) < 0.1) {
        console.log('No resampling needed for PCM data, sample rate:', audioBuffer.sampleRate);
        return audioBuffer.getChannelData(0);
      }

      const sourceSR = audioBuffer.sampleRate;
      const targetSR = this.sampleRate;
      const ratio = sourceSR / targetSR;
      const sourceData = audioBuffer.getChannelData(0);
      const targetLength = Math.floor(sourceData.length / ratio);
      const targetData = new Float32Array(targetLength);

      for (let i = 0; i < targetLength; i++) {
        targetData[i] = sourceData[Math.floor(i * ratio)];
      }

      console.log('PCM data resampled:', sourceSR, 'to', targetSR, 'length:', targetLength);
      return targetData;
    } catch (err) {
      console.error('Error in extractAndResamplePCMData:', err);
      throw new Error(`Failed to extract PCM data: ${err}`);
    }
  }

  private computeSTFT(pcmData: Float32Array): number[][] {
    try {
      const fft = new FFT(this.fftSize);
      const hopSize = Math.floor(this.hopTime * this.sampleRate);
      const windowSize = this.fftSize;
      const requiredLength = (this.timeFrames - 1) * hopSize + windowSize;

      const processedData = this.ensureLength(pcmData, requiredLength);
      const spectrogram: number[][] = [];
      const windowFunction = this.hannWindow(windowSize);

      for (let i = 0; i < this.timeFrames; i++) {
        const start = i * hopSize;
        const frame = new Array(windowSize);

        for (let j = 0; j < windowSize; j++) {
          frame[j] = processedData[start + j] * windowFunction[j];
        }

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

      console.log('STFT computed, frames:', spectrogram.length, 'bins per frame:', spectrogram[0].length);
      return spectrogram;
    } catch (err) {
      console.error('Error in computeSTFT:', err);
      throw new Error(`Failed to compute STFT: ${err}`);
    }
  }

  private computeMelSpectrogram(spectrogram: number[][]): number[][] {
    try {
      const melFilter = this.createMelFilterBank();
      const melSpectrogram: number[][] = [];

      for (const spectrum of spectrogram) {
        const melSpectrum = new Array(this.melBins).fill(0);

        for (let m = 0; m < this.melBins; m++) {
          for (let k = 0; k < spectrum.length; k++) {
            melSpectrum[m] += spectrum[k] * melFilter[m][k];
          }
          melSpectrum[m] = 10 * Math.log10(Math.max(1e-10, melSpectrum[m]));
        }

        melSpectrogram.push(melSpectrum);
      }

      console.log('Mel spectrogram computed, frames:', melSpectrogram.length, 'mel bins:', melSpectrogram[0].length);
      return melSpectrogram;
    } catch (err) {
      console.error('Error in computeMelSpectrogram:', err);
      throw new Error(`Failed to compute mel spectrogram: ${err}`);
    }
  }

  private createMelFilterBank(): number[][] {
    try {
      const melFilter = Array.from({ length: this.melBins }, () =>
        new Array(this.fftSize / 2 + 1).fill(0));

      const minHz = 0;
      const maxHz = this.sampleRate / 2;

      const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
      const melToHz = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

      const minMel = hzToMel(minHz);
      const maxMel = hzToMel(maxHz);

      const melPoints = Array.from({ length: this.melBins + 2 }, (_, i) =>
        minMel + i * (maxMel - minMel) / (this.melBins + 1));

      const hzPoints = melPoints.map(melToHz);
      const binPoints = hzPoints.map(hz =>
        Math.floor((this.fftSize / 2 + 1) * hz / maxHz));

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

      console.log('Mel filter bank created, bins:', this.melBins);
      return melFilter;
    } catch (err) {
      console.error('Error in createMelFilterBank:', err);
      throw new Error(`Failed to create mel filter bank: ${err}`);
    }
  }

  private normalizeToZeroOne(melSpectrogram: number[][]): number[][] {
    try {
      let min = Infinity;
      let max = -Infinity;

      for (const frame of melSpectrogram) {
        for (const val of frame) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }

      if (min === max) {
        console.warn('Mel spectrogram has no dynamic range, returning zeros');
        return melSpectrogram.map(frame => frame.map(() => 0));
      }

      const normalized = melSpectrogram.map(frame =>
        frame.map(val => (val - min) / (max - min))
      );
      console.log('Mel spectrogram normalized, min:', min, 'max:', max);
      return normalized;
    } catch (err) {
      console.error('Error in normalizeToZeroOne:', err);
      throw new Error(`Failed to normalize mel spectrogram: ${err}`);
    }
  }

  private formatForML(melSpectrogram: number[][]): Float32Array {
    try {
      const flatArray = new Float32Array(this.melBins * this.timeFrames);

      for (let t = 0; t < this.timeFrames; t++) {
        for (let m = 0; m < this.melBins; m++) {
          flatArray[t * this.melBins + m] = melSpectrogram[t][m] ?? 0;
        }
      }

      console.log('Formatted for ML, array length:', flatArray.length);
      return flatArray;
    } catch (err) {
      console.error('Error in formatForML:', err);
      throw new Error(`Failed to format mel spectrogram: ${err}`);
    }
  }

  private ensureLength(data: Float32Array, requiredLength: number): Float32Array {
    try {
      if (data.length === requiredLength) return data;

      const newData = new Float32Array(requiredLength);
      if (data.length > requiredLength) {
        newData.set(data.subarray(0, requiredLength));
      } else {
        newData.set(data);
      }

      console.log('Data length adjusted:', data.length, 'to', requiredLength);
      return newData;
    } catch (err) {
      console.error('Error in ensureLength:', err);
      throw new Error(`Failed to adjust data length: ${err}`);
    }
  }

  private hannWindow(size: number): number[] {
    try {
      const window = new Array(size);
      for (let i = 0; i < size; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
      }
      console.log('Hann window created, size:', size);
      return window;
    } catch (err) {
      console.error('Error in hannWindow:', err);
      throw new Error(`Failed to create Hann window: ${err}`);
    }
  }
}
