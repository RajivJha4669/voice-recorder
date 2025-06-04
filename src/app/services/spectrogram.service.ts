import { Injectable } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
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
    try {
      const sampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0);
      
      // Fixed dimensions
      const numMelBins = 64;    // 64 frequency bins
      const numFrames = 173;    // 173 time bins
      const fftSize = 1024;     // For better frequency resolution
      
      // Calculate hop size for approximately 4 seconds
      const desiredDuration = 4;  // 4 seconds
      const totalSamples = Math.min(channelData.length, sampleRate * desiredDuration);
      const hopLength = Math.floor((totalSamples - fftSize) / (numFrames - 1));

      // Initialize mel spectrogram array [64 frequency bins][173 time bins]
      const melSpectrogram: number[][] = Array(numMelBins).fill(0)
        .map(() => new Array(numFrames).fill(-100));

      // Create mel filter bank (from low to high frequencies)
      const melFilters = this.createMelFilterBank(sampleRate, fftSize, numMelBins);
      const hannWindow = this.createHannWindow(fftSize);

      // Process each time frame
      for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
        const startSample = frameIndex * hopLength;
        const frame = new Float32Array(fftSize);
        
        // Apply Hann window
        let frameEnergy = 0;
        for (let i = 0; i < fftSize; i++) {
          if (startSample + i < channelData.length) {
            frame[i] = channelData[startSample + i] * hannWindow[i];
            frameEnergy += frame[i] * frame[i];
          }
        }

        // Skip if frame is silent
        if (frameEnergy < 1e-8) continue;

        // Compute FFT
        const spectrum = this.computeFFT(Array.from(frame));
        
        // Compute magnitude spectrum
        const magnitudeSpectrum = new Array(spectrum.length / 2);
        for (let i = 0; i < spectrum.length / 2; i++) {
          magnitudeSpectrum[i] = Math.sqrt(spectrum[i] * spectrum[i]);
        }
        
        // Apply mel filterbank and convert to dB
        const melEnergies = this.applyMelFilterBank(magnitudeSpectrum, melFilters);
        
        // Store in mel spectrogram (frequency bins from low to high)
        for (let melBin = 0; melBin < numMelBins; melBin++) {
          const energy = melEnergies[melBin];
          melSpectrogram[melBin][frameIndex] = 
            energy > 0 ? 20 * Math.log10(energy) : -100;
        }
      }

      return melSpectrogram;
    } catch (error) {
      console.error('Error computing mel spectrogram:', error);
      return Array(64).fill(0).map(() => Array(173).fill(-100));
    }
  }

  renderMelSpectrogram(spectrogram: number[][], canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timeSteps = spectrogram[0]?.length || 0;  // 173 columns
    const melBins = spectrogram.length;             // 64 rows

    // Set width based on time bins (approximately 200px per second for 4 seconds)
    canvas.width = timeSteps * (800/173);  // Maintains exact proportion to time bins
    canvas.height = 320;  // Height for good frequency bin visibility

    // Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageData = ctx.createImageData(canvas.width, canvas.height);

    // Find valid range for better contrast
    let maxVal = -Infinity;
    let minVal = Infinity;
    
    for (let i = 0; i < melBins; i++) {
      for (let j = 0; j < timeSteps; j++) {
        const val = spectrogram[i][j];
        if (val > -50 && val < 100) {  // Reasonable dB range
          maxVal = Math.max(maxVal, val);
          minVal = Math.min(minVal, val);
        }
      }
    }

    if (!isFinite(maxVal) || !isFinite(minVal)) {
      return;
    }

    // Set dynamic range
    const dynamicRange = 50;  // dB
    minVal = maxVal - dynamicRange;

    // Render spectrogram
    for (let x = 0; x < canvas.width; x++) {
      const timeIndex = Math.floor((x / canvas.width) * timeSteps);
      
      for (let y = 0; y < canvas.height; y++) {
        // Invert y-axis so low frequencies are at the bottom
        const melIndex = melBins - 1 - Math.floor((y / canvas.height) * melBins);
        
        let value = spectrogram[melIndex][timeIndex];
        
        // Normalize value
        let intensity = 0;
        if (value > minVal) {
          intensity = Math.min(1, (value - minVal) / dynamicRange);
          intensity = Math.pow(intensity, 0.5);  // Gamma correction
        }

        const idx = (y * canvas.width + x) * 4;
        const color = this.getSpectrogramColor(intensity);
        
        imageData.data[idx] = color[0];     // R
        imageData.data[idx + 1] = color[1]; // G
        imageData.data[idx + 2] = color[2]; // B
        imageData.data[idx + 3] = 255;      // A
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
    try {
      // Convert frequencies to mel scale
      const fMax = sampleRate / 2;
      const melMax = this.hzToMel(fMax);
      const melMin = this.hzToMel(20); // Start from 20 Hz
      const deltaMel = (melMax - melMin) / (numFilters + 1);

      // Generate mel points
      const melPoints = new Array(numFilters + 2);
      for (let i = 0; i < melPoints.length; i++) {
        melPoints[i] = this.melToHz(melMin + i * deltaMel);
      }

      // Convert frequencies to FFT bins
      const bins = melPoints.map(freq => 
        Math.min(Math.floor((fftSize + 1) * freq / sampleRate), fftSize/2));

      // Create triangular filters
      const filters: number[][] = new Array(numFilters);
      for (let i = 0; i < numFilters; i++) {
        filters[i] = new Array(fftSize/2).fill(0);
        
        for (let j = bins[i]; j < bins[i + 2]; j++) {
          if (j < bins[i + 1]) {
            // Upward slope
            filters[i][j] = (j - bins[i]) / (bins[i + 1] - bins[i]);
          } else {
            // Downward slope
            filters[i][j] = (bins[i + 2] - j) / (bins[i + 2] - bins[i + 1]);
          }
        }

        // Normalize the filter
        const filterSum = filters[i].reduce((sum, val) => sum + val, 0);
        if (filterSum > 0) {
          filters[i] = filters[i].map(val => val / filterSum);
        }
      }

      return filters;
    } catch (error) {
      console.error('Error creating mel filter bank:', error);
      return Array(numFilters).fill(Array(Math.floor(fftSize/2)).fill(0));
    }
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
    const numFilters = filters.length;
    const melEnergies = new Array(numFilters).fill(0);

    try {
      // Apply each mel filter
      for (let filterIndex = 0; filterIndex < numFilters; filterIndex++) {
        let energy = 0;
        const filter = filters[filterIndex];
        
        // Compute weighted sum
        for (let freqBin = 0; freqBin < Math.min(spectrum.length, filter.length); freqBin++) {
          energy += spectrum[freqBin] * filter[freqBin];
        }
        
        melEnergies[filterIndex] = Math.max(energy, 1e-10);
      }
    } catch (error) {
      console.error('Error in mel filter bank application:', error);
    }

    return melEnergies;
  }

  private getSpectrogramColor(intensity: number): [number, number, number] {
    if (intensity <= 0.01) {  // True silence threshold
      return [0, 0, 0];
    }

    // Define colors for gradient
    const colors = [
      [0, 0, 0],        // Black
      [128, 0, 0],      // Dark red
      [255, 0, 0],      // Bright red
      [255, 100, 0],    // Red-orange
      [255, 170, 0]     // Orange
    ];

    const index = (colors.length - 1) * intensity;
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.min(colors.length - 1, lowerIndex + 1);
    const blend = index - lowerIndex;

    const c1 = colors[lowerIndex];
    const c2 = colors[upperIndex];

    return [
      Math.round(c1[0] * (1 - blend) + c2[0] * blend),
      Math.round(c1[1] * (1 - blend) + c2[1] * blend),
      Math.round(c1[2] * (1 - blend) + c2[2] * blend)
    ];
  }

  closeAudioContext(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(err => console.error('Error closing AudioContext:', err));
      this.audioContext = null;
    }
  }
}
