import { NgIf } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { IonButton, IonCard, IonCardContent, IonIcon, IonText, ToastController } from '@ionic/angular/standalone';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { interval, Observable } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { Recording } from 'src/app/recording.model';
import { StorageService } from 'src/app/storage.service';
import { v4 as uuidv4 } from 'uuid';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Device, DeviceInfo } from '@capacitor/device';
import { LocalNotifications } from '@capacitor/local-notifications';
@Component({
  selector: 'app-recording-controls',
  // ===================================== HTML =================================================================
  template: `
 <ion-card class="ion-padding recording-card">
      <ion-card-content>
        <div class="recording-controls flex flex-col items-center">
          <div class="timer mb-4">
            <ion-text color="primary">
              <h1 class="font-bold text-2xl">{{ formatTime(currentDuration) }}</h1>
            </ion-text>
            <ion-text color="medium">
              <p>Restarts: {{ restartCount ||0 }}</p>
            </ion-text>
          </div>
          <div class="controls flex space-x-2">
            <ion-button [hidden]="isRecording" (click)="startEmitting()" color="primary" fill="solid" [disabled]="isSaving">
              <ion-icon name="mic" slot="start"></ion-icon>
              Start
            </ion-button>
            <ion-button [hidden]="!isRecording" (click)="stopEmitting()" color="danger" fill="solid" [disabled]="isSaving">
              <ion-icon name="stop" slot="start"></ion-icon>
              Stop
            </ion-button>
            <ion-button (click)="exportSpectrogram()" color="tertiary" fill="solid" [disabled]="!canExport">
            <ion-icon name="download-outline" [slot]="'start'"></ion-icon>
              Export
            </ion-button>
          </div>
          <ion-text [hidden]="!permissionDenied" color="danger" class="mt-2">
            <p>Microphone permission is required to record audio.</p>
          </ion-text>
          <canvas #spectrogramCanvas width="200" height="128" class="canvas mt-4"></canvas>
        </div>
      </ion-card-content>
    </ion-card>
    `,
  // ===================================== CSS ===========================================================================
  styles: `
  .recording-card {
      max-width: 500px;
      margin: 16px auto;
      min-height: 400px;
      display: flex;
      flex-direction: column;
    }
    .recording-controls {
      flex: 1;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }
    .timer {
      min-height: 60px;
      text-align: center;
    }
    .controls {
      min-height: 48px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .canvas {
      width: 100%;
      max-width: 400px;
      height: 256px;
      border: 1px solid #ccc;
    }
    ion-text[hidden] {
      display: block;
      visibility: hidden;
    }
    ion-button[hidden] {
      display: inline-flex;
      visibility: hidden;
    }
`,

  standalone: true,
  imports: [IonCard, IonCardContent, IonButton, IonIcon, IonText],
})
export class RecordingControlsComponent implements OnInit, OnDestroy {
  @ViewChild('spectrogramCanvas', { static: false }) canvas!: ElementRef<HTMLCanvasElement>;
  // ================================================
  isRecording = false;
  isPaused = false;
  isSaving = false;
  permissionDenied = false;
  isWebPlatform = Capacitor.getPlatform() === 'web';
  isAndroid = Capacitor.getPlatform() === 'android';
  currentDuration = 0;
  private startTime: number | null = null;
  private timerInterval: any;

  // ================================================
  private lastSegmentBase64: string | null = null;
  private segmentStartTime: number | null = null;
  private isActive = false;
  private recordingSubscription: any;
  private currentFileName: string | null = null;
  private deviceInfo: DeviceInfo | null = null;
  // ================================================
  private audioContext: AudioContext | null = null;
  private spectrogramData: number[][] = [];
  private readonly SPECTROGRAM_WIDTH = 200;
  private readonly SPECTROGRAM_HEIGHT = 128;
  private readonly FFT_SIZE = 2048;

  canExport = false; // Controls Export button state
  // ====================================================
  restartCount = 0;
  constructor(private storageService: StorageService, private toastController: ToastController) {
    if (this.isAndroid) {
      ForegroundService.requestPermissions().catch((error) =>
        console.error('Error requesting notification permissions:', error)
      );
      ForegroundService.addListener('buttonClicked', (event) => {
        if (event.buttonId === 1) {
          this.stopEmitting();
        }
      });
    }
  }

  // =======================================================================================================================
  async ngOnInit() {
    await this.initializeDeviceInfo();
    this.audioContext = new AudioContext({ sampleRate: 44100 });
    // Request notification permissions
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') {
      await this.showToast('Notification permission required for SOS alerts', 'warning');
    }
  }

  // =======================================================================================================================
  async initializeDeviceInfo() {
    try {
      this.deviceInfo = await Device.getInfo();
      console.log('Device Info:', this.deviceInfo);
    } catch (error) {
      console.error('Error getting device info:', error);
      await this.showToast('Failed to retrieve device information', 'warning');
    }
  }

  // =======================================================================================================================
  async checkPermission(): Promise<boolean> {
    try {
      const permissionStatus = await VoiceRecorder.hasAudioRecordingPermission();
      if (permissionStatus.value) return true;
      const requestStatus = await VoiceRecorder.requestAudioRecordingPermission();
      return requestStatus.value;
    } catch (error) {
      console.error('Error checking/requesting permission:', error);
      return false;
    }
  }

  // ==========================================================================================================================
  emitEventEvery10Seconds(): Observable<number> {
    return interval(10000).pipe(takeWhile(() => this.isActive));
  }

  // ==========================================================================================================================
  async startEmitting(): Promise<void> {
    if (this.isWebPlatform) {
      await this.showToast('Recording not supported on web', 'warning');
      return;
    }

    this.isActive = true;
    this.currentDuration = 0;
    this.startTime = Date.now();
    this.restartCount = 0;
    this.canExport = false; // Disable export until spectrogram is generated

    if (this.isAndroid) {
      try {
        await ForegroundService.createNotificationChannel({
          id: 'recording_channel',
          name: 'Audio Recording',
          description: 'Channel for audio recording notifications',
          importance: 4,
        });
        await ForegroundService.startForegroundService({
          id: 1,
          title: 'Audio Recorder',
          body: `Recording audio in background (Device: ${this.deviceInfo?.model || 'Unknown'})`,
          smallIcon: 'drawable/ic_stat_recording_icon',
          buttons: [{ title: 'Stop Recording', id: 1 }],
          silent: false,
          notificationChannelId: 'recording_channel',
        });
      } catch (error) {
        console.error('Error starting foreground service:', error);
        await this.showToast('Failed to start background recording', 'danger');
        this.isActive = false;
        return;
      }
    }

    this.recordingSubscription = this.emitEventEvery10Seconds().subscribe(async () => {
      if (this.isRecording) {
        console.log('10 seconds completed, stopping and restarting recording');
        await this.stopRecording();
        if (this.isActive) {
          this.currentDuration = 0;
          this.startTime = Date.now();
          this.restartCount++;
          await this.startRecording();
        }
      }
    });
    await this.startRecording();
  }

  // ==========================================================================================================================
  async stopEmitting(): Promise<void> {
    this.isActive = false;
    if (this.recordingSubscription) {
      this.recordingSubscription.unsubscribe();
      this.recordingSubscription = null;
    }
    await this.stopRecording();
    if (this.isAndroid) {
      try {
        await ForegroundService.stopForegroundService();
      } catch (error) {
        console.error('Error stopping foreground service:', error);
      }
    }
  }

  // ==========================================================================================================================
  async startRecording() {
    if (this.isWebPlatform) {
      await this.showToast('Recording not supported on web', 'warning');
      return;
    }
    if (this.isRecording) {
      await this.showToast('Recording already in progress', 'warning');
      return;
    }
    const hasPermission = await this.checkPermission();
    if (!hasPermission) {
      this.permissionDenied = true;
      await this.showToast('Microphone permission required', 'danger');
      return;
    }
    try {
      this.permissionDenied = false;
      this.startTimer();
      await VoiceRecorder.startRecording();
      this.isRecording = true;
      this.isPaused = false;
      await this.showToast('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      this.handleRecordingError();
    }
  }

  // ==========================================================================================================================
  async stopRecording() {
    return new Promise(async (resolve) => {
      if (!this.isRecording || this.isSaving) {
        await this.showToast('No active recording or saving in progress', 'warning');
        resolve(true);
        return;
      }
      try {
        this.isSaving = true;
        const result = await VoiceRecorder.stopRecording();
        await this.clearTimer();

        if (!result.value?.recordDataBase64) {
          throw new Error('No recording data returned');
        }
        // Generate spectrogram before saving
        await this.generateSpectrogram(result.value.recordDataBase64);
        this.canExport = this.spectrogramData.length > 0;
        await this.classifySpectrogram();
        await this.saveRecording(result.value.recordDataBase64, this.currentDuration || 10000);
      } catch (error) {
        console.error(`Error stopping recording on ${this.deviceInfo?.platform || 'unknown'}:`, error);
        await this.showToast('Failed to stop recording', 'danger');
        this.handleRecordingError();
      } finally {
        this.isSaving = false;
        resolve(true);
      }
    });
  }

  async generateSpectrogram(base64String: string) {
    try {
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      // Decode audio data
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 44100 });
      }
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Initialize spectrogram data
      this.spectrogramData = [];
      const duration = audioBuffer.duration * 1000; // ms
      const stepMs = duration / this.SPECTROGRAM_WIDTH;
      const bufferLength = this.FFT_SIZE / 2; // Number of frequency bins

      // Process audio in chunks
      for (let t = 0; t < this.SPECTROGRAM_WIDTH; t++) {
        // Create a new OfflineAudioContext for each chunk
        const offlineContext = new OfflineAudioContext({
          numberOfChannels: 1,
          length: Math.ceil((stepMs / 1000) * audioBuffer.sampleRate),
          sampleRate: audioBuffer.sampleRate,
        });

        // Create new source and analyser for each chunk
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        const analyser = offlineContext.createAnalyser();
        analyser.fftSize = this.FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser);
        analyser.connect(offlineContext.destination);

        // Extract chunk at specific time
        const startTime = (t * stepMs) / 1000;
        const chunkDuration = stepMs / 1000;
        source.start(0, startTime, chunkDuration);

        // Render the chunk
        await offlineContext.startRendering();
        const dataArray = new Float32Array(bufferLength);
        analyser.getFloatFrequencyData(dataArray);

        // Normalize and store frequency data
        const normalizedData = Array.from(dataArray)
          .slice(0, this.SPECTROGRAM_HEIGHT)
          .map(val => (val === -Infinity ? 0 : (val + 100) / 100)); // Handle -Infinity
        this.spectrogramData.push(normalizedData);
      }

      // Draw spectrogram
      this.drawSpectrogram();
    } catch (error) {
      console.error('Error generating spectrogram:', error);
      await this.showToast('Failed to generate spectrogram', 'danger');
    }
  }


  async classifySpectrogram() {
    try {
      const spectrogram = this.getSpectrogramData();
      if (spectrogram.length === 0) {
        await this.showToast('No spectrogram data to classify', 'warning');
        return;
      }
      // Simulate emergency sound detection (since no model is available)
      // Randomly trigger alert 30% of the time for testing
      const score = Math.random();
      console.log('Simulated classification score:', score);
      if (score > 0.7) { // Adjust threshold for testing (0.7 = 30% chance)
        await this.showToast('Emergency sound detected (simulated)!', 'danger');
        await this.triggerSOSAlert();
      }
    } catch (error) {
      console.error('Error classifying spectrogram:', error);
      await this.showToast('Failed to classify spectrogram', 'danger');
    }
  }

  async triggerSOSAlert() {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Emergency Sound Detected!',
            body: 'Please take action.',
            id: Math.floor(Math.random() * 1000),
            schedule: { at: new Date(Date.now() + 1000) },
          },
        ],
      });
      console.log('SOS alert triggered');
    } catch (error) {
      console.error('Error triggering SOS alert:', error);
      await this.showToast('Failed to send SOS alert', 'danger');
    }
  }
  // ==========================================================================================================================async exportSpectrogram() {
  async exportSpectrogram() {
    if (!this.canExport || !this.canvas) {
      await this.showToast('No spectrogram available to export', 'warning');
      return;
    }
    try {
      console.log('Exporting spectrogram...');
      const dataUrl = this.canvas.nativeElement.toDataURL('image/png');
      console.log('Data URL length:', dataUrl.length);

      if (!dataUrl || dataUrl === 'data:,') {
        throw new Error('Invalid canvas data URL');
      }

      // Extract base64 data (remove "data:image/png;base64," prefix)
      const base64Data = dataUrl.split(',')[1];
      const fileName = `spectrogram_${new Date().getTime()}.png`;

      if (this.isWebPlatform) {
        // Fallback for web: use download link
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('Web download triggered:', fileName);
      } else {
        // Mobile: save to filesystem
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
        });
        console.log('File saved to Documents:', fileName);
      }

      await this.showToast('Spectrogram saved successfully');
    } catch (error) {
      console.error('Error exporting spectrogram:', error);
      await this.showToast('Failed to save spectrogram', 'danger');
    }
  }
  // ==========================================================================================================================
  drawSpectrogram() {
    if (!this.canvas || !this.canvas.nativeElement.getContext('2d')) return;
    const ctx = this.canvas.nativeElement.getContext('2d')!;
    const width = this.canvas.nativeElement.width;
    const height = this.canvas.nativeElement.height;
    const imageData = ctx.createImageData(width, height);

    for (let t = 0; t < this.SPECTROGRAM_WIDTH; t++) {
      for (let f = 0; f < this.SPECTROGRAM_HEIGHT; f++) {
        const value = this.spectrogramData[t]?.[f] || 0;
        const pixelIndex = ((this.SPECTROGRAM_HEIGHT - f - 1) * width + t) * 4;
        const intensity = Math.floor(value * 255);
        imageData.data[pixelIndex] = intensity; // R
        imageData.data[pixelIndex + 1] = 0; // G
        imageData.data[pixelIndex + 2] = 255 - intensity; // B
        imageData.data[pixelIndex + 3] = 255; // A
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  getSpectrogramData(): number[][] {
    return this.spectrogramData; // For AI classification
  }

  // ==========================================================================================================================
  private async saveRecording(base64String: string, duration: number) {
    try {
      if (this.currentFileName) {
        // try {
        //   await Filesystem.deleteFile({
        //     path: this.currentFileName,
        //     directory: Directory.Documents,
        //   });
        // } catch (error) {
        //   console.warn('Error deleting previous file:', error);
        // }
      }
      const fileName = `recording_${new Date().getTime()}.wav`;
      this.currentFileName = fileName;
      const directory = Directory.Documents;
      await Filesystem.writeFile({
        path: fileName,
        data: base64String,
        directory: directory
      });
      const recording: Recording = {
        id: uuidv4(),
        name: `Recording ${new Date().toLocaleString()}`,
        filePath: fileName,
        date: new Date().toISOString(),
        duration,
      };
      await this.storageService.addRecord(recording);
      await this.showToast('Recording saved successfully');
      if (this.isActive) {
        await this.startRecording();
      }
    } catch (error) {
      console.error('Error saving recording:', error);
      await this.showToast('Failed to save recording', 'danger');
      throw error;
    } finally {
      this.resetRecordingState();
    }
  }

  // ==========================================================================================================================

  private startTimer() {
    this.timerInterval = setInterval(() => {
      if (this.startTime !== null && !this.isPaused) {
        this.currentDuration = Date.now() - this.startTime;
      }
    }, 100);
  }

  // ==========================================================================================================================
  private clearTimer() {
    return new Promise(async (resolve, reject) => {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      resolve(true);
    });
  }

  // ==========================================================================================================================
  private async resetRecordingState() {
    this.isRecording = false;
    this.isPaused = false;
    this.currentDuration = 0;
    this.startTime = null;
    this.segmentStartTime = null;
    this.lastSegmentBase64 = null;
    await this.clearTimer();
  }

  // ==========================================================================================================================
  private handleRecordingError() {
    this.permissionDenied = true;
    this.resetRecordingState();
  }

  // ==========================================================================================================================
  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({ message, duration: 2000, color, position: 'bottom' });
    await toast.present();
  }

  // ==========================================================================================================================
  formatTime(ms: number): string {
    if (isNaN(ms)) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // ==========================================================================================================================
  async ngOnDestroy() {
    await this.clearTimer();
    if (this.recordingSubscription) {
      this.recordingSubscription.unsubscribe();
    }
    if (this.audioContext) {
      await this.audioContext.close();
    }

  }
}
