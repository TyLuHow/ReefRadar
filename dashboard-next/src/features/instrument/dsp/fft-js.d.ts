/**
 * Types for the part of fft.js 4.0.4 that the STFT uses. The package ships declarations in which
 * every parameter is `any`; this ambient module narrows them to what the code relies on.
 * realTransform fills the first size / 2 + 1 complex bins (interleaved re, im) of `out`;
 * completeSpectrum mirrors the rest.
 */
declare module 'fft.js' {
  class FFT {
    constructor(size: number);
    readonly size: number;
    createComplexArray(): number[];
    realTransform(out: number[], input: ArrayLike<number>): void;
    completeSpectrum(out: number[]): void;
  }
  export = FFT;
}
