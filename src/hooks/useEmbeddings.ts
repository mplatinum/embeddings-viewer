import { useState, useEffect, useRef } from 'react';
import type { EmbeddingData, Point2D, AlgorithmType, AlgorithmParams, ProjectTo2DOptions } from '../types/embeddings';
import type { ProjectionResult } from '../utils/algorithms/projectTo2D';

// Worker message types
interface WorkerMessage {
  embeddings: number[][];
  documents: Array<{ title: string; text: string }>;
  options: ProjectTo2DOptions;
}

interface WorkerResponse {
  success: boolean;
  result?: ProjectionResult;
  error?: string;
}

export const useEmbeddings = () => {
  const [data, setData] = useState<EmbeddingData | null>(null);
  const [points, setPoints] = useState<Point2D[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'loading' | 'projecting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pcaTime, setPcaTime] = useState<number | null>(null);
  const [algorithmUsed, setAlgorithmUsed] = useState<string>('');
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgorithmType>('auto');
  const [algorithmParams, setAlgorithmParams] = useState<AlgorithmParams>({});
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Keep track of worker to clean it up
  const workerRef = useRef<Worker | null>(null);

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const loadFromUrl = async (url: string) => {
    setLoading(true);
    setLoadingType('loading');
    setError(null);
    setLoadProgress({ loaded: 0, total: 0 });
    // Extract file name from URL
    const urlFileName = url.split('/').pop() || url;
    setFileName(urlFileName);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      setLoadProgress({ loaded: 0, total });

      const embeddings: number[][] = [];
      const documents: Array<{ title: string; text: string }> = [];
      let lineNumber = 0;

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const processText = (text: string) => {
        const lines = text.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          lineNumber++;
          try {
            const parsed = JSON.parse(line);

            if (!parsed.embedding || !Array.isArray(parsed.embedding)) {
              throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid embedding array`);
            }
            if (typeof parsed.text !== 'string') {
              throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid text field`);
            }
            if (typeof parsed.title !== 'string') {
              throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid title field`);
            }

            embeddings.push(parsed.embedding);
            documents.push({ title: parsed.title, text: parsed.text });
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              throw new Error(`Invalid JSON at line ${lineNumber}: ${parseError.message}`);
            }
            throw parseError;
          }
        }

        return lines[lines.length - 1];
      };

      const readChunk = async (): Promise<void> => {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const remainingLines = buffer.trim().split('\n');
            for (const line of remainingLines) {
              if (!line.trim()) continue;
              lineNumber++;
              try {
                const parsed = JSON.parse(line);

                if (!parsed.embedding || !Array.isArray(parsed.embedding)) {
                  throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid embedding array`);
                }
                if (typeof parsed.text !== 'string') {
                  throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid text field`);
                }
                if (typeof parsed.title !== 'string') {
                  throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid title field`);
                }

                embeddings.push(parsed.embedding);
                documents.push({ title: parsed.title, text: parsed.text });
              } catch (parseError) {
                if (parseError instanceof SyntaxError) {
                  throw new Error(`Invalid JSON at line ${lineNumber}: ${parseError.message}`);
                }
                throw parseError;
              }
            }
          }

          setData({ embeddings, documents });
          setPoints([]);
          setPcaTime(null);
          setAlgorithmUsed('');
          setWarning(undefined);
          setLoadProgress(null);
          setLoading(false);
          setLoadingType(null);
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer = processText(buffer + chunk);

        setLoadProgress({ loaded: embeddings.length, total });

        return readChunk();
      };

      await readChunk();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file from URL');
      setData(null);
      setPoints([]);
      setPcaTime(null);
      setAlgorithmUsed('');
      setWarning(undefined);
      setLoadProgress(null);
      setLoading(false);
      setLoadingType(null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingType('loading');
    setError(null);
    setLoadProgress({ loaded: 0, total: file.size });
    setFileName(file.name);

    const embeddings: number[][] = [];
    const documents: Array<{ title: string; text: string }> = [];
    let lineNumber = 0;
    let buffer = '';

    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const processText = (text: string) => {
      const lines = text.split('\n');

      // Process all complete lines (last one may be incomplete)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        lineNumber++;
        try {
          const parsed = JSON.parse(line);

          if (!parsed.embedding || !Array.isArray(parsed.embedding)) {
            throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid embedding array`);
          }
          if (typeof parsed.text !== 'string') {
            throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid text field`);
          }
          if (typeof parsed.title !== 'string') {
            throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid title field`);
          }

          embeddings.push(parsed.embedding);
          documents.push({ title: parsed.title, text: parsed.text });
        } catch (parseError) {
          if (parseError instanceof SyntaxError) {
            throw new Error(`Invalid JSON at line ${lineNumber}: ${parseError.message}`);
          }
          throw parseError;
        }
      }

      // Keep the last (potentially incomplete) line in the buffer
      return lines[lines.length - 1];
    };

    const readChunk = (): Promise<void> => {
      return reader.read().then(({ done, value }) => {
        if (done) {
          // Process any remaining content in buffer
          if (buffer.trim()) {
            const remainingLines = buffer.trim().split('\n');
            for (const line of remainingLines) {
              if (!line.trim()) continue;
              lineNumber++;
              try {
                const parsed = JSON.parse(line);

                if (!parsed.embedding || !Array.isArray(parsed.embedding)) {
                  throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid embedding array`);
                }
                if (typeof parsed.text !== 'string') {
                  throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid text field`);
                }
                if (typeof parsed.title !== 'string') {
                  throw new Error(`Invalid JSONL format at line ${lineNumber}: missing or invalid title field`);
                }

                embeddings.push(parsed.embedding);
                documents.push({ title: parsed.title, text: parsed.text });
              } catch (parseError) {
                if (parseError instanceof SyntaxError) {
                  throw new Error(`Invalid JSON at line ${lineNumber}: ${parseError.message}`);
                }
                throw parseError;
              }
            }
          }

          // Done reading - set the data
          setData({ embeddings, documents });
          setPoints([]);
          setPcaTime(null);
          setAlgorithmUsed('');
          setWarning(undefined);
          setLoadProgress(null);
          setLoading(false);
          setLoadingType(null);
          return;
        }

        // Decode and process the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer = processText(buffer + chunk);

        // Update progress
        const loadedSoFar = embeddings.length;
        setLoadProgress({ loaded: loadedSoFar, total: file.size });

        // Continue reading
        return readChunk();
      });
    };

    readChunk().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setData(null);
      setPoints([]);
      setPcaTime(null);
      setAlgorithmUsed('');
      setWarning(undefined);
      setLoadProgress(null);
      setLoading(false);
      setLoadingType(null);
    });
  };

  const reprojectWithAlgorithm = (algorithm: AlgorithmType, params?: AlgorithmParams) => {
    if (!data) return;

    setLoading(true);
    setLoadingType('projecting');
    setError(null);

    // Terminate any existing worker
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    try {
      // Create new worker for this computation
      const worker = new Worker(new URL('../workers/projection.worker.ts', import.meta.url), {
        type: 'module'
      });
      workerRef.current = worker;

      // Set up message handler
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { success, result, error: workerError } = e.data;

        if (success && result) {
          setPoints(result.points);
          setAlgorithmUsed(result.algorithm);
          setPcaTime(result.timeMs);
          setWarning(result.warning);
          setSelectedAlgorithm(algorithm);
          setAlgorithmParams(params || {});
        } else {
          setError(workerError || 'Failed to reproject data');
        }

        setLoading(false);
        setLoadingType(null);
        worker.terminate();
        workerRef.current = null;
      };

      worker.onerror = (err) => {
        setError(`Worker error: ${err.message}`);
        setLoading(false);
        setLoadingType(null);
        worker.terminate();
        workerRef.current = null;
      };

      // Send data to worker
      const message: WorkerMessage = {
        embeddings: data.embeddings,
        documents: data.documents,
        options: { algorithm, params }
      };
      worker.postMessage(message);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start worker');
      setLoading(false);
      setLoadingType(null);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    }
  };

  return {
    data,
    points,
    loading,
    loadingType,
    error,
    pcaTime,
    algorithmUsed,
    warning,
    selectedAlgorithm,
    algorithmParams,
    loadProgress,
    fileName,
    handleFileUpload,
    loadFromUrl,
    reprojectWithAlgorithm,
    setPoints,
    setData,
    setLoading,
    setError,
    setPcaTime,
    setAlgorithmUsed,
    setSelectedAlgorithm,
    setAlgorithmParams,
  };
};
