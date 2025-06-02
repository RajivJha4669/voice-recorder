import { Routes } from '@angular/router';
import { MelSpectrogramComponent } from './spectrogrma/spectrogram.component';
import { AudioDownSampleComponent } from './component/audio-down-sample/audio-down-sample.component';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  }
  ,
  {
    path: '',
    redirectTo: 'down-sample',
    pathMatch: 'full',
  },
  {
    path: 'record',
    component: MelSpectrogramComponent,
  },
  {
    path: 'down-sample',
    component: AudioDownSampleComponent,
  },

];
