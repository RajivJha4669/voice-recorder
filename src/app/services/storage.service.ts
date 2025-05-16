import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Recording } from '../models/recording.model';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private readonly RECORDINGS_KEY = 'recordings';

  async getRecordings(): Promise<Recording[]> {
    const { value } = await Preferences.get({ key: this.RECORDINGS_KEY });
    return value ? JSON.parse(value) : [];
  }

  async saveRecording(recording: Recording): Promise<void> {
    const recordings = await this.getRecordings();
    recordings.push(recording);
    await Preferences.set({
      key: this.RECORDINGS_KEY,
      value: JSON.stringify(recordings),
    });
  }

  async deleteRecording(id: string): Promise<void> {
    const recordings = await this.getRecordings();
    const filtered = recordings.filter((r) => r.id !== id);
    await Preferences.set({
      key: this.RECORDINGS_KEY,
      value: JSON.stringify(filtered),
    });
  }

  // Optional: Add migration logic
  async migrateData() {
    await Preferences.migrate();
    await Preferences.removeOld();
  }
}
