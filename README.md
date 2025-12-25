# Embeddings Viewer

Browser-based visualization tool for high-dimensional embeddings. Projects vectors to 2D using UMAP, t-SNE, or PCA. All processing runs locally in your browser in a web worker.

## Installation

```bash
npm install
```

## Usage

Start dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## File Format

Upload embeddings as JSONL (one JSON object per line):

```
{"embedding": [0.1, 0.2, 0.3, ...], "text": "document text", "title": "document title"}
{"embedding": [0.4, 0.5, 0.6, ...], "text": "...", "title": "..."}
```

Required fields:
- `embedding`: array of numbers
- `text`: string content
- `title`: string label

## Algorithms

- Auto: selects UMAP for <8000 samples, PCA for larger
- UMAP: best quality, preserves local and global structure
- PCA: fastest, linear projection
- t-SNE: good for local clusters

## Tech

React 19, TypeScript, D3.js, Vite, Tailwind CSS
