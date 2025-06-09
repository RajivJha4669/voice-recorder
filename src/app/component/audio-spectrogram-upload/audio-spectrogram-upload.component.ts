import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, ToastController, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonSpinner, IonContent } from '@ionic/angular/standalone';
import { SpectrogramService } from 'src/app/services/spectrogram.service';
import { IonLabel, Platform } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-audio-spectrogram-upload',
  templateUrl: './audio-spectrogram-upload.component.html',
  styleUrls: ['./audio-spectrogram-upload.component.scss'],
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonCard,IonContent,IonCardHeader, IonCardTitle, IonCardContent, IonSpinner,RouterLink],
})
export class AudioSpectrogramUploadComponent {
  private offscreenCanvas: HTMLCanvasElement;
  selectedFile: File | null = null;
  isProcessing = false;

  constructor(
    private spectrogramService: SpectrogramService,
    private platform: Platform,
    private toastController: ToastController
  ) {
    this.offscreenCanvas = document.createElement('canvas');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  async processFile(): Promise<void> {
    if (!this.selectedFile) {
      this.showToast('Please select a WAV file first.');
      return;
    }
    this.isProcessing = true;
    try {
      const base64 = await this.readFileAsBase64(this.selectedFile);
      const audioBuffer = await this.spectrogramService.decodeBase64Audio(base64);
      const melSpectrogram = this.spectrogramService.computeMelSpectrogram(audioBuffer);
      this.spectrogramService.renderMelSpectrogram(melSpectrogram, this.offscreenCanvas);
      await this.spectrogramService.saveCanvasAsPng(
        this.offscreenCanvas,
        this.selectedFile.name.replace(/\.[^/.]+$/, ''),
        this.platform
      );
      await this.spectrogramService.saveMelSpectrogramAsTxt(
        melSpectrogram,
        this.selectedFile.name.replace(/\.[^/.]+$/, ''),
        this.platform
      );
      this.showToast('Spectrogram image and mel spectrogram txt downloaded successfully');
    } catch (error) {
      console.error('Error processing spectrogram:', error);
      this.showToast('Error processing spectrogram');
    } finally {
      this.isProcessing = false;
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove data URL prefix if present
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
