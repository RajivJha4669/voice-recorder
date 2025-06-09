// // mel-spectrogram.component.ts
// import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
// import { IonButton, IonCard, IonCardContent, IonContent, IonHeader, IonItem, IonLabel, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
// import { NgIf } from '@angular/common';
// import { AudioProcessingService } from '../spectrogram.service';
// import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// @Component({
//   selector: 'app-spectrogram-generator',
//   template: `
//     <ion-header>
//       <ion-toolbar>
//         <ion-title class="title-center">Mel Spectrogram Generator (64×173)</ion-title>
//       </ion-toolbar>
//     </ion-header>

//     <ion-content class="ion-padding">
//       <ion-card>
//         <ion-card-content>
//           <ion-item lines="none" class="upload-item">
//             <ion-label>Select Audio</ion-label>
//             <ion-button fill="outline" size="big" class="mb-4" (click)="fileInput.click()">Upload</ion-button>
//             <input #fileInput type="file" accept="audio/*" (change)="onFileSelected($event)" hidden />
//           </ion-item>

//           <ion-button expand="block" (click)="generateMelSpectrogram()" [disabled]="!audioFile || loading">
//             <ion-spinner *ngIf="loading" slot="start" name="dots"></ion-spinner>
//             {{ loading ? 'Generating...' : 'Generate' }}
//           </ion-button>

//           <ion-button expand="block" (click)="downloadDownsampledAudio()" [disabled]="!audioFile || loading">
//             <ion-spinner *ngIf="loading" slot="start" name="dots"></ion-spinner>
//             {{ loading ? 'Processing...' : 'Download Downsampled Audio' }}
//           </ion-button>

//           <div *ngIf="error" class="error">{{ error }}</div>

//           <div class="spectrogram-container">
//             <canvas #spectrogramCanvas width="346" height="128"></canvas>

//             <div class="axes">
//               <span>0s</span>
//               <span>1.73s</span>
//             </div>

//             <div class="frequency-label">Frequency (64 bins)</div>

//             <div class="colorbar">
//               <span>Low</span>
//               <div class="gradient"></div>
//               <span>High</span>
//             </div>
//           </div>
//         </ion-card-content>
//       </ion-card>
//     </ion-content>
//   `,
//   imports: [
//     IonContent,
//     IonCard,
//     IonToolbar,
//     IonHeader,
//     IonCardContent,
//     NgIf,
//     IonButton,
//     IonLabel,
//     IonSpinner,
//     IonItem,
//     IonTitle
//   ],
//   styles: [/* Existing styles unchanged, as provided in your original code */]
// })
// export class MelSpectrogramComponent implements AfterViewInit {
//   @ViewChild('spectrogramCanvas', { static: false })
//   canvasRef!: ElementRef<HTMLCanvasElement>;
//   audioService = inject(AudioProcessingService);
//   audioFile: File | null = null;
//   melSpectrogramData: Float32Array | null = null;
//   loading = false;
//   error = '';
//   private ctx: CanvasRenderingContext2D | null = null;

//   ngAfterViewInit() {
//     this.initializeCanvas();
//   }

//   private initializeCanvas() {
//     if (this.canvasRef && this.canvasRef.nativeElement) {
//       this.ctx = this.canvasRef.nativeElement.getContext('2d');
//       if (!this.ctx) {
//         console.error('Could not get canvas context');
//         this.error = 'Canvas context not supported';
//       }
//     }
//   }

//   async onFileSelected(event: Event) {
//     const input = event.target as HTMLInputElement;
//     if (input.files?.length) {
//       this.audioFile = input.files[0];
//       this.melSpectrogramData = null;
//       this.error = '';
//       console.log('File selected:', this.audioFile.name, 'size:', this.audioFile.size, 'type:', this.audioFile.type);
//     } else {
//       console.log('No file selected');
//       this.error = 'No file selected';
//     }
//   }

//   async generateMelSpectrogram() {
//     if (!this.audioFile || !this.ctx) {
//       console.log('Cannot generate spectrogram: audioFile or ctx missing', { audioFile: !!this.audioFile, ctx: !!this.ctx });
//       this.error = 'Please select an audio file';
//       return;
//     }

//     this.loading = true;
//     this.error = '';

//     try {
//       console.log('Generating Mel spectrogram...');
//       this.melSpectrogramData = await this.audioService.generateStandardMelSpectrogram(this.audioFile);
//       console.log('Mel spectrogram generated, length:', this.melSpectrogramData.length);
//       this.visualizeSpectrogram();
//     } catch (err) {
//       console.error('Error generating Mel spectrogram:', err);
//       this.error = 'Failed to process audio file. Please try a different file.';
//     } finally {
//       this.loading = false;
//     }
//   }

//   async downloadDownsampledAudio() {
//     if (!this.audioFile) {
//       console.log('No audio file selected for download');
//       this.error = 'Please select an audio file';
//       return;
//     }

//     console.log('Download button clicked, processing file:', this.audioFile.name);
//     this.loading = true;
//     this.error = '';

//     try {
//       const downsampledFile = await this.audioService.downsampleAndExportAudio(this.audioFile);

//       const base64Data = await this.fileToBase64(downsampledFile);
//       const fileName = downsampledFile.name;

//       try {
//         await Filesystem.writeFile({
//           path: fileName,
//           data: base64Data,
//           directory: Directory.Documents,
//         });
//       } catch (fsError) {
//         console.warn('Filesystem write failed, falling back to direct download:', fsError);

//       }

//       // For web, also trigger a download to ensure user gets the file
//       const url = URL.createObjectURL(downsampledFile);
//       const link = document.createElement('a');
//       link.href = url;
//       link.download = fileName;
//       document.body.appendChild(link);
//       console.log('Triggering web download for:', fileName);
//       link.click();
//       document.body.removeChild(link);
//       URL.revokeObjectURL(url);
//       console.log('Web download triggered successfully');
//     } catch (err) {
//       console.error('Error downloading downsampled audio:', err);
//       const errorMessage = err instanceof Error ? err.message : 'Unknown error';
//       this.error = `Failed to downsample or save audio: ${errorMessage}`;
//     } finally {
//       this.loading = false;
//     }
//   }

//   private async fileToBase64(file: File): Promise<string> {
//     return new Promise((resolve, reject) => {
//       const reader = new FileReader();
//       reader.onload = () => {
//         const result = reader.result as string;
//         // Remove the data URL prefix (e.g., "data:audio/wav;base64,")
//         const base64 = result.split(',')[1];
//         if (!base64) {
//           reject(new Error('Failed to convert file to base64'));
//         } else {
//           resolve(base64);
//         }
//       };
//       reader.onerror = (error) => reject(error);
//       reader.readAsDataURL(file);
//     });
//   }

//   private visualizeSpectrogram() {
//     if (!this.melSpectrogramData || !this.ctx || !this.canvasRef) {
//       console.log('Cannot visualize spectrogram: missing data or context');
//       return;
//     }

//     console.log('Visualizing spectrogram...');
//     const canvas = this.canvasRef.nativeElement;
//     const ctx = this.ctx;
//     const width = canvas.width;
//     const height = canvas.height;

//     ctx.fillStyle = '#000000';
//     ctx.fillRect(0, 0, width, height);

//     const imageData = ctx.createImageData(width, height);
//     const data = imageData.data;

//     const melBins = 64;
//     const timeFrames = 173;

//     for (let t = 0; t < timeFrames; t++) {
//       for (let m = 0; m < melBins; m++) {
//         let value = this.melSpectrogramData[t * melBins + m];
//         value = Math.max(0, Math.min(1, value));

//         const x = Math.floor(t * (width / timeFrames));
//         const y = Math.floor((melBins - 1 - m) * (height / melBins));

//         const [r, g, b] = this.getInfernoColor(value);

//         for (let dx = 0; dx < 2; dx++) {
//           for (let dy = 0; dy < 2; dy++) {
//             const px = Math.min(x + dx, width - 1);
//             const py = Math.min(y + dy, height - 1);
//             const idx = (py * width + px) * 4;

//             data[idx] = r;
//             data[idx + 1] = g;
//             data[idx + 2] = b;
//             data[idx + 3] = 255;
//           }
//         }
//       }
//     }

//     ctx.putImageData(imageData, 0, 0);
//     console.log('Spectrogram visualization completed');
//   }

//   private getInfernoColor(t: number): [number, number, number] {
//     const colors = [
//       [0, 0, 0],
//       [50, 0, 80],
//       [180, 30, 100],
//       [240, 70, 40],
//       [255, 180, 60],
//       [255, 255, 255]
//     ];

//     const stops = colors.length - 1;
//     const scaledT = t * stops;
//     const idx = Math.floor(scaledT);
//     const frac = scaledT - idx;

//     const c1 = colors[Math.min(idx, stops - 1)];
//     const c2 = colors[Math.min(idx + 1, stops)];

//     const r = Math.round(c1[0] + frac * (c2[0] - c1[0]));
//     const g = Math.round(c1[1] + frac * (c2[1] - c1[1]));
//     const b = Math.round(c1[2] + frac * (c2[2] - c1[2]));

//     return [r, g, b];
//   }
// }
