import { Injectable, OnDestroy } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { RecordingData, VoiceRecorder } from 'capacitor-voice-recorder';
import { BehaviorSubject, Subject, Subscription, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AudioUtilsService } from './audio-utils.service';
import { DownsampleService } from './downsample.service';

export interface Recording {
    id: string;
    filepath: string;
    filepathDownsampled: string;
    base64Sound: string;
    base64SoundDownsampled: string;
    mimeType: string;
    timestamp: number;
}

export interface TimerState {
    currentTime: number;
    isRunning: boolean;
    isPaused: boolean;
    startCount: number;
    isRecording: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class TimerService implements OnDestroy {
    private readonly TIMER_INTERVAL = 4000; // 4 seconds
    private destroy$ = new Subject<void>();
    private pauseSubject = new Subject<void>();
    private timerSubscription?: Subscription;
    private isWeb: boolean;

    private recordings: Recording[] = [];
    private recordingsSubject = new BehaviorSubject<Recording[]>([]);
    public recordings$ = this.recordingsSubject.asObservable();

    private timerState = new BehaviorSubject<TimerState>({
        currentTime: 0,
        isRunning: false,
        isPaused: false,
        startCount: 0,
        isRecording: false
    });

    // Public observable for components to subscribe to
    public timerState$ = this.timerState.asObservable();

    constructor(
        private platform: Platform,
        private downsampleService: DownsampleService,
        private audioUtils: AudioUtilsService
    ) {
        this.isWeb = !this.platform.is('hybrid');
        this.initializeRecorder();
    }

    private async initializeRecorder(): Promise<void> {
        try {
            const permissionStatus = await VoiceRecorder.hasAudioRecordingPermission();
            if (!permissionStatus.value) {
                const permission = await VoiceRecorder.requestAudioRecordingPermission();
                if (!permission.value) {
                    console.error('Permission denied for voice recording');
                }
            }
        } catch (error) {
            console.error('Error initializing voice recorder:', error);
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.pauseSubject.complete();
        this.stopTimer();
    }

    async startTimer(): Promise<void> {
        if (this.timerState.value.isRunning) return;

        try {
            // Start recording
            await VoiceRecorder.startRecording();

            this.updateState({
                currentTime: 0,
                isRunning: true,
                isPaused: false,
                startCount: this.timerState.value.startCount + 1,
                isRecording: true
            });

            this.timerSubscription = interval(1000)
                .pipe(
                    takeUntil(this.destroy$),
                    takeUntil(this.pauseSubject)
                )
                .subscribe(() => {
                    const newTime = this.timerState.value.currentTime + 1000;
                    this.updateState({ currentTime: newTime });

                    if (newTime >= this.TIMER_INTERVAL) {
                        this.resetAndRestart();
                    }
                });
        } catch (error) {
            console.error('Error starting recording:', error);
            this.stopTimer();
        }
    }

    private async saveRecording(recordingData: RecordingData): Promise<void> {
        try {
            const timestamp = new Date().getTime();
            const fileName = `Device_${timestamp}_original.wav`;
            const fileNameDownsampled = `Device_${timestamp}_16khz.wav`;

            if (!recordingData.value.recordDataBase64) {
                throw new Error('No recording data available');
            }

            // Convert original audio to WAV format
            const originalBase64 = await this.audioUtils.convertToWav(
                recordingData.value.recordDataBase64
            );

            // Downsample the audio
            const downsampledBase64 = await this.downsampleService.downsampleAudio(
                originalBase64,
                'audio/wav'
            );

            // Save original to filesystem
            const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: originalBase64,
                directory: this.isWeb ? Directory.Data : Directory.Documents
            });

            // Save downsampled version to filesystem
            const savedDownsampledFile = await Filesystem.writeFile({
                path: fileNameDownsampled,
                data: downsampledBase64,
                directory: this.isWeb ? Directory.Data : Directory.Documents
            });

            // Add to memory array
            const newRecording: Recording = {
                id: timestamp.toString(),
                filepath: fileName,
                filepathDownsampled: fileNameDownsampled,
                base64Sound: originalBase64,
                base64SoundDownsampled: downsampledBase64,
                mimeType: 'audio/wav',
                timestamp: timestamp
            };

            this.recordings.push(newRecording);
            this.recordingsSubject.next([...this.recordings]);

            if (this.isWeb) {
                console.log('Recordings saved in browser storage. Access through Application tab in DevTools -> IndexedDB -> Filesystem');
            } else {
                console.log('Original recording saved in device documents folder:', savedFile.uri);
                console.log('Downsampled recording saved in device documents folder:', savedDownsampledFile.uri);
            }
        } catch (error) {
            console.error('Error saving recording:', error);
            throw error;
        }
    }

    private async resetAndRestart(): Promise<void> {
        try {
            // Stop current recording and save it
            const recording = await VoiceRecorder.stopRecording();

            await this.saveRecording(recording);

            this.destroy$.next();

            // Start new recording
            await VoiceRecorder.startRecording();

            // Reset timer and increment count
            this.updateState({
                currentTime: 0,
                isRunning: true,
                isPaused: false,
                startCount: this.timerState.value.startCount + 1,
                isRecording: true
            });
        } catch (error) {
            console.error('Error during reset and restart:', error);
            this.stopTimer();
        }
    }

    async stopTimer(): Promise<void> {
        try {
            if (this.timerState.value.isRecording) {
                const recording = await VoiceRecorder.stopRecording();
                await this.saveRecording(recording);
            }
        } catch (error) {
            console.error('Error stopping recording:', error);
        } finally {
            this.timerSubscription?.unsubscribe();
            this.updateState({
                currentTime: 0,
                isRunning: false,
                isPaused: false,
                isRecording: false
            });
        }
    }

    pauseTimer(): void {
        this.timerSubscription?.unsubscribe();
        this.pauseSubject.next();
        this.updateState({ isPaused: true });
    }

    restartTimer(): void {
        this.stopTimer();
        this.startTimer();
    }

    private updateState(newState: Partial<TimerState>): void {
        this.timerState.next({
            ...this.timerState.value,
            ...newState
        });
    }

    formatTime(ms: number): string {
        if (isNaN(ms)) return '00:00';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const remainingSeconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Get all recordings
    getRecordings(): Recording[] {
        return this.recordings;
    }

    // Delete a recording
    async deleteRecording(recordingId: string): Promise<void> {
        try {
            const recording = this.recordings.find(r => r.id === recordingId);
            if (recording) {
                // Delete original from filesystem
                await Filesystem.deleteFile({
                    path: recording.filepath,
                    directory: this.isWeb ? Directory.Data : Directory.Documents
                });

                // Delete downsampled version from filesystem
                await Filesystem.deleteFile({
                    path: recording.filepathDownsampled,
                    directory: this.isWeb ? Directory.Data : Directory.Documents
                });

                // Remove from memory array
                this.recordings = this.recordings.filter(r => r.id !== recordingId);
                this.recordingsSubject.next([...this.recordings]);
            }
        } catch (error) {
            console.error('Error deleting recording:', error);
        }
    }

    // Add method to get storage location
    async getStorageLocation(): Promise<string> {
        try {
            if (this.isWeb) {
                return 'Recordings are stored in browser IndexedDB. Open DevTools -> Application -> IndexedDB -> Filesystem';
            } else {
                const uri = await Filesystem.getUri({
                    directory: Directory.Documents,
                    path: ''
                });
                return `Recordings are stored in: ${uri.uri}`;
            }
        } catch (error) {
            console.error('Error getting storage location:', error);
            return 'Unable to determine storage location';
        }
    }
}
