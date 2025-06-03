import { NgIf } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { NativeAudio } from '@capacitor-community/native-audio';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { IonButton, IonIcon, IonSpinner, ToastController } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { Recording } from '../../recording.model';

@Component({
  selector: 'app-audio-player',

  template: `
  <div class="flex items-center audio-player-container">
  <ion-button fill="clear" (click)="togglePlay()" [disabled]="!recording || !audioAssetId || isLoading">
    <ion-icon slot="icon-only" [name]="isPlaying ? 'pause' : 'play'"></ion-icon>
  </ion-button>
  <ion-spinner *ngIf="isLoading" name="dots" color="primary"></ion-spinner>
  <div *ngIf="recording" class="ml-2 text-gray-600 text-sm time-display">
    {{ formatTime(recording.duration) }}
  </div>
</div>`,

  styles: `
  .audio-player-container {
    display: flex;
    align-items: center;
  }
  .time-display {
    font-size: 0.875rem;
  }
  `,

  standalone: true,
  imports: [NgIf, IonButton, IonIcon, IonSpinner],
})
export class AudioPlayerComponent implements OnChanges, OnDestroy {
  @Input() recording: Recording | void = undefined;
  isPlaying = false;
  isLoading = false;
  audioAssetId: string | null = null;
  isWebPlatform = Capacitor.getPlatform() === 'web';
  private playbackSubscription: Subscription | null = null;

  constructor(
    private toastController: ToastController,
    private audioPlaybackService: AudioPlaybackService
  ) { }

  ngOnInit() {
    this.playbackSubscription = this.audioPlaybackService.currentlyPlayingAssetId$.subscribe(
      (playingAssetId: string | null) => {
        if (playingAssetId !== this.audioAssetId && this.isPlaying) {
          console.log(`AudioPlayer (${this.audioAssetId}): Another asset (${playingAssetId}) started playing. Pausing this one.`);
          this.pausePlayback();
        }
      }
    );
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['recording'] && this.recording) {
      await this.loadAudio(this.recording.filePath);
    } else if (changes['recording'] && !this.recording) {
      await this.unloadAudio();
    }
  }

  async loadAudio(relativeFilePath: string) {
    if (this.isWebPlatform) {
      await this.showToast('Audio playback not supported on web', 'warning');
      return;
    }
    console.log('Loading audio:', relativeFilePath);
    await this.unloadAudio();
    if (!relativeFilePath) {
      console.warn('No file path provided.');
      await this.showToast('No audio file provided');
      return;
    }

    this.isLoading = true;
    const assetId = this.recording?.id || `recording_${new Date().getTime()}`;
    this.audioAssetId = assetId;

    let fullFilePath: string | null = null;

    try {
      const uriResult = await Filesystem.getUri({
        directory: Directory.Documents,
        path: relativeFilePath
      });
      fullFilePath = uriResult.uri;
      console.log(`AudioPlayer: Reconstructed full file path (URI): ${fullFilePath}`);

      try {
        const statResult = await Filesystem.stat({ path: relativeFilePath, directory: Directory.Documents });
        console.log(`AudioPlayer: File exists and stat successful. URI: ${statResult.uri}`);
      } catch (statError: any) {
        console.warn('AudioPlayer: Filesystem.stat failed for path:', relativeFilePath, statError.message || statError);
      }

    } catch (uriError: any) {
      console.error('AudioPlayer: Error getting full file URI:', uriError.message || uriError);
      await this.showToast('Failed to get file path for audio');
      this.audioAssetId = null;
      this.isLoading = false;
      return;
    }

    if (!fullFilePath) {
      console.error('AudioPlayer: Failed to reconstruct full file path.');
      await this.showToast('Failed to get file path for audio');
      this.audioAssetId = null;
      this.isLoading = false;
      return;
    }

    try {
      console.log(`AudioPlayer: Attempting NativeAudio.preload with assetId: ${assetId}, assetPath: ${fullFilePath}`);
      await NativeAudio.preload({
        assetId: assetId,
        assetPath: fullFilePath,
        audioChannelNum: 1,
        isUrl: true
      });

      console.log('AudioPlayer: NativeAudio.preload successful.');

    } catch (preloadError: any) {
      console.error('AudioPlayer: NativeAudio.preload error:', preloadError.message || preloadError);
      await this.showToast('Failed to load audio');
      this.audioAssetId = null;
    } finally {
      this.isLoading = false;
    }
  }

  async togglePlay() {
    if (this.isWebPlatform) {
      await this.showToast('Playback not supported on web', 'warning');
      return;
    }
    if (!this.audioAssetId) {
      await this.showToast('Audio not loaded');
      return;
    }

    try {
      if (this.isPlaying) {
        await this.pausePlayback();
      } else {
        await NativeAudio.play({ assetId: this.audioAssetId });
        this.isPlaying = true;
        console.log('Audio playing.');
        this.audioPlaybackService.setCurrentlyPlayingAsset(this.audioAssetId);
      }
    } catch (error: any) {
      console.error('Playback error:', error.message || error);
      await this.showToast('Error playing audio');
      this.isPlaying = false;
    }
  }

  async unloadAudio() {
    if (this.audioAssetId && this.audioPlaybackService.getCurrentlyPlayingAsset() === this.audioAssetId) {
      this.audioPlaybackService.setCurrentlyPlayingAsset(null);
    }

    if (this.audioAssetId) {
      try {
        await NativeAudio.unload({ assetId: this.audioAssetId });
        console.log('Audio unloaded.');
      } catch (error: any) {
        console.warn('Error unloading audio:', error.message || error);
        if (this.audioPlaybackService.getCurrentlyPlayingAsset() === this.audioAssetId) {
          this.audioPlaybackService.setCurrentlyPlayingAsset(null);
        }
      } finally {
        this.isPlaying = false;
        this.audioAssetId = null;
      }
    }
  }

  private async pausePlayback() {
    if (this.audioAssetId && this.isPlaying) {
      await NativeAudio.pause({ assetId: this.audioAssetId });
      this.isPlaying = false;
      console.log('Audio paused.');
      if (this.audioPlaybackService.getCurrentlyPlayingAsset() === this.audioAssetId) {
        this.audioPlaybackService.setCurrentlyPlayingAsset(null);
      }
    }
  }

  formatTime(ms: number): string {
    if (isNaN(ms) || ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private async showToast(message: string, color: string = 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  async ngOnDestroy() {
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
    }
    await this.unloadAudio();
  }
}
