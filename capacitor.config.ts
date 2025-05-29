import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ionic.starter',
  appName: 'voice-recorder',
  webDir: 'www',
  plugins: {
    Microphone: {},
    LocalNotifications: {}
  }
};

export default config;
