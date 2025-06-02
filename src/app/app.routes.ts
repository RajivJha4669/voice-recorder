import { Routes } from '@angular/router';
import { MelSpectrogramComponent } from './spectrogrma/spectrogram.component';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  }
  ,
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'record',
    component: MelSpectrogramComponent,
  },

];
