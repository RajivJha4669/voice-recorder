import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import { RecordingControlsComponent } from './recording-controls/recording-controls.component';
import { RecordingListComponent } from './recording-list/recording-list.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent,RecordingControlsComponent,RecordingListComponent],
  standalone: true,
})
export class HomePage {
  constructor() {}
}
