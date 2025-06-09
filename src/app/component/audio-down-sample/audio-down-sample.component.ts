// // audio-down-sample.component.ts
// import { v4 as uuidv4 } from 'uuid';
// import { Component, OnInit } from '@angular/core';
// import { RouterLink } from '@angular/router';
// import { Capacitor } from '@capacitor/core';
// import { Device, DeviceInfo } from '@capacitor/device';
// import { Directory, Filesystem } from '@capacitor/filesystem';
// import { LocalNotifications } from '@capacitor/local-notifications';
// import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
// import { IonCard, IonCardContent, IonButton, IonIcon, IonText, IonAlert, ToastController, IonContent } from '@ionic/angular/standalone';
// import { VoiceRecorder } from 'capacitor-voice-recorder';
// import { Observable, interval, takeWhile } from 'rxjs';
// import { Recording } from 'src/app/recording.model';
// import { AudioProcessingService } from 'src/app/spectrogram.service';
// import { StorageService } from 'src/app/storage.service';
// import { RecordingsListComponent } from './recordings-list.component';

// @Component({
//   selector: 'app-audio-down-sample',
//   templateUrl: './audio-down-sample.component.html',
//   styleUrls: ['./audio-down-sample.component.css'],
//   standalone: true,
//   imports: [IonCard, RouterLink, IonCardContent, IonButton, IonIcon, IonText, RecordingsListComponent,]
// })
// export class AudioDownSampleComponent implements OnInit {
//   isSaving = false;
//   permissionDenied = false;
//   isRecording = false;
//   isPaused = false;
//   currentDuration = 0;
//   restartCount = 0;
//   showPermissionAlert = false;
//   private isActive = false;
//   private startTime: number | null = null;
//   private timerInterval: any;
//   private currentFileName: string | null = null;
//   private recordingSubscription: any;
//   private deviceInfo: DeviceInfo | null = null;
//   private audioContext: AudioContext | null = null;

//   isWebPlatform = Capacitor.getPlatform() === 'web';
//   isAndroid = Capacitor.getPlatform() === 'android';

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
//     if (this.isWebPlatform) {
//       await this.showToast('Recording not supported on web', 'warning');
//       return;
//     }
//     if (!this.isRecording) {
//       await this.showToast('No recording in progress', 'warning');
//       return;
//     }
//     try {
//       const result = await VoiceRecorder.stopRecording();
//       console.log('Saved recording type----------->:', result.value);
//       this.isRecording = false;
//       await this.saveRecording(result.value.recordDataBase64, this.currentDuration || 4000);
//     } catch (error) {
//       console.error('Error stopping recording:', error);
//       this.handleRecordingError();
//     }
//   }

//   private async saveRecording(base64String: any, duration: number) {
//     this.isSaving = true;
//     try {
//       if (!base64String) {
//         throw new Error('Base64 string is empty');
//       }
//       const timestamp = new Date().getTime();
//       const originalFileName = `recording_${timestamp}_original.wav`;
//       const downsampledFileName = `recording_${timestamp}_16khz.wav`;
//       this.currentFileName = originalFileName;
//       const directory = Directory.Documents;
//       console.log('base64String', base64String, 'duration', duration);

//       await Filesystem.writeFile({
//         path: originalFileName,
//         data: base64String,
//         directory: directory,
//       });
//       const originalRecording: Recording = {
//         id: uuidv4(),
//         name: `Recording ${new Date().toLocaleString()} (Original)`,
//         filePath: originalFileName,
//         date: new Date().toISOString(),
//         duration,
//         type: 'original',
//       };

//       const downsampledBase64 = await this.audioProcessingService.downsampleAudio(base64String, 16000);
//       if (!downsampledBase64) {
//       }
//       await Filesystem.writeFile({
//         path: downsampledFileName,
//         data: downsampledBase64,
//         directory: directory,
//       });
//       const downsampledRecording: Recording = {
//         id: uuidv4(),
//         name: `Recording ${new Date().toLocaleString()} (16kHz)`,
//         filePath: downsampledFileName,
//         date: new Date().toISOString(),
//         duration,
//         type: '16kHz',
//       };

//       // Save both recordings
//       await this.storageService.addRecords([originalRecording, downsampledRecording]);
//       await this.showToast('Both original and 16kHz recordings saved successfully');
//     } catch (error) {
//       console.error('Error saving recordings:', error);
//       const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//       await this.showToast(`Failed to save recordings: ${errorMessage}`, 'danger');
//     } finally {
//       this.isSaving = false;
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
//         console.log('4 seconds completed, stopping and restarting recording');
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

//   private startTimer() {
//     if (this.timerInterval) {
//       clearInterval(this.timerInterval);
//     }
//     this.currentDuration = 0;
//     this.startTime = Date.now();
//     this.timerInterval = setInterval(() => {
//       if (this.startTime !== null && !this.isPaused) {
//         this.currentDuration = Date.now() - this.startTime;
//         console.log('Timer running, duration:', this.currentDuration);
//       }
//     }, 100);
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

//   emitEventEvery10Seconds(): Observable<number> {
//     return interval(4000).pipe(takeWhile(() => this.isActive));
//   }

//   private handleRecordingError() {
//     this.permissionDenied = true;
//     this.showPermissionAlert = true;
//     this.resetRecordingState();
//   }

//   private resetRecordingState() {
//     this.isRecording = false;
//     this.isActive = false;
//     this.startTime = null;
//     if (this.timerInterval) {
//       clearInterval(this.timerInterval);
//       this.timerInterval = null;
//     }
//     this.currentDuration = 0;
//   }

//   formatTime(ms: number): string {
//     if (isNaN(ms)) return '00:00';
//     const totalSeconds = Math.floor(ms / 1000);
//     const minutes = Math.floor(totalSeconds / 60);
//     const remainingSeconds = totalSeconds % 60;
//     return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
//   }

//   private async showToast(message: string, color: string = 'success') {
//     const toast = await this.toastController.create({ message, duration: 2000, color, position: 'bottom' });
//     await toast.present();
//   }
// }
