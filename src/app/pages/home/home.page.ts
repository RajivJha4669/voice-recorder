import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RecordingControlsComponent } from 'src/app/components/recording-controls/recording-controls.component';
import { RecordingListComponent } from 'src/app/components/recording-list/recording-list.component';
import { ThemeService } from 'src/app/services/theme.service';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, RecordingControlsComponent, RecordingListComponent],
})
export class HomePage implements OnInit {
  currentTheme: 'light' | 'dark' = 'light';

  constructor(private themeService: ThemeService) { }

  ngOnInit() {
    this.currentTheme = this.themeService.getCurrentTheme();
    // Listen for theme changes
    document.documentElement.addEventListener('classListChange', () => {
      this.currentTheme = this.themeService.getCurrentTheme();
    });
  }

  async toggleTheme() {
    await this.themeService.toggleTheme();
    this.currentTheme = this.themeService.getCurrentTheme();
  }
}