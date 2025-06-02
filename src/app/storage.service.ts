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
  private _storage: Storage | null = null;
  private recordingsSubject = new BehaviorSubject<Recording[]>([]);
  recordings$ = this.recordingsSubject.asObservable();
  private isInitializing = false;

  constructor(private storage: Storage, private toastController: ToastController) {
    this.init();
  }

  async init() {
    if (this._storage || this.isInitializing) return;
    this.isInitializing = true;
    this._storage = await this.storage.create();
    this.isInitializing = false;
    await this.loadRecords();
  }

  async loadRecords(): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    console.log('Loading recordings from storage...');
    const records = (await this._storage?.get(RECORDINGS_KEY)) || [];
    this.recordingsSubject.next(records);
    console.log('Recordings loaded:', records);
  }

  getRecords(): Recording[] {
    return this.recordingsSubject.value || [];
  }

  async addRecords(newRecords: Recording[]): Promise<void> {
    if (!this._storage) {
      await this.init();
    }

    // Delete previous recording files
    const currentRecords = this.recordingsSubject.value;
    for (const record of currentRecords) {
      if (record?.filePath) {
        try {
          await Filesystem.deleteFile({
            path: record.filePath,
            directory: Directory.Documents,
          });
          console.log('Deleted previous file:', record.filePath);
        } catch (error) {
          console.warn('Error deleting previous file:', error);
        }
      }
    }

    // Add new recordings (original and downsampled)
    await this._storage?.set(RECORDINGS_KEY, newRecords);
    this.recordingsSubject.next(newRecords);
    console.log('Added new recordings:', newRecords);
  }

  async deleteRecord(recordToDelete: Recording): Promise<void> {
    if (!this._storage) {
      await this.init();
    }

    // Delete the audio file
    try {
      await Filesystem.deleteFile({
        path: recordToDelete.filePath,
        directory: Directory.Documents,
      });
      console.log('Deleted file:', recordToDelete.filePath);
    } catch (error) {
      console.warn('Error deleting file:', error);
    }

    // Remove the record from the array
    const currentRecords = this.recordingsSubject.value;
    const updatedRecords = currentRecords.filter(record => record.id !== recordToDelete.id);
    await this._storage?.set(RECORDINGS_KEY, updatedRecords);
    this.recordingsSubject.next(updatedRecords);
  }

  async clearRecords(): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    console.log('Clearing recordings...');
    const records = this.recordingsSubject.value;

    for (const record of records) {
      if (record?.filePath) {
        try {
          await Filesystem.deleteFile({
            path: record.filePath,
            directory: Directory.Documents,
          });
          console.log('Deleted file:', record.filePath);
        } catch (error) {
          console.warn('Error deleting file:', error);
        }
      }
    }

    await this._storage?.set(RECORDINGS_KEY, []);
    this.recordingsSubject.next([]);
    console.log('Recordings cleared');
  }

  async updateRecord(updatedRecord: Recording): Promise<void> {
    if (!this._storage) {
      await this.init();
    }
    const currentRecords = this.recordingsSubject.value;
    const updatedRecords = currentRecords.map(record =>
      record.id === updatedRecord.id ? updatedRecord : record
    );
    await this._storage?.set(RECORDINGS_KEY, updatedRecords);
    this.recordingsSubject.next(updatedRecords);
  }

  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({ message, duration: 2000, color, position: 'bottom' });
    await toast.present();
  }
}
