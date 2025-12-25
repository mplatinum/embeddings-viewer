import type { Document, Point2D } from '../../types/embeddings';
import { SeededRandom, generateSeed } from '../seededRandom';

export interface TSNEOptions {
  perplexity?: number;
  learningRate?: number;
  iterations?: number;
  earlyExaggeration?: number;
  momentum?: number;
}

// t-SNE implementation for better semantic clustering
export const tSNE = (embeddings: number[][], documents: Document[], options?: TSNEOptions): Point2D[] => {
  const n = embeddings.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{
      x: 0,
      y: 0,
      title: documents[0]?.title || `Document 1`,
      text: documents[0]?.text || '',
      index: 0
    }];
  }

  const dim = embeddings[0].length;

  // 1. Compute pairwise Euclidean distances (optimized)
  const distances: number[][] = new Array(n);
  // Initialize all rows first
  for (let i = 0; i < n; i++) {
    distances[i] = new Array(n);
    distances[i][i] = 0;
  }

  // Compute distances
  for (let i = 0; i < n; i++) {
    const vecI = embeddings[i];
    for (let j = i + 1; j < n; j++) {
      const vecJ = embeddings[j];
      let sum = 0;
      for (let d = 0; d < dim; d++) {
        const diff = vecI[d] - vecJ[d];
        sum += diff * diff;
      }
      const dist = Math.sqrt(sum);
      distances[i][j] = dist;
      distances[j][i] = dist;
    }
  }

  // 2. Compute Gaussian kernel (similarity) with perplexity-based bandwidth
  // For small datasets, use much lower perplexity to preserve cluster structure
  // Lower perplexity = each point focuses on fewer neighbors = tighter clusters
  // For 100 points: perplexity of 5-10 works well for distinct clusters
  const perplexity = options?.perplexity ?? (n < 30 ? 5 : (n <= 100 ? 10 : Math.min(30, n - 1)));
  const targetEntropy = Math.log(perplexity);

  const similarities: number[][] = new Array(n);
  // Initialize all rows first
  for (let i = 0; i < n; i++) {
    similarities[i] = new Array(n);
    similarities[i][i] = 0;
  }

  for (let i = 0; i < n; i++) {
    // Binary search for optimal bandwidth (sigma) for each point
    let sigmaLow = 1e-10;
    let sigmaHigh = 1000;
    let sigma = 1.0;

    for (let iter = 0; iter < 50; iter++) {
      sigma = (sigmaLow + sigmaHigh) / 2;

      // Compute unnormalized similarities
      let sum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dist = distances[i][j];
        similarities[i][j] = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        sum += similarities[i][j];
      }

      // Compute Shannon entropy
      let entropy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const p = similarities[i][j] / sum;
        if (p > 1e-10) {
          entropy -= p * Math.log(p);
        }
      }

      if (entropy > targetEntropy) {
        sigmaHigh = sigma;
      } else {
        sigmaLow = sigma;
      }
    }

    // Normalize final similarities (joint probability)
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dist = distances[i][j];
      similarities[i][j] = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      sum += similarities[i][j];
    }

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      similarities[i][j] /= sum;
    }
  }

  // Symmetrize: P_ij = (p_{j|i} + p_{i|j}) / (2n)
  const P: number[][] = new Array(n);
  // Initialize all rows first
  for (let i = 0; i < n; i++) {
    P[i] = new Array(n);
    P[i][i] = 0;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = (similarities[i][j] + similarities[j][i]) / (2 * n);
      P[i][j] = p;
      P[j][i] = p;
    }
  }

  // 3. Initialize low-dimensional points (2D) with small random values
  // Use seeded RNG for deterministic results
  const seed = generateSeed(embeddings);
  const rng = new SeededRandom(seed);

  const Y: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Initialize with small Gaussian-like random values centered at 0
    // Standard t-SNE uses N(0, 1e-4) which gives values roughly in [-0.02, 0.02]
    Y[i] = [(rng.next() - 0.5) * 0.01, (rng.next() - 0.5) * 0.01];
  }

  // 4. Gradient descent optimization
  const momentum = options?.momentum ?? 0.8;
  // Higher learning rate for better separation on small datasets
  const eta = options?.learningRate ?? 500;
  const minGain = 0.01;

  const gains: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    gains[i] = [1.0, 1.0];
  }

  const YStep: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    YStep[i] = [0, 0];
  }

  // More iterations for small datasets to fully separate clusters
  const iterations = options?.iterations ?? (n < 200 ? 1500 : 1000);
  const earlyExaggeration = options?.earlyExaggeration ?? 4.0;

  for (let iter = 0; iter < iterations; iter++) {
    // Compute low-dimensional similarities (Student's t-distribution)
    const Q: number[][] = new Array(n);
    let sumQ = 0;

    // Initialize all rows first
    for (let i = 0; i < n; i++) {
      Q[i] = new Array(n);
      Q[i][i] = 0;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = Y[i][0] - Y[j][0];
        const dy = Y[i][1] - Y[j][1];
        const distSq = dx * dx + dy * dy;
        const q = 1.0 / (1.0 + distSq);
        Q[i][j] = q;
        Q[j][i] = q;
        sumQ += q;
      }
    }

    // Normalize Q
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        Q[i][j] /= sumQ;
        Q[j][i] = Q[i][j];
      }
    }

    // Compute gradient
    const gradient: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      gradient[i] = [0, 0];
    }

    // Longer early exaggeration phase for small datasets to form distinct clusters
    const exaggeration = (iter < (n < 200 ? 350 : 250)) ? earlyExaggeration : 1.0;
    const currentMomentum = (iter < 20) ? 0.5 : momentum;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;

        const mult = exaggeration * P[i][j] - Q[i][j];
        const dx = Y[i][0] - Y[j][0];
        const dy = Y[i][1] - Y[j][1];

        gradient[i][0] += mult * dx;
        gradient[i][1] += mult * dy;
      }
    }

    // Update positions
    for (let i = 0; i < n; i++) {
      // Update gains
      gains[i][0] = (Math.sign(gradient[i][0]) !== Math.sign(YStep[i][0])) ?
                   gains[i][0] + 0.2 : Math.max(gains[i][0] * 0.8, minGain);
      gains[i][1] = (Math.sign(gradient[i][1]) !== Math.sign(YStep[i][1])) ?
                   gains[i][1] + 0.2 : Math.max(gains[i][1] * 0.8, minGain);

      // Update step
      YStep[i][0] = currentMomentum * YStep[i][0] - eta * gains[i][0] * gradient[i][0];
      YStep[i][1] = currentMomentum * YStep[i][1] - eta * gains[i][1] * gradient[i][1];

      // Clamp step to prevent numerical instability
      const maxStep = 50;
      YStep[i][0] = Math.max(-maxStep, Math.min(maxStep, YStep[i][0]));
      YStep[i][1] = Math.max(-maxStep, Math.min(maxStep, YStep[i][1]));

      // Update position
      Y[i][0] += YStep[i][0];
      Y[i][1] += YStep[i][1];

      // Clamp position to prevent numerical overflow
      const maxPos = 1000;
      if (!isFinite(Y[i][0]) || !isFinite(Y[i][1]) || isNaN(Y[i][0]) || isNaN(Y[i][1])) {
        Y[i][0] = (Math.random() - 0.5) * 0.01;
        Y[i][1] = (Math.random() - 0.5) * 0.01;
      } else {
        Y[i][0] = Math.max(-maxPos, Math.min(maxPos, Y[i][0]));
        Y[i][1] = Math.max(-maxPos, Math.min(maxPos, Y[i][1]));
      }
    }

    // Center the embedding
    let meanX = 0, meanY = 0;
    for (let i = 0; i < n; i++) {
      meanX += Y[i][0];
      meanY += Y[i][1];
    }
    meanX /= n;
    meanY /= n;

    for (let i = 0; i < n; i++) {
      Y[i][0] -= meanX;
      Y[i][1] -= meanY;
    }
  }

  // 5. Return projected points
  const projected: Point2D[] = new Array(n);
  for (let i = 0; i < n; i++) {
    projected[i] = {
      x: Y[i][0],
      y: Y[i][1],
      title: documents[i]?.title || `Document ${i + 1}`,
      text: documents[i]?.text || '',
      index: i
    };
  }

  return projected;
};