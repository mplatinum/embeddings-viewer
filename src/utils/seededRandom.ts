// Seeded random number generator for deterministic algorithm results
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Mulberry32 - a simple, fast, high-quality PRNG
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// Generate a seed from the embeddings for deterministic initialization
export function generateSeed(embeddings: number[][]): number {
  let hash = 0x811C9DC5; // FNV-1a 32-bit offset basis

  for (let i = 0; i < embeddings.length; i++) {
    for (let j = 0; j < embeddings[i].length; j++) {
      // Convert each number to bytes and add to hash
      const value = embeddings[i][j];
      const bytes = new Float64Array([value]);
      const buffer = new Uint8Array(bytes.buffer);

      for (let k = 0; k < buffer.length; k++) {
        hash ^= buffer[k];
        hash = Math.imul(hash, 0x01000193); // FNV-1a prime
      }
    }
  }

  return hash >>> 0; // Ensure positive 32-bit integer
}

// Deterministic shuffle using seeded RNG
export function seededShuffle<T>(array: T[], rng: SeededRandom): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
