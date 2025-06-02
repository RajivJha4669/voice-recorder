declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    createComplexArray(): number[];
    toComplexArray(input: number[]): number[];
    fromComplexArray(complex: number[], output: number[]): void;
    realTransform(output: number[], input: number[]): void;
    inverseRealTransform(output: number[], input: number[]): void;
    completeSpectrum(spectrum: number[]): void;
    transform(output: number[], input: number[]): void;
    inverseTransform(output: number[], input: number[]): void;
  }
}
