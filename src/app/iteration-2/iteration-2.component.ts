import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from "@angular/core";
import { IonButton, IonIcon, Platform, ToastController } from "@ionic/angular/standalone";
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SpectrogramService } from '../services/spectrogram.service';
import { Recording, TimerService, TimerState } from '../services/timer.service';
@Component({
  selector: 'app-iteration-2',
  templateUrl: './iteration-2.component.html',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
  ],
  styleUrls: ['./iteration-2.component.scss']
})
export class Iteration2Component implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];
  private destroy$ = new Subject<void>();
  private offscreenCanvas: HTMLCanvasElement;
  timerState!: TimerState;

  constructor(
    private timerService: TimerService,
    private spectrogramService: SpectrogramService,
    private platform: Platform,
    private toastController: ToastController
  ) {
    this.offscreenCanvas = document.createElement('canvas');
  }

  ngOnInit(): void {
    // Subscribe to timer state changes
    this.timerService.timerState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.timerState = state;
      });
    this.subscriptions.push(
      this.timerService.recordings$.subscribe(recordings => {
        console.log('Recordings updated:', recordings);
        if (recordings.length > 0) {
          const latestRecording = recordings[recordings.length - 1];
          this.generateSpectrogram(latestRecording);
        }
      })
    );
    this.testCanvas();
  }

  private async generateSpectrogram(recording: Recording): Promise<void> {
    if (!recording || !recording.base64SoundDownsampled) {
      console.error('Recording not found or missing downsampled audio:', recording.id);
      return;
    }

    try {
      const audioBuffer = await this.spectrogramService.decodeBase64Audio(recording.base64SoundDownsampled);
      const melSpectrogram = this.spectrogramService.computeMelSpectrogram(audioBuffer);
      this.spectrogramService.renderMelSpectrogram(melSpectrogram, this.offscreenCanvas);

      // Handle different platforms
      if (this.platform.is('hybrid')) {
        // Mobile: Save to device storage
        const imagePath = await this.spectrogramService.saveCanvasAsPng(this.offscreenCanvas, recording.id, this.platform);
        await this.showToast(`Spectrogram image saved to device storage`);
      } else {
        // Web: Download to user's downloads folder
        await this.spectrogramService.saveCanvasAsPng(this.offscreenCanvas, recording.id, this.platform);
        await this.showToast('Spectrogram image downloaded successfully');
      }
    } catch (error) {
      console.error('Error processing mel spectrogram:', error);
      this.showToast('Error processing mel spectrogram');
    }
  }

  private testCanvas(): void {
    const canvas = this.offscreenCanvas;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = 800;
      canvas.height = 320;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      console.log('Test spectrogram canvas rendered');
    } else {
      console.error('Error: Unable to initialize spectrogram canvas context');
    }
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  startTimer(): void {
    this.timerService.startTimer();
  }

  stopTimer(): void {
    this.timerService.stopTimer();
  }

  restartTimer(): void {
    this.timerService.restartTimer();
  }

  formatTime(ms: number): string {
    return this.timerService.formatTime(ms);
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}

