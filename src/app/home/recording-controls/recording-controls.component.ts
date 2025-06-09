// import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
// import { Capacitor } from '@capacitor/core';
// import { Directory, Filesystem } from '@capacitor/filesystem';
// import { IonButton, IonCard, IonCardContent, IonIcon, IonText, ToastController, IonAlert } from '@ionic/angular/standalone';
// import { VoiceRecorder } from 'capacitor-voice-recorder';
// import { Recording } from 'src/app/recording.model';
// import { StorageService } from 'src/app/storage.service';
// import { v4 as uuidv4 } from 'uuid';
// import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
// import { Device, DeviceInfo } from '@capacitor/device';
// import { LocalNotifications } from '@capacitor/local-notifications';
// import { AppLauncher } from '@capacitor/app-launcher';
// import { Observable, interval, takeWhile } from 'rxjs';
// import { App } from '@capacitor/app';
// import { AudioProcessingService } from 'src/app/spectrogram.service';
// import { RouterLink } from '@angular/router';
// import { NgFor } from '@angular/common';

// @Component({
//   selector: 'app-recording-controls',
//   template: `
//     <ion-card class="ion-padding recording-card">
//       <ion-card-content>
//         <div class="recording-controls flex flex-col items-center">
//           <div class="timer mb-4">
//             <ion-text color="primary">
//               <h1 class="font-bold text-2xl">{{ formatTime(currentDuration) }}</h1>
//             </ion-text>
//             <ion-text  color="medium">
//               <p>Restarts: {{ restartCount }}</p>
//             </ion-text>
//           </div>
//           <div class="controls flex space-x-2">
//             <ion-button [hidden]="isRecording" (click)="startEmitting()" color="primary" fill="solid" [disabled]="isSaving">
//               <ion-icon name="mic" slot="start"></ion-icon>
//               Start
//             </ion-button>
//             <ion-button (click)="stopEmitting()" color="danger" fill="solid" [disabled]="isSaving">
//               <ion-icon name="stop" slot="start"></ion-icon>
//               Stop
//             </ion-button>
//           </div>
//           <ion-text [hidden]="!permissionDenied" color="danger" class="mt-2">
//             <p>Microphone permission is required to record audio.</p>
//           </ion-text>
//           <canvas #spectrogramCanvas width="173" height="64" class="canvas mt-4"></canvas>
//         </div>

//         <button class="mt-4" routerLink="/record">Mel Spectrogram page</button>
//       </ion-card-content>
//     </ion-card>
//     <div class="flex justify-center" *ngFor="let melSpectrogram of melSpectrographs" (click)="exportSpectrogram(melSpectrogram)">
//       <img [src]="melSpectrogram" alt="Mel Spectrogram" class="w-full max-w-md mb-4">
//     </div>
//     <ion-alert
//       [isOpen]="showPermissionAlert"
//       header="Permission Required"
//       message="Microphone permission is required to record audio."
//       [buttons]="alertButtons"
//       (didDismiss)="showPermissionAlert = false"
//     ></ion-alert>
//   `,
//   styles: `
//     .recording-card {
//       max-width: 500px;
//       margin: 16px auto;
//       min-height: 400px;
//       display: flex;
//       flex-direction: column;
//     }
//     .recording-controls {
//       flex: 1;
//       justify-content: center;
//       align-items: center;
//       padding: 16px;
//     }
//     .timer {
//       min-height: 60px;
//       text-align: center;
//     }
//     .controls {
//       min-height: 48px;
//       display: flex;
//       justify-content: center;
//       align-items: center;
//     }
//     .canvas {
//       width: 100%;
//       max-width: 346px;
//       height: 128px;
//       border: 1px solid #ccc;
//     }
//     ion-text[hidden] {
//       display: block;
//       visibility: hidden;
//     }
//     ion-button[hidden] {
//       display: inline-flex;
//       visibility: hidden;
//     }
//   `,
//   standalone: true,
//   imports: [IonCard, RouterLink, IonCardContent, IonButton, IonIcon, IonText, IonAlert, NgFor],
// })
// export class RecordingControlsComponent implements OnInit, AfterViewInit, OnDestroy {
//   @ViewChild('spectrogramCanvas', { static: false }) canvas!: ElementRef<HTMLCanvasElement>;
//   isRecording = false;
//   isPaused = false;
//   isSaving = false;
//   permissionDenied = false;
//   showPermissionAlert = false;
//   isWebPlatform = Capacitor.getPlatform() === 'web';
//   isAndroid = Capacitor.getPlatform() === 'android';
//   currentDuration = 0;
//   canExport = false;
//   private startTime: number | null = null;
//   private timerInterval: any;
//   private isActive = false;
//   private currentFileName: string | null = null;
//   private deviceInfo: DeviceInfo | null = null;
//   private audioContext: AudioContext | null = null;
//   private spectrogramData: number[][] = Array.from({ length: 173 }, () => new Array(64).fill(0));
//   private readonly SPECTROGRAM_WIDTH = 173; // Time frames
//   private readonly SPECTROGRAM_HEIGHT = 64; // Mel bins
//   restartCount = 0;
//   private recordingSubscription: any;

//   private ctx: CanvasRenderingContext2D | null = null;
//   melSpectrogramData: Float32Array | null = null;

//   alertButtons = [
//     {
//       text: 'Cancel',
//       role: 'cancel',
//       handler: () => {
//         this.showPermissionAlert = false;
//       },
//     },
//     {
//       text: 'Open Settings',
//       handler: () => this.openSettings(),
//     },
//   ];
//   melSpectrographs: string[] = [];

//   constructor(
//     private storageService: StorageService,
//     private toastController: ToastController,
//     private audioProcessingService: AudioProcessingService
//   ) {
//     if (this.isAndroid) {
//       ForegroundService.requestPermissions().catch((error) =>
//         console.error('Error requesting notification permissions:', error)
//       );
//       ForegroundService.addListener('buttonClicked', (event) => {
//         if (event.buttonId === 1) {
//           this.stopEmitting();
//         }
//       });
//     }
//   }

//   async ngOnInit() {
//     await this.initializeDeviceInfo();
//     this.audioContext = new AudioContext();
//     const permission = await LocalNotifications.requestPermissions();
//     if (permission.display !== 'granted') {
//       await this.showToast('Notification permission required for alerts', 'warning');
//     }
//   }

//   ngAfterViewInit() {
//     this.initializeCanvas();
//   }

//   private initializeCanvas() {
//     if (this.canvas && this.canvas.nativeElement) {
//       this.ctx = this.canvas.nativeElement.getContext('2d');
//       if (!this.ctx) {
//         console.error('Could not get canvas context');
//       }
//     }
//   }

//   async initializeDeviceInfo() {
//     try {
//       this.deviceInfo = await Device.getInfo();
//       console.log('Device Info:', this.deviceInfo);
//     } catch (error) {
//       console.error('Error getting device info:', error);
//       await this.showToast('Failed to retrieve device information', 'warning');
//     }
//   }

//   async checkPermission(): Promise<boolean> {
//     try {
//       const permissionStatus = await VoiceRecorder.hasAudioRecordingPermission();
//       if (permissionStatus.value) return true;
//       const requestStatus = await VoiceRecorder.requestAudioRecordingPermission();
//       return requestStatus.value;
//     } catch (error) {
//       console.error('Error checking/requesting permission:', error);
//       return false;
//     }
//   }

//   async startEmitting(): Promise<void> {
//     if (this.isWebPlatform) {
//       await this.showToast('Recording not supported on web', 'warning');
//       return;
//     }

//     const hasPermission = await this.checkPermission();
//     if (!hasPermission) {
//       this.permissionDenied = true;
//       this.showPermissionAlert = true;
//       await this.showToast('Microphone permission required', 'danger');
//       return;
//     }

//     this.isActive = true;
//     this.currentDuration = 0;
//     this.startTime = Date.now();
//     this.restartCount = 0;
//     this.canExport = false;
//     this.permissionDenied = false;

//     if (this.isAndroid) {
//       try {
//         await ForegroundService.createNotificationChannel({
//           id: 'recording_channel',
//           name: 'Audio Recording',
//           description: 'Channel for audio recording notifications',
//           importance: 4,
//         });
//         await ForegroundService.startForegroundService({
//           id: 1,
//           title: 'Audio Recorder',
//           body: `Recording audio in background (Device: ${this.deviceInfo?.model || 'Unknown'})`,
//           smallIcon: 'drawable/ic_stat_recording_icon',
//           buttons: [{ title: 'Stop Recording', id: 1 }],
//           silent: false,
//           notificationChannelId: 'recording_channel',
//         });
//       } catch (error) {
//         console.error('Error starting foreground service:', error);
//         await this.showToast('Failed to start background recording', 'danger');
//         this.isActive = false;
//         return;
//       }
//     }
//     this.recordingSubscription = this.emitEventEvery10Seconds().subscribe(async () => {
//       if (this.isRecording) {
//         console.log('10 seconds completed, stopping and restarting recording');
//         await this.stopRecording();
//         if (this.isActive) {
//           this.currentDuration = 0;
//           this.startTime = Date.now();
//           this.restartCount++;
//           await this.startRecording();
//         }
//       }
//     });
//     await this.startRecording();
//   }


//   emitEventEvery10Seconds(): Observable<number> {
//     return interval(6000).pipe(takeWhile(() => this.isActive));
//   }

//   async stopEmitting(): Promise<void> {
//     this.isActive = false;
//     if (this.recordingSubscription) {
//       this.recordingSubscription.unsubscribe();
//       this.recordingSubscription = null;
//     }
//     await this.stopRecording();
//     if (this.isAndroid) {
//       try {
//         await ForegroundService.stopForegroundService();
//       } catch (error) {
//         console.error('Error stopping foreground service:', error);
//       }
//     }
//   }

//   async startRecording() {
//     if (this.isWebPlatform) {
//       await this.showToast('Recording not supported on web', 'warning');
//       return;
//     }
//     if (this.isRecording) {
//       await this.showToast('Recording already in progress', 'warning');
//       return;
//     }
//     try {
//       this.startTimer();
//       await VoiceRecorder.startRecording();
//       this.isRecording = true;
//       this.isPaused = false;
//       await this.showToast('Recording started');
//     } catch (error) {
//       console.error('Error starting recording:', error);
//       this.handleRecordingError();
//     }
//   }

//   async stopRecording() {
//     return new Promise(async (resolve) => {
//       if (!this.isRecording || this.isSaving) {
//         await this.showToast('No active recording or saving in progress', 'warning');
//         resolve(true);
//         return;
//       }
//       try {
//         this.isSaving = true;
//         const result = await VoiceRecorder.stopRecording();
//         await this.clearTimer();

//         if (!result.value?.recordDataBase64) {
//           throw new Error('No recording data returned');
//         }

//         this.melSpectrogramData = await this.audioProcessingService.generateStandardMelSpectrogram(this.audioProcessingService.base64ToFile(result.value.recordDataBase64, 'recording.wav', 'audio/wav'))
//         await this.visualizeSpectrogram();
//         // Save original base64 as WAV and spectrogram matrix
//         await this.saveSpectrogramMatrix();
//         await this.saveRecording(result.value.recordDataBase64, this.currentDuration || 4000);
//       } catch (error) {
//         console.error(`Error stopping recording on ${this.deviceInfo?.platform || 'unknown'}:`, error);
//         await this.showToast('Failed to stop recording', 'danger');
//         this.handleRecordingError();
//       } finally {
//         this.isSaving = false;
//         resolve(true);
//       }
//     });
//   }

//   private visualizeSpectrogram() {
//     if (!this.melSpectrogramData || !this.ctx || !this.canvas) return;

//     const canvas = this.canvas.nativeElement;
//     const ctx = this.ctx;
//     const width = canvas.width;
//     const height = canvas.height;

//     // Fill background black
//     ctx.fillStyle = '#000000';
//     ctx.fillRect(0, 0, width, height);

//     const imageData = ctx.createImageData(width, height);
//     const data = imageData.data;

//     const melBins = 64;
//     const timeFrames = 173;

//     for (let t = 0; t < timeFrames; t++) {
//       for (let m = 0; m < melBins; m++) {
//         let value = this.melSpectrogramData[t * melBins + m];

//         // Clamp and normalize [0, 1]
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
//   }

//   private getInfernoColor(t: number): [number, number, number] {
//     // Colors from black → purple → red → orange → yellow → white
//     const colors = [
//       [0, 0, 0],           // Black
//       [50, 0, 80],         // Dark Purple
//       [180, 30, 100],      // Magenta-Red
//       [240, 70, 40],       // Orange-Red
//       [255, 180, 60],      // Yellow
//       [255, 255, 255]      // White
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

//   async saveSpectrogramMatrix() {
//     const dataUrl = this.canvas.nativeElement.toDataURL('image/png');
//     if (!this.melSpectrographs)
//       this.melSpectrographs = []

//     this.melSpectrographs.push(dataUrl);
//   }

//   async exportSpectrogram(dataUrl:any) {
//     if (!this.canExport || !this.canvas) {
//       await this.showToast('No spectrogram available to export', 'warning');
//       return;
//     }
//     try {
//       console.log('Exporting spectrogram...');

//       if (!dataUrl || dataUrl === 'data:,') {
//         throw new Error('Invalid canvas data URL');
//       }

//       const base64Data = dataUrl.split(',')[1];
//       const fileName = `spectrogram_${new Date().getTime()}.png`;

//       if (this.isWebPlatform) {
//         const link = document.createElement('a');
//         link.href = dataUrl;
//         link.download = fileName;
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//       } else {
//         await Filesystem.writeFile({
//           path: fileName,
//           data: base64Data,
//           directory: Directory.Documents,
//         });
//       }
//       await this.showToast('Spectrogram saved successfully');
//     } catch (error) {
//       console.error('Error exporting spectrogram:', error);
//       await this.showToast('Failed to save spectrogram', 'danger');
//     }
//   }

//   async openSettings() {
//     try {
//       if (this.isAndroid) {
//         const appInfo = await App.getInfo();
//         const packageName = appInfo.id;
//         const result = await AppLauncher.openUrl({
//           url: `intent://#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=${packageName};end`,
//         });
//         if (!result.completed) {
//           throw new Error('Failed to launch app settings');
//         }
//       } else {
//         const result = await AppLauncher.openUrl({ url: 'app-settings:' });
//         if (!result.completed) {
//           throw new Error('Failed to launch app settings');
//         }
//       }
//     } catch (error) {
//       console.error('Error opening settings:', error);
//       await this.showToast('Failed to open app settings. Please go to Settings > Apps > Your App manually.', 'error');
//     }
//   }

//   private async saveRecording(base64String: string, duration: number) {
//     try {
//       if (this.currentFileName) {
//         // Optional: Delete previous file
//       }
//       const fileName = `recording_${new Date().getTime()}_16khz.wav`;
//       this.currentFileName = fileName;
//       const directory = Directory.Documents;
//       await Filesystem.writeFile({
//         path: fileName,
//         data: base64String,
//         directory: directory,
//       });
//       const recording: Recording = {
//         id: uuidv4(),
//         name: `Recording ${new Date().toLocaleString()}`,
//         filePath: fileName,
//         date: new Date().toISOString(),
//         duration,
//       };
//       // await this.storageService.addRecord(recording);
//       await this.showToast('Recording saved successfully');
//     } catch (error) {
//       console.error('Error saving recording:', error);
//       await this.showToast('Failed to save recording', 'danger');
//       throw error;
//     } finally {
//       this.resetRecordingState();
//     }
//   }

//   private startTimer() {
//     this.timerInterval = setInterval(() => {
//       if (this.startTime !== null && !this.isPaused) {
//         this.currentDuration = Date.now() - this.startTime;
//       }
//     }, 100);
//   }

//   private clearTimer() {
//     return new Promise(async (resolve) => {
//       if (this.timerInterval) {
//         clearInterval(this.timerInterval);
//         this.timerInterval = null;
//       }
//       resolve(true);
//     });
//   }

//   private async resetRecordingState() {
//     this.isRecording = false;
//     this.isPaused = false;
//     this.currentDuration = 0;
//     this.startTime = null;
//     await this.clearTimer();
//   }

//   private handleRecordingError() {
//     this.permissionDenied = true;
//     this.showPermissionAlert = true;
//     this.resetRecordingState();
//   }

//   private async showToast(message: string, color: string = 'success') {
//     const toast = await this.toastController.create({ message, duration: 2000, color, position: 'bottom' });
//     await toast.present();
//   }

//   formatTime(ms: number): string {
//     if (isNaN(ms)) return '00:00';
//     const totalSeconds = Math.floor(ms / 1000);
//     const minutes = Math.floor(totalSeconds / 60);
//     const remainingSeconds = totalSeconds % 60;
//     return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
//   }

//   async ngOnDestroy() {
//     await this.clearTimer();
//     if (this.recordingSubscription) {
//       this.recordingSubscription.unsubscribe();
//     }
//     if (this.audioContext) {
//       await this.audioContext.close();
//     }
//   }
// }
