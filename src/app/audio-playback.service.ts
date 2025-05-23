import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AudioPlaybackService {
  // BehaviorSubject to hold the ID of the currently playing asset.
  // null means no asset is currently playing.
  private currentlyPlayingAssetIdSubject = new BehaviorSubject<string | null>(null);

  // Observable that components can subscribe to to know which asset is playing.
  currentlyPlayingAssetId$: Observable<string | null> = this.currentlyPlayingAssetIdSubject.asObservable();

  constructor() { }

  /**
   * Announces that a specific asset has started playing.
   * This will cause other components listening to stop their playback.
   * @param assetId The ID of the asset that started playing.
   */
  setCurrentlyPlayingAsset(assetId: string | null): void {
    this.currentlyPlayingAssetIdSubject.next(assetId);
  }

  /**
   * Gets the ID of the asset that is currently playing.
   * @returns The asset ID or null if nothing is playing.
   */
  getCurrentlyPlayingAsset(): string | null {
    return this.currentlyPlayingAssetIdSubject.value;
  }
}