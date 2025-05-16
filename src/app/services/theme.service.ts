import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly THEME_KEY = 'theme';
  private currentTheme: 'light' | 'dark' = 'light';

  constructor() {}

  async initialize() {
    // Load the saved theme preference
    const { value } = await Preferences.get({ key: this.THEME_KEY });
    if (value === 'dark') {
      this.setDarkMode(true);
    } else {
      this.setDarkMode(false);
    }

    // Also respect the system's color scheme preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!value) {
      this.setDarkMode(prefersDark);
    }
  }

  async toggleTheme() {
    const isDark = this.currentTheme === 'dark';
    await this.setDarkMode(!isDark);
  }

  async setDarkMode(isDark: boolean) {
    this.currentTheme = isDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('ion-palette-dark', isDark);
    await Preferences.set({ key: this.THEME_KEY, value: this.currentTheme });
  }

  getCurrentTheme(): 'light' | 'dark' {
    return this.currentTheme;
  }
}
