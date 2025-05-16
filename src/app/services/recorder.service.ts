import { Injectable } from '@angular/core';
import { VoiceRecorder, RecordingData, GenericResponse } from 'capacitor-voice-recorder';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { v4 as uuidv4 } from 'uuid';
import { Recording } from '../models/recording.model';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root',
})
export class RecorderService {
  private isRecording = false;
  private startTime: Date | null = null;

  constructor(private platform: Platform) {}

  async startRecording(): Promise<void> {
    if (!this.isRecording) {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        await VoiceRecorder.requestAudioRecordingPermission();
      }
      await VoiceRecorder.startRecording();
      this.isRecording = true;
      this.startTime = new Date();
    }
  }

  async stopRecording(): Promise<Recording> {
    if (this.isRecording) {
      const result: RecordingData = await VoiceRecorder.stopRecording();
      this.isRecording = false;

      const id = uuidv4();
      const fileName = `recording_${id}.aac`; // Use .aac for iOS/Android, adjust for web if needed
      const duration = this.startTime
        ? (new Date().getTime() - this.startTime.getTime()) / 1000
        : 0;

      if (!result.value.recordDataBase64) {
        throw new Error('No recording data available');
      }

      // Platform-specific data handling
      let data: string | Blob = result.value.recordDataBase64;
      if (this.platform.is('hybrid')) {
        // Native (iOS/Android): Use base64 string
        data = result.value.recordDataBase64;
      } else if (this.platform.is('pwa')) {
        // Web: Convert base64 to Blob
        const byteCharacters = atob(result.value.recordDataBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        data = new Blob([byteArray], { type: result.value.mimeType || 'audio/aac' });
      }

      // Write file
      await Filesystem.writeFile({
        path: fileName,
        data,
        directory: Directory.Data,
      });

      return {
        id,
        name: `Recording ${new Date().toLocaleDateString()}`,
        date: new Date(),
        duration,
        filePath: fileName,
      };
    }
    throw new Error('No active recording');
  }

  async pauseRecording(): Promise<void> {
    if (this.isRecording) {
      await VoiceRecorder.pauseRecording();
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording) {
      await VoiceRecorder.resumeRecording();
    }
  }

  async checkPermissions(): Promise<boolean> {
    const permission: GenericResponse = await VoiceRecorder.hasAudioRecordingPermission();
    return permission.value;
  }

  getRecordingStatus(): boolean {
    return this.isRecording;
  }
}
