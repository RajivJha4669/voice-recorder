import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { StorageService } from 'src/app/storage.service';
import { Recording } from 'src/app/recording.model';
import { IonContent, IonList, IonItem, IonLabel, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-recordings-list',
  templateUrl: './recordings-list.component.html',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonLabel, IonButton, IonIcon, CommonModule, DatePipe]
})
export class RecordingsListComponent implements OnInit {
  recordings$: Observable<Recording[]>;

  constructor(private storageService: StorageService) {
    this.recordings$ = this.storageService.recordings$;
  }

  ngOnInit() {
    this.storageService.loadRecords();
  }

  deleteRecording(recording: Recording) {
    this.storageService.deleteRecord(recording);
  }

  formatTime(ms: number): string {
    if (isNaN(ms)) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
