import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { StorageService } from '../../services/storage.service';
import { Recording } from '../../models/recording.model';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

@Component({
  selector: 'app-recording-controls',
  templateUrl: './recording-controls.component.html',
  styleUrls: ['./recording-controls.component.css'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class RecordingControlsComponent {
  isRecording = false;
  isPaused = false;
  permissionDenied = false;
  isWebPlatform = Capacitor.getPlatform() === 'web';
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime: number | null = null;

  constructor(private storageService: StorageService) {}

  async startRecording() {
    try {
      if (this.isRecording) {
        console.warn('Recording is already in progress');
        return;
      }

      const permissionStatus = await VoiceRecorder.requestAudioRecordingPermission();
      if (!permissionStatus.value) {
        console.error('Audio recording permission denied');
        this.permissionDenied = true;
        return;
      }

      this.permissionDenied = false;

      if (this.isWebPlatform) {
        // Custom web implementation using MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); // Line 81: This throws the error
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        this.recordedChunks = [];
        this.startTime = Date.now();
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = async () => {
          const duration = this.startTime ? Date.now() - this.startTime : 0;
          const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const base64String = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          this.stopRecordingWeb(base64String, duration);
          stream.getTracks().forEach(track => track.stop());
        };

        this.mediaRecorder.start();
      } else {
        await VoiceRecorder.startRecording();
      }

      this.isRecording = true;
      this.isPaused = false;
    } catch (error) {
      console.error('Error starting recording:', error);
      this.permissionDenied = true;
    }
  }

  async stopRecording() {
    if (!this.isRecording) {
      console.warn('No active recording to stop');
      return;
    }

    if (this.isWebPlatform) {
      this.mediaRecorder?.stop();
    } else {
      try {
        const result = await VoiceRecorder.stopRecording();
        this.isRecording = false;
        this.isPaused = false;

        if (!result.value || !result.value.recordDataBase64) {
          console.error('No recording data returned');
          return;
        }

        const fileName = `recording_${uuidv4()}.aac`;
        await Filesystem.writeFile({
          path: fileName,
          data: result.value.recordDataBase64,
          directory: Directory.Data,
        });

        const recording: Recording = {
          id: fileName,
          name: `Recording ${new Date().toLocaleString()}`,
          filePath: fileName,
          date: new Date().toISOString(),
          duration: result.value.msDuration || 0,
        };
        await this.storageService.saveRecording(recording);
      } catch (error) {
        console.error('Error stopping recording:', error);
        this.isRecording = false;
        this.isPaused = false;
      }
    }
  }

  async stopRecordingWeb(base64String: string, duration: number) {
    this.isRecording = false;
    this.isPaused = false;

    const fileName = `recording_${uuidv4()}.webm`;
    await Filesystem.writeFile({
      path: fileName,
      data: base64String,
      directory: Directory.Data,
    });

    const recording: Recording = {
      id: fileName,
      name: `Recording ${new Date().toLocaleString()}`,
      filePath: fileName,
      date: new Date().toISOString(),
      duration,
    };
    await this.storageService.saveRecording(recording);
  }

  async pauseRecording() {
    if (this.isWebPlatform) {
      console.warn('Pause recording is not supported in the browser');
      return;
    }

    try {
      if (!this.isRecording || this.isPaused) {
        console.warn('Cannot pause: No active recording or already paused');
        return;
      }

      await VoiceRecorder.pauseRecording();
      this.isPaused = true;
    } catch (error) {
      console.error('Error pausing recording:', error);
    }
  }

  async resumeRecording() {
    if (this.isWebPlatform) {
      console.warn('Resume recording is not supported in the browser');
      return;
    }

    try {
      if (!this.isRecording || !this.isPaused) {
        console.warn('Cannot resume: No active recording or not paused');
        return;
      }

      await VoiceRecorder.resumeRecording();
      this.isPaused = false;
    } catch (error) {
      console.error('Error resuming recording:', error);
    }
  }

  async openSettings() {
    if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
      try {
        const settingsUrl = 'app-settings:';
        const canOpen = await AppLauncher.canOpenUrl({ url: settingsUrl });
        if (canOpen.value) {
          await AppLauncher.openUrl({ url: settingsUrl });
        } else {
          console.error('Unable to open app settings');
        }
      } catch (error) {
        console.error('Error opening settings:', error);
      }
    }
  }
}
