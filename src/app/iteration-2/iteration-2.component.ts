import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from "@angular/core";
import { IonButton, IonIcon } from "@ionic/angular/standalone";
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TimerService, TimerState } from '../services/timer.service';

@Component({
    selector: 'app-iteration-2',
    templateUrl: './iteration-2.component.html',
    standalone: true,
    imports: [
        CommonModule,
        IonButton,
        IonIcon,
    ],
    styleUrls: ['./iteration-2.component.scss']
})
export class Iteration2Component implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();
    timerState!: TimerState;

    constructor(private timerService: TimerService) {}

    ngOnInit(): void {
        // Subscribe to timer state changes
        this.timerService.timerState$
            .pipe(takeUntil(this.destroy$))
            .subscribe(state => {
                this.timerState = state;
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    startTimer(): void {
        this.timerService.startTimer();
    }

    stopTimer(): void {
        this.timerService.stopTimer();
    }

    restartTimer(): void {
        this.timerService.restartTimer();
    }

    formatTime(ms: number): string {
        return this.timerService.formatTime(ms);
    }
}

