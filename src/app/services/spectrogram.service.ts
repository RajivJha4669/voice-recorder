import { Injectable } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class SpectrogramService {
  private audioContext: AudioContext | null = null;

  constructor(private platform: Platform) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async decodeBase64Audio(base64Audio: string): Promise<AudioBuffer> {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }
    try {
      return await this.audioContext.decodeAudioData(bytes.buffer);
    } catch (error) {
      console.error('Audio decode error:', error);
      throw error;
    }
  }

  computeMelSpectrogram(audioBuffer: AudioBuffer): number[][] {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);

    const numMelBins = 64;
    const numFrames = 173;

    // Choose FFT size and hop size to get close to 173 frames
    // Let's use 512 FFT and 50% overlap (hop = 256)
    const fftSize = 512;
    const hopSize = Math.floor((channelData.length - fftSize) / (numFrames - 1));
    // If hopSize < 1, audio is too short, pad with zeros
    const paddedLength = fftSize + (numFrames - 1) * hopSize;
    let paddedData: Float32Array;
    if (channelData.length < paddedLength) {
      paddedData = new Float32Array(paddedLength);
      paddedData.set(channelData);
      // rest is already zero
    } else {
      paddedData = channelData;
    }

    const melFilters = this.createMelFilterBank(sampleRate, fftSize, numMelBins);
    const window = this.createHannWindow(fftSize);

    const melSpectrogram: number[][] = [];
    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      const start = frameIdx * hopSize;
      const frame = Array.from(paddedData.slice(start, start + fftSize));
      if (frame.length < fftSize) {
        // pad frame with zeros
        frame.push(...Array(fftSize - frame.length).fill(0));
      }
      const windowedFrame = frame.map((val, idx) => val * window[idx]);
      const spectrum = this.computeFFT(windowedFrame);
      const melEnergies = this.applyMelFilterBank(spectrum, melFilters);
      melSpectrogram.push(melEnergies.map(energy => {
        const val = Math.max(energy, 1e-10);
        return isNaN(val) || val <= 0 ? -10 : Math.log10(val);
      }));
    }

    // melSpectrogram: [numFrames][numMelBins] → transpose to [numMelBins][numFrames]
    const melSpectrogramT: number[][] = [];
    for (let melBin = 0; melBin < numMelBins; melBin++) {
      melSpectrogramT[melBin] = [];
      for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
        melSpectrogramT[melBin][frameIdx] = melSpectrogram[frameIdx][melBin];
      }
    }
    return melSpectrogramT; // shape: [64][173]
  }

  renderMelSpectrogram(spectrogram: number[][], canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Canvas context not available');
      return;
    }

    const timeSteps = spectrogram.length;
    const melBins = spectrogram[0]?.length || 0;
    if (timeSteps === 0 || melBins === 0) {
      console.error('Invalid spectrogram dimensions: timeSteps=', timeSteps, 'melBins=', melBins);
      return;
    }

    // Set canvas size
    canvas.width = 800;
    canvas.height = 320;

    // Clear the canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const flattened = spectrogram.reduce((acc, curr) => acc.concat(curr), []);
    const validValues = flattened.filter(val => !isNaN(val) && isFinite(val));
    const maxVal = validValues.length > 0 ? Math.max(...validValues) : 0;
    const minVal = validValues.length > 0 ? Math.min(...validValues) : 0;

    if (validValues.length === 0) {
      console.error('No valid spectrogram values');
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    console.log('Rendering spectrogram: width=', canvas.width, 'height=', canvas.height, 'minVal=', minVal, 'maxVal=', maxVal);

    // Improved rendering with continuous sampling
    for (let x = 0; x < canvas.width; x++) {
      // Map x to a continuous position in timeSteps
      const t = (x / (canvas.width - 1)) * (timeSteps - 1);
      const srcX1 = Math.floor(t);
      const srcX2 = Math.min(srcX1 + 1, timeSteps - 1);
      const frac = t - srcX1;

      for (let y = 0; y < canvas.height; y++) {
        // Map y to mel bins
        const srcY = Math.floor((y / canvas.height) * melBins);
        const melBinIndex = melBins - srcY - 1; // Flip y for correct frequency orientation

        // Interpolate between two time steps for smoother rendering
        const value1 = spectrogram[srcX1][melBinIndex];
        const value2 = spectrogram[srcX2][melBinIndex];
        const value = value1 + frac * (value2 - value1);

        const normalizedValue = isNaN(value) || !isFinite(value) ? 0 : (value - minVal) / (maxVal - minVal) || 0;
        const idx = (y * canvas.width + x) * 4;
        const color = this.valueToColor(normalizedValue);
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  async saveCanvasAsPng(canvas: HTMLCanvasElement, recordingId: string, platform: Platform) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `spectrogram_${recordingId}_${timestamp}.png`;
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    if (platform.is('hybrid')) {
      try {
        await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Documents, // or Directory.External
          // encoding: undefined,  <-- Omit this line!
        });
        console.log(`Image saved as ${filename}`);
      } catch (err) {
        console.error('Error saving image:', err);
      }
    } else {
      // Web download
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.click();
    }
  }

  private createHannWindow(size: number): number[] {
    const window = new Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return window;
  }

  private createMelFilterBank(sampleRate: number, fftSize: number, numFilters: number): number[][] {
    const melMin = 0;
    const melMax = this.hzToMel(sampleRate / 2);
    const melPoints = new Array(numFilters + 2);
    for (let i = 0; i < melPoints.length; i++) {
      melPoints[i] = this.melToHz(melMin + (i * (melMax - melMin)) / (numFilters + 1));
    }

    const bins = melPoints.map(mel => Math.floor((fftSize + 1) * mel / sampleRate));
    const filters: number[][] = [];
    for (let i = 1; i < melPoints.length - 1; i++) {
      const filter = new Array(fftSize / 2);
      for (let j = 0; j < fftSize / 2; j++) {
        if (j < bins[i - 1]) filter[j] = 0;
        else if (j <= bins[i]) filter[j] = (j - bins[i - 1]) / (bins[i] - bins[i - 1]);
        else if (j <= bins[i + 1]) filter[j] = (bins[i + 1] - j) / (bins[i + 1] - bins[i]);
        else filter[j] = 0;
      }
      filters.push(filter);
    }
    return filters;
  }

  private hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }

  private melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  private computeFFT(signal: number[]): number[] {
    const n = signal.length;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    signal.forEach((val, i) => real[i] = val);

    this.fftInPlace(real, imag);
    const magnitude = new Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      magnitude[i] = isNaN(mag) ? 0 : mag;
    }
    return magnitude;
  }

  private fftInPlace(real: Float32Array, imag: Float32Array): void {
    const n = real.length;
    let bits = Math.floor(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let j = 0;
      for (let k = 0; k < bits; k++) {
        j = (j << 1) | ((i >> k) & 1);
      }
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let len = 2; len <= n; len *= 2) {
      const halfLen = len / 2;
      const angleStep = -2 * Math.PI / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < halfLen; k++) {
          const angle = k * angleStep;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const tReal = c * real[i + k + halfLen] - s * imag[i + k + halfLen];
          const tImag = s * real[i + k + halfLen] + c * imag[i + k + halfLen];
          real[i + k + halfLen] = real[i + k] - tReal;
          imag[i + k + halfLen] = imag[i + k] - tImag;
          real[i + k] += tReal;
          imag[i + k] += tImag;
        }
      }
    }
  }

  private applyMelFilterBank(spectrum: number[], filters: number[][]): number[] {
    const energies = new Array(filters.length).fill(0);
    for (let i = 0; i < filters.length; i++) {
      for (let j = 0; j < spectrum.length; j++) {
        const value = spectrum[j] * filters[i][j];
        energies[i] += isNaN(value) ? 0 : value;
      }
    }
    return energies;
  }

  private valueToColor(value: number): { r: number; g: number; b: number } {
    const [r, g, b] = this.getInfernoColor(value);
    return { r, g, b };
  }

  private getInfernoColor(t: number): [number, number, number] {
    const colors = [
      [0, 0, 0],
      [50, 0, 80],
      [180, 30, 100],
      [240, 70, 40],
      [255, 180, 60],
      [255, 255, 255]
    ];

    const stops = colors.length - 1;
    const scaledT = t * stops;
    const idx = Math.floor(scaledT);
    const frac = scaledT - idx;

    const c1 = colors[Math.min(idx, stops - 1)];
    const c2 = colors[Math.min(idx + 1, stops)];

    const r = Math.round(c1[0] + frac * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + frac * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + frac * (c2[2] - c1[2]));

    return [r, g, b];
  }

  closeAudioContext(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(err => console.error('Error closing AudioContext:', err));
      this.audioContext = null;
    }
  }
}
