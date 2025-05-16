import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.css'],
  imports: [IonicModule],
})
export class AudioPlayerComponent implements OnInit, OnDestroy {
  @Input() filePath!: string;
  isPlaying = false;
  progress = 0;
  private audio: HTMLAudioElement;

  constructor() {
    this.audio = new Audio();
  }

  async ngOnInit() {
    const result = await Filesystem.readFile({
      path: this.filePath,
      directory: Directory.Data,
    });

    // Convert base64 to playable URL
    const mimeType = this.filePath.endsWith('.aac') ? 'audio/aac' : 'audio/webm'; // Adjust based on file extension
    this.audio.src = `data:${mimeType};base64,${result.data}`;
    this.audio.ontimeupdate = () => {
      this.progress = (this.audio.currentTime / this.audio.duration) * 100;
    };
  }

  togglePlay() {
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  seek(event: any) {
    const value = event.detail.value;
    this.audio.currentTime = (value / 100) * this.audio.duration;
  }

  ngOnDestroy() {
    this.audio.pause();
    this.audio.src = '';
  }
}
