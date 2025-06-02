import { DatePipe, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonButton, IonIcon, IonLabel, IonList, ToastController } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { Recording } from 'src/app/recording.model';
import { StorageService } from 'src/app/storage.service';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';

@Component({
  selector: 'app-recording-list',
  // =================================================== HTML =======================================================
  template: `
  <ion-list *ngIf="recording" class="space-y-2 bg-white shadow-md rounded-xl">
  <div class="hover:bg-gray-100 px-4 py-1 rounded-md transition-all duration-300">
    <div class="flex justify-between items-center mb-2">
      <ion-label class="flex-1">
        <h2 class="font-semibold text-gray-200 text-lg">{{ recording.name }}</h2>
        <p class="text-gray-500 text-sm">
          {{ recording.date | date: 'medium' }} | {{ formatTime(recording.duration || 0) }}
        </p>
      </ion-label>
      <ion-button slot="end" color="danger" size="default" (click)="deleteRecording()"
        class="rounded-full">
        <ion-icon name="trash" slot="icon-only"></ion-icon>
      </ion-button>
    </div>
    <div class="mt-2">
      <!-- <app-audio-player [recording]="recording"></app-audio-player> -->
    </div>
  </div>
</ion-list>
`,
// =================================================== CSS =======================================================
  styles: `
  ion-list {
    margin: 10px 0px;
  }
  ion-label h2 {
    font-size: 1.1rem;
  }
  ion-label p {
    font-size: 0.875rem;
  }
  `,
  standalone: true,
  imports: [IonLabel,IonList,IonButton,IonIcon,DatePipe,NgIf],
})
export class RecordingListComponent implements OnInit, OnDestroy {
  recording: Recording | void = undefined;
  private recordingsSubscription: Subscription | null = null;

  constructor(private storageService: StorageService, private toastController: ToastController) {}
  ngOnInit() {
    this.recordingsSubscription = this.storageService.recordings$.subscribe((records: Recording[]) => {
      console.log('Recordings updated:', records);
      this.recording = records[0]; // Take the first recording if available
    });
    this.storageService.loadRecords();

  }

  async deleteRecording() {
    if (this.recording) {
      await this.storageService.deleteRecord(this.recording);
      await this.showToast('Recording deleted successfully');
    }
  }

  formatTime(ms: number): string {
    if (isNaN(ms) || ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  ngOnDestroy() {
    if (this.recordingsSubscription) {
      this.recordingsSubscription.unsubscribe();
    }
  }
}
