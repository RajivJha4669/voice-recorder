import { Injectable } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { ToastController } from '@ionic/angular/standalone';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject } from 'rxjs';
import { Recording } from './recording.model';

const RECORDINGS_KEY = 'my_recordings';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  // ================================================
  private _storage: Storage | null = null;
  private recordingsSubject = new BehaviorSubject<Recording | void>(undefined);
  recordings$ = this.recordingsSubject.asObservable();
  private isInitializing = false;

  // ================================================
  constructor(private storage: Storage, private toastController: ToastController) {
    this.init();
  }

  // ================================================
  async init() {
    if (this._storage || this.isInitializing) return;
    this.isInitializing = true;
    this._storage = await this.storage.create();
    this.isInitializing = false;
    await this.loadRecords();
  }

  // ================================================
  async loadRecords(): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    console.log('Loading recording from storage...');
    const record = await this._storage?.get(RECORDINGS_KEY);
    this.recordingsSubject.next(record);
    console.log('Recording loaded:', record);
  }

  // ================================================
  getRecords(): Recording | void {
    return this.recordingsSubject.value;
  }

  // ================================================
  async addRecord(record: Recording): Promise<void> {
    if (!this._storage) {
      await this.init();
    }

    // Delete previous recording file if it exists
    const currentRecord = this.recordingsSubject.value;
    if (currentRecord?.filePath) {
      try {
        await Filesystem.deleteFile({
          path: currentRecord.filePath,
          directory: Directory.Documents
        });
        console.log('Deleted previous file:', currentRecord.filePath);
      } catch (error) {
        console.warn('Error deleting previous file:', error);
      }
    }

    await this._storage?.set(RECORDINGS_KEY, record);
    this.recordingsSubject.next(record);
  }

  // ================================================
  async deleteRecord(recordToDelete: Recording): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    
    // Delete the audio file
    try {
      await Filesystem.deleteFile({
        path: recordToDelete.filePath,
        directory: Directory.Documents
      });
      console.log('Deleted file:', recordToDelete.filePath);
    } catch (error) {
      console.warn('Error deleting file:', error);
    }

    await this._storage?.set(RECORDINGS_KEY, undefined);
    this.recordingsSubject.next(undefined);
  }

  // ================================================
  async clearRecords(): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    console.log('Clearing recording...');
    const record = this.recordingsSubject.value;
    
    if (record?.filePath) {
      try {
        await Filesystem.deleteFile({
          path: record.filePath,
          directory: Directory.Documents
        });
        console.log('Deleted file:', record.filePath);
      } catch (error) {
        console.warn('Error deleting file:', error);
      }
    }

    await this._storage?.set(RECORDINGS_KEY, undefined);
    this.recordingsSubject.next(undefined);
    console.log('Recording cleared');
  }

  // ================================================
  async updateRecord(record: Recording): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    await this._storage?.set(RECORDINGS_KEY, record);
    this.recordingsSubject.next(record);
  }

  // ================================================
  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({ message, duration: 2000, color, position: 'bottom' });
    await toast.present();
  }
}
