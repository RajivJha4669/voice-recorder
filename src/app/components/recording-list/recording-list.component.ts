import { Component, OnInit } from '@angular/core';
import { Recording } from 'src/app/models/recording.model';
import { StorageService } from 'src/app/services/storage.service';
import { IonicModule } from '@ionic/angular';
import { AudioPlayerComponent } from "../audio-player/audio-player.component";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-recording-list',
  templateUrl: './recording-list.component.html',
  styleUrls: ['./recording-list.component.css'],
  imports: [CommonModule,
    IonicModule , AudioPlayerComponent],
})
export class RecordingListComponent implements OnInit {
  recordings: Recording[] = [];

  constructor(private storageService: StorageService) {}

  async ngOnInit() {
    this.recordings = await this.storageService.getRecordings();
  }

  async deleteRecording(id: string) {
    await this.storageService.deleteRecording(id);
    this.recordings = await this.storageService.getRecordings();
  }

}
