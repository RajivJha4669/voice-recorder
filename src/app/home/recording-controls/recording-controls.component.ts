import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { IonButton, IonCard, IonCardContent, IonIcon, IonSpinner, IonText, ToastController } from '@ionic/angular/standalone';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { interval, Observable } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { Recording } from 'src/app/recording.model';
import { StorageService } from 'src/app/storage.service';
import { v4 as uuidv4 } from 'uuid';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { Device, DeviceInfo } from '@capacitor/device';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-recording-controls',
  // ===================================== HTML =================================================================
  template: `
  <ion-card class="ion-padding">
  <ion-card-content>
    <div class="flex flex-col items-center recording-controls">
      <div class="mb-4 timer">
        <ion-text color="primary">
          <h1 class="font-bold text-2xl">{{ formatTime(currentDuration) }}</h1>
        </ion-text>
        <ion-spinner *ngIf="isRecording && !isPaused" name="dots" color="primary"></ion-spinner>
      </div>
      <div class="flex space-x-2 controls">
        <ion-button *ngIf="!isRecording" (click)="startEmitting()" color="primary" fill="solid" [disabled]="isSaving">
          <ion-icon name="mic" slot="start"></ion-icon>
          Start
        </ion-button>
        <ion-button *ngIf="isRecording" (click)="stopEmitting()" color="danger" fill="solid" [disabled]="isSaving">
          <ion-icon name="stop" slot="start"></ion-icon>
          Stop
        </ion-button>
      </div>
      <ion-text *ngIf="permissionDenied" color="danger" class="mt-2">
        <p>Microphone permission is required to record audio.</p>
      </ion-text>
    </div>
  </ion-card-content>
</ion-card>`,
  // ===================================== CSS ===========================================================================
  styles: `
  .recording-controls {
    text-align: center;
  }
  ion-spinner {
    margin-top: 8px;
  }
`,

  standalone: true,
  imports: [IonCard, IonCardContent, IonButton, IonIcon, IonText, NgIf, IonSpinner],
})
export class RecordingControlsComponent implements  OnInit, OnDestroy {
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

    if (this.isAndroid) {
      try {
        await ForegroundService.createNotificationChannel({
          id: 'recording_channel',
          name: 'Audio Recording',
          description: 'Channel for audio recording notifications',
          importance: 4,

        });
        console.log("..............................");

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
          await this.startRecording();
        }
      }
    });
    this.startRecording();
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

  }
}
