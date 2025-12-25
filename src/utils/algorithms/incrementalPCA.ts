import type { Document, Point2D } from '../../types/embeddings';

export interface PCAOptions {
  powerIterations?: number;
}

// Incremental PCA for very large datasets (memory efficient)
// Uses power iteration method which is more robust for normalized embeddings
export const incrementalPCA = (embeddings: number[][], documents: Document[], options?: PCAOptions): Point2D[] => {
  const n = embeddings.length;
  const dim = embeddings[0].length;

  console.log(`Running incremental PCA for ${n}×${dim} data`);

  // Initialize components with deterministic vectors
  const pc1 = new Float64Array(dim);
  const pc2 = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    const pattern = [1, 0, -1, 0];
    pc1[i] = pattern[i % pattern.length];
    pc2[i] = pattern[(i + 1) % pattern.length];
  }

  // Normalize initial components
  let norm1 = 0, norm2 = 0;
  for (let i = 0; i < dim; i++) {
    norm1 += pc1[i] * pc1[i];
    norm2 += pc2[i] * pc2[i];
  }
  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);
  const invNorm1 = 1 / norm1;
  const invNorm2 = 1 / norm2;
  for (let i = 0; i < dim; i++) {
    pc1[i] *= invNorm1;
    pc2[i] *= invNorm2;
  }

  // === PASS 1: Compute the final mean ===
  const mean = new Float64Array(dim);
  for (let i = 0; i < n; i++) {
    const vec = embeddings[i];
    for (let j = 0; j < dim; j++) {
      mean[j] += vec[j];
    }
  }
  for (let j = 0; j < dim; j++) {
    mean[j] /= n;
  }

  const meanMagnitude = Math.sqrt(mean.reduce((sum, val) => sum + val * val, 0));
  console.log(`Pass 1: Mean computed (magnitude = ${meanMagnitude.toFixed(4)})`);

  // === PASS 2: Center all data (need this for multiple iterations) ===
  const centeredData: Float64Array[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const vec = embeddings[i];
    const centered = new Float64Array(dim);
    for (let j = 0; j < dim; j++) {
      centered[j] = vec[j] - mean[j];
    }
    centeredData[i] = centered;
  }

  // === PASS 3: Power iteration to find principal components ===
  // Uses covariance-free power iteration: C * w = sum_i (x_i * (x_i^T * w))
  // This avoids explicitly computing the covariance matrix
  const numIterations = options?.powerIterations ?? 20;
  console.log(`Pass 3: Running ${numIterations} power iteration rounds...`);

  for (let iter = 0; iter < numIterations; iter++) {
    // Compute C * pc1
    const Cpc1 = new Float64Array(dim);
    for (let i = 0; i < n; i++) {
      const centered = centeredData[i];
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += centered[j] * pc1[j];
      }
      // Cpc1 += centered * dot
      for (let j = 0; j < dim; j++) {
        Cpc1[j] += centered[j] * dot;
      }
    }
    // Normalize to get new pc1
    norm1 = 0;
    for (let j = 0; j < dim; j++) {
      norm1 += Cpc1[j] * Cpc1[j];
    }
    norm1 = Math.sqrt(norm1);
    const invNorm1Current = 1 / norm1;
    for (let j = 0; j < dim; j++) {
      pc1[j] = Cpc1[j] * invNorm1Current;
    }

    // Compute C * pc2, then orthogonalize against pc1
    const Cpc2 = new Float64Array(dim);
    for (let i = 0; i < n; i++) {
      const centered = centeredData[i];
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += centered[j] * pc2[j];
      }
      for (let j = 0; j < dim; j++) {
        Cpc2[j] += centered[j] * dot;
      }
    }
    // Orthogonalize against pc1 (Gram-Schmidt)
    let dot12 = 0;
    for (let j = 0; j < dim; j++) {
      dot12 += pc1[j] * Cpc2[j];
    }
    for (let j = 0; j < dim; j++) {
      Cpc2[j] -= dot12 * pc1[j];
    }
    // Normalize
    norm2 = 0;
    for (let j = 0; j < dim; j++) {
      norm2 += Cpc2[j] * Cpc2[j];
    }
    norm2 = Math.sqrt(norm2);
    const invNorm2Current = 1 / norm2;
    for (let j = 0; j < dim; j++) {
      pc2[j] = Cpc2[j] * invNorm2Current;
    }

    // Log progress periodically
    if (iter % 5 === 0 || iter === numIterations - 1) {
      console.log(`  Iteration ${iter + 1}/${numIterations} completed`);
    }
  }

  // === PASS 4: Project all points using final components ===
  const projected = new Array(n);
  for (let i = 0; i < n; i++) {
    const centered = centeredData[i];
    let x = 0;
    let y = 0;
    for (let j = 0; j < dim; j++) {
      x += centered[j] * pc1[j];
      y += centered[j] * pc2[j];
    }

    projected[i] = {
      x,
      y,
      title: documents[i]?.title || `Document ${i + 1}`,
      text: documents[i]?.text || '',
      index: i
    };
  }

  console.log(`Incremental PCA completed.`);

  return projected;
};