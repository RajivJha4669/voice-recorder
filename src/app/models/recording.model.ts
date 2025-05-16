export interface Recording {
  id: string;
  name: string;
  filePath: string;
  date: string; // ISO string format (e.g., "2025-05-15T07:46:00.000Z")
  duration: number; // Duration in milliseconds
}
