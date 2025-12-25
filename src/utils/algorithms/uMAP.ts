import type { Document, Point2D } from '../../types/embeddings';
import { SeededRandom, generateSeed, seededShuffle } from '../seededRandom';

export interface UMAPOptions {
  nNeighbors?: number;
  nEpochs?: number;
  learningRate?: number;
  negativeSampleRate?: number;
}

// Simplified UMAP implementation for semantic clustering
// Based on the UMAP algorithm but simplified for 2D projection
export const uMAP = (embeddings: number[][], documents: Document[], options?: UMAPOptions): Point2D[] => {
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

  // Initialize seeded RNG for deterministic results
  const seed = generateSeed(embeddings);
  const rng = new SeededRandom(seed);

  // UMAP hyperparameters
  // For tighter clusters, use lower n_neighbors that scales with dataset size
  // Small datasets (<100): use sqrt(n) for local focus
  // Medium datasets (100-1000): cap at 10-12 for tighter clusters
  // Large datasets (>1000): use higher values but keep relatively low
  const nNeighbors = options?.nNeighbors ?? (
    n < 50
      ? Math.max(3, Math.min(8, Math.floor(Math.sqrt(n))))
      : n < 200
      ? Math.floor(10 + Math.sqrt(n - 100) / 3)
      : Math.min(15, Math.floor(n / 50))
  );
  const nEpochs = options?.nEpochs ?? (n < 1000 ? 500 : 200);
  const learningRate = options?.learningRate ?? 1.0;
  const negativeSampleRate = options?.negativeSampleRate ?? 5;

  console.log(`Running UMAP with n_neighbors=${nNeighbors}, epochs=${nEpochs}`);

  // Step 1: Compute pairwise distances
  console.log('Computing pairwise distances...');
  const distances: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    distances[i] = new Array(n);
    distances[i][i] = 0;
  }

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

  // Step 2: Find k nearest neighbors for each point
  console.log(`Finding ${nNeighbors} nearest neighbors for each point...`);
  const knnIndices: number[][] = new Array(n);
  const knnDistances: number[][] = new Array(n);

  for (let i = 0; i < n; i++) {
    // Get neighbors with their distances
    const neighbors: { idx: number; dist: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        neighbors.push({ idx: j, dist: distances[i][j] });
      }
    }
    // Sort by distance and take k nearest
    neighbors.sort((a, b) => a.dist - b.dist);
    const k = Math.min(nNeighbors, neighbors.length);
    knnIndices[i] = neighbors.slice(0, k).map(n => n.idx);
    knnDistances[i] = neighbors.slice(0, k).map(n => n.dist);
  }

  // Step 3: Compute fuzzy simplicial set
  // For each point, find sigma such that sum of exp(-dist/sigma) = log(nNeighbors)
  console.log('Building fuzzy simplicial set...');
  const targetSum = Math.log2(nNeighbors);
  const sigmas = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    let sigmaLow = 1e-10;
    let sigmaHigh = 1000;
    const neighbors = knnIndices[i];
    const neighborDists = knnDistances[i];

    for (let iter = 0; iter < 50; iter++) {
      const sigma = (sigmaLow + sigmaHigh) / 2;
      let sum = 0;
      for (let j = 0; j < neighbors.length; j++) {
        sum += Math.exp(-neighborDists[j] / sigma);
      }

      if (sum > targetSum) {
        sigmaHigh = sigma;
      } else {
        sigmaLow = sigma;
      }
    }

    sigmas[i] = (sigmaLow + sigmaHigh) / 2;
  }

  // Compute fuzzy set membership (symmetrized)
  const graph = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const neighbors = knnIndices[i];
    const neighborDists = knnDistances[i];
    for (let j = 0; j < neighbors.length; j++) {
      const nj = neighbors[j];
      // P(i|j) = exp(-dist(i,j) / sigma_i)
      const pGivenJ = Math.exp(-neighborDists[j] / sigmas[i]);
      // Symmetrize: P_ij = P(i|j) + P(j|i) - P(i|j)*P(j|i)
      const key = i < nj ? `${i}-${nj}` : `${nj}-${i}`;
      const existing = graph.get(key) || 0;
      graph.set(key, existing + pGivenJ - existing * pGivenJ);
    }
  }

  // Convert graph to arrays for faster access
  const edges: { source: number; target: number; weight: number }[] = [];
  const entries = Array.from(graph.entries());
  for (const [key, weight] of entries) {
    const [source, target] = key.split('-').map(Number);
    if (weight > 0) {
      edges.push({ source, target, weight });
    }
  }
  console.log(`Built graph with ${edges.length} edges`);

  // Step 4: Initialize low-dimensional embedding with seeded RNG
  const Y = new Array(n);
  for (let i = 0; i < n; i++) {
    Y[i] = [(rng.next() - 0.5) * 0.01, (rng.next() - 0.5) * 0.01];
  }

  // Step 5: Optimize embedding using stochastic gradient descent
  console.log('Optimizing embedding...');
  const a = 1.0;
  const b = 1.0; // Controls attraction vs repulsion

  // Precompute edges array and create an index array for shuffling
  const edgeCount = edges.length;
  const edgeSources = edges.map(e => e.source);
  const edgeTargets = edges.map(e => e.target);
  const edgeWeights = edges.map(e => e.weight);

  // Create index array for deterministic edge order shuffling
  const indices = new Array(edgeCount);
  for (let i = 0; i < edgeCount; i++) {
    indices[i] = i;
  }

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    // Deterministic shuffle of edge indices using seeded RNG
    seededShuffle(indices, rng);

    // Learning rate schedule
    const alpha = learningRate * (1 - epoch / nEpochs);

    for (let idx = 0; idx < edgeCount; idx++) {
      const edgeIdx = indices[idx];
      const j = edgeSources[edgeIdx];
      const k = edgeTargets[edgeIdx];
      const weight = edgeWeights[edgeIdx];

      // Positive sample
      let currentDistSq = 0;
      for (let d = 0; d < 2; d++) {
        const diff = Y[j][d] - Y[k][d];
        currentDistSq += diff * diff;
      }

      // Attractive force
      const gradCoeff = -2 * a * b * Math.pow(currentDistSq, b - 1) / (a + Math.pow(currentDistSq, b));
      for (let d = 0; d < 2; d++) {
        const diff = Y[j][d] - Y[k][d];
        const grad = gradCoeff * diff;
        Y[j][d] += alpha * grad * weight;
        Y[k][d] -= alpha * grad * weight;
      }

      // Negative samples - use seeded RNG for deterministic selection
      for (let neg = 0; neg < negativeSampleRate; neg++) {
        const negIdx = Math.floor(rng.next() * n);
        if (negIdx === j || negIdx === k) continue;

        currentDistSq = 0;
        for (let d = 0; d < 2; d++) {
          const diff = Y[j][d] - Y[negIdx][d];
          currentDistSq += diff * diff;
        }

        // Repulsive force
        const negGradCoeff = 2 * b / ((0.001 + currentDistSq) * (a + Math.pow(currentDistSq, b)));
        for (let d = 0; d < 2; d++) {
          const diff = Y[j][d] - Y[negIdx][d];
          const grad = negGradCoeff * diff;
          Y[j][d] += alpha * grad * weight;
          Y[negIdx][d] -= alpha * grad * weight;
        }
      }
    }

    if (epoch % 100 === 0 || epoch === nEpochs - 1) {
      console.log(`  Epoch ${epoch + 1}/${nEpochs} completed`);
    }
  }

  console.log('UMAP completed.');

  // Return projected points
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
