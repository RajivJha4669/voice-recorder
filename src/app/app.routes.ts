import { Routes } from '@angular/router';
import { AudioSpectrogramUploadComponent } from './component/audio-spectrogram-upload/audio-spectrogram-upload.component';
// import { AudioDownSampleComponent } from './component/audio-down-sample/audio-down-sample.component';
import { Iteration2Component } from './iteration-2/iteration-2.component';
// import { MelSpectrogramComponent } from './spectrogrma/spectrogram.component';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  }
  ,
  {
    path: '',
    redirectTo: 'iteration-2',
    pathMatch: 'full',
  },

  {
    path: 'iteration-2',
    component: Iteration2Component,
  },
  // {
  //   path: 'down-sample',
  //   component: AudioDownSampleComponent,
  // },
  {
    path: 'audio-spectrogram-upload',
    component: AudioSpectrogramUploadComponent,
  },
];
