export interface Recording {
  id: string;
  name: string;
  filePath: string;
  date: string;
  duration: number;
  type?: 'original' | '16kHz';
}
