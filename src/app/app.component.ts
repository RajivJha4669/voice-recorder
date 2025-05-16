import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { StorageService } from './services/storage.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(
    private themeService: ThemeService,
    private storageService: StorageService
  ) {}

  async ngOnInit() {
    await this.themeService.initialize();
    await this.storageService.migrateData();
  }
}
