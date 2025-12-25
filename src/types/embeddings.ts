export interface Document {
  title: string;
  text: string;
}

// JSONL format: one line per document with embedding
export interface JsonlLine {
  embedding: number[];
  text: string;
  title: string;
}

// Internal format after loading from JSONL
export interface EmbeddingData {
  embeddings: number[][];
  documents: Document[];
}

export interface Point2D {
  x: number;
  y: number;
  title: string;
  text: string;
  index: number;
}

export type AlgorithmType = 'auto' | 'umap' | 'tsne' | 'pca';

export interface UMAPParams {
  nNeighbors?: number;
  nEpochs?: number;
  learningRate?: number;
  negativeSampleRate?: number;
}

export interface TSNEParams {
  perplexity?: number;
  learningRate?: number;
  iterations?: number;
  earlyExaggeration?: number;
  momentum?: number;
}

export interface PCAParams {
  nComponents?: number; // For future use (currently always 2)
  powerIterations?: number;
}

export interface AlgorithmParams {
  umap?: UMAPParams;
  tsne?: TSNEParams;
  pca?: PCAParams;
}

export interface ProjectTo2DOptions {
  algorithm: AlgorithmType;
  params?: AlgorithmParams;
}