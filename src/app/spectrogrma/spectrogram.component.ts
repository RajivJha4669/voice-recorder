import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';

import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { NgIf } from '@angular/common';
import { AudioProcessingUtils } from '../audio-processing.utils';

@Component({
  selector: 'app-spectrogram-generator',
  template: `
     <ion-header>
  <ion-toolbar>
    <ion-title class="title-center">Mel Spectrogram Generator (64×173)</ion-title>
  </ion-toolbar>
</ion-header>

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-content>
          <ion-item lines="none" class="upload-item">
          <ion-label>Select Audio</ion-label>
          <ion-button fill="outline" size="big" class="mb-4" (click)="fileInput.click()">Upload</ion-button>
          <input #fileInput type="file" accept="audio/*" (change)="onFileSelected($event)" hidden />
          </ion-item>


          <ion-button expand="block" (click)="generateMelSpectrogram()" [disabled]="!audioFile || loading">
            <ion-spinner *ngIf="loading" slot="start" name="dots"></ion-spinner>
            {{ loading ? 'Generating...' : 'Generate' }}
          </ion-button>

          <div *ngIf="error" class="error">{{ error }}</div>

          <div class="spectrogram-container">
            <canvas #spectrogramCanvas width="346" height="128"></canvas>

            <div class="axes">
              <span>0s</span>
              <span>1.73s</span>
            </div>

            <div class="frequency-label">Frequency (64 bins)</div>

            <div class="colorbar">
              <span>Low</span>
              <div class="gradient"></div>
              <span>High</span>
            </div>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  imports: [
    IonContent,
    IonCard,
    IonToolbar,
    IonHeader,
    IonCardContent,
    NgIf,
    IonButton,
    IonLabel,
    IonSpinner,
    IonItem,
    IonTitle
  ],
  styles: [`
    .title-center {
      text-align: center;
      font-size: 1.2rem;
    }


    .file-input {
      margin-top: 10px;
      width: 100%;
    }

    ion-button {
      margin-top: 16px;
    }

    .spectrogram-container {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    canvas {
      border: 1px solid #ddd;
      image-rendering: pixelated;
      width: 100%;
      max-width: 100%;
      height: auto;
    }

    .axes {
      display: flex;
      justify-content: space-between;
      width: 100%;
      padding: 0 5px;
      margin-top: 5px;
      font-size: 12px;
      color: #666;
    }

    .frequency-label {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
      text-align: center;
    }

    .colorbar {
      display: flex;
      align-items: center;
      margin-top: 10px;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .gradient {
      width: 100%;
      max-width: 200px;
      height: 20px;
      background: linear-gradient(to right,
        #000004, #160b39, #420a68, #6a176e,
        #932667, #ba3655, #dd513a, #f3761b,
        #fca50a, #f6d746, #fcffa4);
    }

    .error {
      color: var(--ion-color-danger);
      margin-top: 10px;
      text-align: center;
      font-size: 0.9rem;
    }

    @media (max-width: 400px) {
      .gradient {
        max-width: 150px;
      }

      ion-card-title {
        font-size: 1rem;
      }
    }
  `]
})
export class MelSpectrogramComponent implements AfterViewInit {
  @ViewChild('spectrogramCanvas', { static: false })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  audioFile: File | null = null;
  melSpectrogramData: Float32Array | null = null;
  loading = false;
  error = '';
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(private audioService: AudioProcessingUtils) { }

  ngAfterViewInit() {
    this.initializeCanvas();
  }

  private initializeCanvas() {
    if (this.canvasRef && this.canvasRef.nativeElement) {
      this.ctx = this.canvasRef.nativeElement.getContext('2d');
      if (!this.ctx) {
        console.error('Could not get canvas context');
      }
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.audioFile = input.files[0];
      this.melSpectrogramData = null;
      this.error = '';
    }
  }

  async generateMelSpectrogram() {
    if (!this.audioFile || !this.ctx) return;

    this.loading = true;
    this.error = '';

    try {
      this.melSpectrogramData = await this.audioService.generateStandardMelSpectrogram(this.audioFile);
      this.visualizeSpectrogram();
    } catch (err) {
      console.error('Error generating Mel spectrogram:', err);
      this.error = 'Failed to process audio file. Please try a different file.';
    } finally {
      this.loading = false;
    }
  }

  private visualizeSpectrogram() {
    if (!this.melSpectrogramData || !this.ctx || !this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    const width = canvas.width;
    const height = canvas.height;

    // Fill background black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const melBins = 64;
    const timeFrames = 173;

    for (let t = 0; t < timeFrames; t++) {
      for (let m = 0; m < melBins; m++) {
        let value = this.melSpectrogramData[t * melBins + m];

        // Clamp and normalize [0, 1]
        value = Math.max(0, Math.min(1, value));

        const x = Math.floor(t * (width / timeFrames));
        const y = Math.floor((melBins - 1 - m) * (height / melBins));

        const [r, g, b] = this.getInfernoColor(value);

        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 2; dy++) {
            const px = Math.min(x + dx, width - 1);
            const py = Math.min(y + dy, height - 1);
            const idx = (py * width + px) * 4;

            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private getInfernoColor(t: number): [number, number, number] {
    // Colors from black → purple → red → orange → yellow → white
    const colors = [
      [0, 0, 0],           // Black
      [50, 0, 80],         // Dark Purple
      [180, 30, 100],      // Magenta-Red
      [240, 70, 40],       // Orange-Red
      [255, 180, 60],      // Yellow
      [255, 255, 255]      // White
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

}
