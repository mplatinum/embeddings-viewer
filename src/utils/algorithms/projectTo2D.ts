import type { Document, Point2D, AlgorithmType, ProjectTo2DOptions } from '../../types/embeddings';
import { tSNE } from './tSNE';
import { incrementalPCA } from './incrementalPCA';
import { uMAP } from './uMAP';

export interface ProjectionResult {
  points: Point2D[];
  algorithm: string;
  timeMs: number;
  warning?: string;
}

// Dimensionality reduction implementation with multiple algorithms
export const projectTo2D = (
  embeddings: number[][],
  documents: Document[],
  options: ProjectTo2DOptions = { algorithm: 'auto' }
): ProjectionResult => {
  if (embeddings.length === 0) return { points: [], algorithm: 'No data', timeMs: 0 };
  if (embeddings.length === 1) {
    return {
      points: [{
        x: 0,
        y: 0,
        title: documents[0]?.title || `Document 1`,
        text: documents[0]?.text || '',
        index: 0
      }],
      algorithm: 'Single point',
      timeMs: 0
    };
  }

  const n = embeddings.length;
  const dim = embeddings[0].length;
  let points: Point2D[];
  let algorithm: AlgorithmType;
  let warning: string | undefined;

  console.log(`Dimensionality Reduction Algorithm Selection:`);
  console.log(`Samples: ${n}, Dimensions: ${dim}`);

  // Determine algorithm
  if (options.algorithm === 'auto') {
    if (n > 8000) {
      algorithm = 'pca';
    } else {
      algorithm = 'umap';
    }
  } else {
    algorithm = options.algorithm;
  }

  // Warn if algorithm is not optimal for dataset size
  if (algorithm === 'pca' && n <= 1000) {
    warning = `PCA is recommended for datasets > 8000 samples. Current: ${n} samples. Consider using UMAP or t-SNE for better clustering.`;
  } else if (algorithm === 'umap' && n > 8000) {
    warning = `UMAP may be slow for datasets > 8000 samples. Current: ${n} samples. Consider using PCA for faster results.`;
  } else if (algorithm === 'tsne' && n > 1000) {
    warning = `t-SNE is recommended for datasets < 1000 samples. Current: ${n} samples. Consider using UMAP for better performance.`;
  }

  const startTime = performance.now();

  switch (algorithm) {
    case 'umap':
      console.log(`Using UMAP`);
      points = uMAP(embeddings, documents, options.params?.umap);
      break;
    case 'tsne':
      console.log(`Using t-SNE`);
      points = tSNE(embeddings, documents, options.params?.tsne);
      break;
    case 'pca':
      console.log(`Using Incremental PCA`);
      points = incrementalPCA(embeddings, documents, options.params?.pca);
      break;
    default:
      algorithm = 'umap';
      points = uMAP(embeddings, documents, options.params?.umap);
  }

  const endTime = performance.now();
  const timeMs = endTime - startTime;

  // Validate results
  let validPoints = 0;
  let nanPoints = 0;
  let infPoints = 0;
  for (const point of points) {
    if (isNaN(point.x) || isNaN(point.y)) {
      nanPoints++;
    } else if (!isFinite(point.x) || !isFinite(point.y)) {
      infPoints++;
    } else {
      validPoints++;
    }
  }

  console.log(`${algorithm.toUpperCase()} completed in ${timeMs.toFixed(2)}ms`);
  console.log(`Valid points: ${validPoints}/${points.length} (${(validPoints/points.length*100).toFixed(1)}%)`);
  if (nanPoints > 0) console.log(`NaN points: ${nanPoints}`);
  if (infPoints > 0) console.log(`Infinite points: ${infPoints}`);

  if (nanPoints > 0 || infPoints > 0) {
    console.warn(`Dimensionality reduction produced invalid points!`);
  }

  return { points, algorithm: algorithm.toUpperCase(), timeMs, warning };
};
