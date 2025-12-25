import { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import './App.css';

import type { Point2D, AlgorithmType, AlgorithmParams, UMAPParams, TSNEParams, PCAParams } from './types/embeddings';
import { useEmbeddings } from './hooks/useEmbeddings';
import { setupVisualization, clearActivePointVisualization } from './utils/visualization/visualizationRenderer';
import { useZoomControls } from './utils/visualization/zoomControls';
import { UMAPParamsControl } from './components/UMAPParamsControl';
import { TSNEParamsControl } from './components/TSNEParamsControl';
import { PCAParamsControl } from './components/PCAParamsControl';

function App() {
  const {
    data,
    points,
    loading,
    loadingType,
    error,
    pcaTime,
    algorithmUsed,
    warning,
    algorithmParams,
    setAlgorithmParams,
    handleFileUpload,
    loadFromUrl,
    reprojectWithAlgorithm,
    loadProgress,
    fileName,
  } = useEmbeddings();

  const [algoSelect, setAlgoSelect] = useState<AlgorithmType>('auto');
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [localParams, setLocalParams] = useState<AlgorithmParams>({});
  const hasAutoLoaded = useRef(false);
  const hasAutoRun = useRef(false);

  // Update local params when algorithm params change from external source
  useEffect(() => {
    setLocalParams(algorithmParams);
  }, [algorithmParams]);

  // Auto-load test file on initial mount
  useEffect(() => {
    const autoLoad = async () => {
      // Only auto-load if no data is already loaded and we haven't attempted yet
      if (!data && !loading && !error && !hasAutoLoaded.current) {
        hasAutoLoaded.current = true;
        await loadFromUrl('/test.jsonl');
      }
    };
    autoLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Auto-run algorithm only after auto-loaded data is available
  useEffect(() => {
    // Only auto-run if data was auto-loaded and we haven't run the algorithm yet
    if (hasAutoLoaded.current && data && points.length === 0 && !loading && !error && !hasAutoRun.current) {
      hasAutoRun.current = true;
      reprojectWithAlgorithm('auto', {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, points, loading, error]);

  // Determine which algorithm will actually be used for auto mode
  const getActualAlgorithm = (): AlgorithmType => {
    if (algoSelect !== 'auto') return algoSelect;
    if (!data) return 'umap';
    const n = data.embeddings.length;
    if (n > 8000) return 'pca';
    return 'umap';
  };

  const actualAlgorithm = getActualAlgorithm();

  const handleRunAlgorithm = () => {
    reprojectWithAlgorithm(algoSelect, localParams);
  };

  const handleParamChange = (algoType: 'umap' | 'tsne' | 'pca', newParams: Partial<UMAPParams | TSNEParams | PCAParams>) => {
    const updatedParams = { ...localParams, [algoType]: newParams };
    setLocalParams(updatedParams);
    setAlgorithmParams(updatedParams);
  };


  const [activePoint, setActivePoint] = useState<Point2D | null>(null);
  const [showInstructionsPopover, setShowInstructionsPopover] = useState(false);
  const instructionsPopoverRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const activePointRef = useRef<Point2D | null>(null);
  const currentDimensionsRef = useRef({ width: 0, height: 0 });

  const { zoomIn, zoomOut, resetZoom } = useZoomControls(svgRef, zoomRef);

  // Keep ref in sync with state
  useEffect(() => {
    activePointRef.current = activePoint;
  }, [activePoint]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (instructionsPopoverRef.current && !instructionsPopoverRef.current.contains(event.target as Node)) {
        setShowInstructionsPopover(false);
      }
    };

    if (showInstructionsPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInstructionsPopover]);

  // Draw visualization when points change
  useEffect(() => {
    if (!svgRef.current || points.length === 0) return;

    const setup = () => {
      const result = setupVisualization({
        svgRef,
        points,
        zoomRef,
        currentTransformRef,
        activePointRef,
        onActivePointChange: setActivePoint,
      });

      // Update stored dimensions
      currentDimensionsRef.current = { width: result.width, height: result.height };
      return result;
    };

    const { cleanup } = setup();

    // Reset zoom after visualization is set up (new file uploaded)
    setTimeout(() => resetZoom(), 0);

    // Set up resize observer to efficiently recreate visualization on resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        const { width: oldWidth, height: oldHeight } = currentDimensionsRef.current;
        // Only recreate if dimensions actually changed significantly
        if (Math.abs(newWidth - oldWidth) > 10 || Math.abs(newHeight - oldHeight) > 10) {
          cleanup();
          setup();
        }
      }
    });

    if (svgRef.current) {
      resizeObserver.observe(svgRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      cleanup();
    };
  }, [points, resetZoom]);

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-green-800 p-4 md:p-8">
      <header className="mb-8">
        <div className="flex justify-center items-center gap-3 mb-2">
          <h1 className="text-3xl md:text-4xl font-bold text-center text-cyber-green-glow shadow-cyber-sm">
            Embeddings Visualization Tool
          </h1>
        </div>
        <p className="text-cyber-gray-800 text-center">
          Add an embeddings JSON file to visualize in 2D (this is all done in your browser)
        </p>
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left panel - File upload and info */}
          <div className="lg:col-span-1 space-y-6">
            <div className="space-y-4 bg-cyber-gray-200 rounded-xl p-6 shadow-panel border border-cyber-dim overflow-visible">
              <div className="relative" ref={instructionsPopoverRef}>
                <button
                  onClick={() => setShowInstructionsPopover(!showInstructionsPopover)}
                  className="w-full px-4 py-2 bg-cyber-green-600 hover:bg-cyber-green-700 text-cyber-green-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  title="Instructions"
                >
                  Instructions
                </button>
                {showInstructionsPopover && (
                  <div className="fixed z-[9999] top-20 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[500px] lg:w-[600px] max-h-[80vh] overflow-y-auto bg-[#0a0a0a] border-2 border-white rounded-lg shadow-panel p-4">
                    <h4 className="text-sm font-semibold text-cyber-green-glow mb-3">How to use this tool</h4>

                    <div className="space-y-3 text-xs text-cyber-gray-800">
                      <div>
                        <h5 className="font-medium text-cyber-green-700 mb-1">Getting Started</h5>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>The app automatically loads a demo dataset (<code className="text-cyber-green-glow">test.jsonl</code>) on startup</li>
                          <li>To use your own data, click "Choose File" and select a <code className="text-cyber-green-glow">.jsonl</code> file</li>
                          <li>Select an algorithm (Auto is recommended) and click "Run Algorithm"</li>
                          <li>Click points to see details, zoom in/out using the controls</li>
                        </ul>
                      </div>

                      <div>
                        <h5 className="font-medium text-cyber-green-700 mb-1">Algorithms</h5>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><strong>Auto:</strong> Chooses UMAP for &lt;8000 samples, PCA for larger</li>
                          <li><strong>UMAP:</strong> Best quality, preserves both local and global structure</li>
                          <li><strong>PCA:</strong> Fastest, linear projection</li>
                          <li><strong>t-SNE:</strong> Good for local clusters, manual selection only</li>
                        </ul>
                      </div>

                      <div>
                        <h5 className="font-medium text-cyber-green-700 mb-1">File Format (JSONL)</h5>
                        <p className="mb-2">One JSON object per line with streaming support:</p>
                        <pre className="text-xs text-cyber-green-700 bg-cyber-gray-400 p-3 rounded-lg overflow-x-auto border border-cyber-dim">
    {`{"embedding":[0.1,0.2,0.3,...],"text":"...","title":"..."}
{"embedding":[0.4,0.5,0.6,...],"text":"...","title":"..."}
...`}
                        </pre>
                        <p className="mt-2">
                          Required fields: <code className="text-cyber-green-glow">embedding</code> (array of numbers), <code className="text-cyber-green-glow">text</code> (string), <code className="text-cyber-green-glow">title</code> (string)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <h2 className="text-xl font-semibold mb-4 text-cyber-green-glow">Add Embeddings</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-cyber-green-700">
                  Select JSONL file with embeddings:
                </label>
                <input
                  type="file"
                  accept=".jsonl"
                  onChange={handleFileUpload}
                  className="w-full px-4 py-3 bg-cyber-gray-400 border border-cyber-dim rounded-lg focus:ring-2 focus:ring-cyber-accent focus:border-cyber-accent text-cyber-green-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyber-green-600 file:text-cyber-green-bright hover:file:bg-cyber-green-700"
                  disabled={loading}
                />
              </div>

              {loading && (
                <div className="flex flex-col items-center justify-center p-4 space-y-2">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-accent"></div>
                    <span className="ml-3 text-cyber-green-700">
                      {loadingType === 'projecting' ? 'Projecting...' : 'Loading embeddings...'}
                    </span>
                  </div>
                  {loadProgress && (
                    <div className="w-full bg-cyber-gray-400 rounded-full h-2">
                      <div
                        className="bg-cyber-accent h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (loadProgress.loaded / Math.max(1, loadProgress.total)) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                  <p className="text-red-400 font-medium">Error:</p>
                  <p className="text-red-300">{error}</p>
                </div>
              )}

              {data && (
                <div className="space-y-4">
                  {/* Algorithm Selection */}
                  <div className="p-4 space-y-3 bg-cyber-gray-400/50 rounded-lg border border-cyber-dim">
                    <h3 className="font-medium mb-3 text-cyber-green-glow">Algorithm Selection</h3>

                    <div className="mb-3">
                      <label className="block text-xs text-cyber-gray-800 mb-1">Algorithm</label>
                      <select
                        value={algoSelect}
                        onChange={(e) => setAlgoSelect(e.target.value as AlgorithmType)}
                        className="w-full px-3 py-2 bg-cyber-gray-400 border border-cyber-dim rounded-lg text-cyber-green-700 focus:ring-2 focus:ring-cyber-accent"
                      >
                        <option value="auto">Auto</option>
                        <option value="umap">UMAP (recommended for most cases)</option>
                        <option value="pca">PCA (fastest, linear)</option>
                        <option value="tsne">t-SNE (manual selection only)</option>
                      </select>
                    </div>

                    {algoSelect === 'auto' && data && (
                      <div className="mt-2 p-2 bg-cyber-gray-500/50 rounded text-xs text-cyber-gray-800">
                        Auto will use: <span className="text-cyber-green-glow font-medium">{actualAlgorithm.toUpperCase()}</span>
                        {actualAlgorithm === 'pca' && ' (> 8000 samples)'}
                        {actualAlgorithm === 'umap' && ' (< 8000 samples)'}
                      </div>
                    )}

                    {warning && (
                      <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                        <p className="text-xs text-yellow-400">{warning}</p>
                      </div>
                    )}

                    <button
                      onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                      className="w-full mt-3 text-xs text-cyber-green-700 hover:text-cyber-green-glow flex items-center justify-center gap-1 transition-colors"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showAdvancedParams ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Advanced Parameters
                    </button>

                    {showAdvancedParams && (
                      <div className="mt-3 pt-3 border-t border-cyber-dim">
                        {actualAlgorithm === 'umap' ? (
                          <UMAPParamsControl
                            params={localParams.umap}
                            datasetSize={data?.embeddings.length}
                            onChange={(params) => handleParamChange('umap', params)}
                          />
                        ) : null}

                        {actualAlgorithm === 'tsne' ? (
                          <TSNEParamsControl
                            params={localParams.tsne}
                            onChange={(params) => handleParamChange('tsne', params)}
                          />
                        ) : null}

                        {actualAlgorithm === 'pca' ? (
                          <PCAParamsControl
                            params={localParams.pca}
                            onChange={(params) => handleParamChange('pca', params)}
                          />
                        ) : null}
                      </div>
                    )}

                    <button
                      onClick={handleRunAlgorithm}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-cyber-green-600 hover:bg-cyber-green-700 text-cyber-green-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {loading ? 'Processing...' : 'Run Algorithm'}
                    </button>
                  </div>

                  <div className="p-4 bg-cyber-gray-400/50 rounded-lg border border-cyber-dim">
                    <h3 className="font-medium mb-2 text-cyber-green-glow">File Information</h3>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-cyber-gray-800">Embeddings:</span>
                        <span className="text-cyber-green-700 text-right">{data.embeddings.length} vectors</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-cyber-gray-800">Dimensions:</span>
                        <span className="text-cyber-green-700 text-right">{data.embeddings[0]?.length || 0}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-cyber-gray-800">Documents:</span>
                        <span className="text-cyber-green-700 text-right">{data.documents.length}</span>
                      </div>
                      {pcaTime !== null && (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-cyber-gray-800">Algorithm:</span>
                            <span className="text-cyber-green-bright text-right">{algorithmUsed}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-cyber-gray-800">Time:</span>
                            <span className="text-cyber-green-glow text-right">{pcaTime.toFixed(2)}ms</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>

          {/* Right panel - Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-cyber-gray-200 rounded-xl p-6 shadow-panel border border-cyber-dim">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <h2 className="text-xl font-semibold text-cyber-green-glow">
                  {fileName ? `Viewing ${fileName}` : '2D Projection'}
                </h2>
                {points.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <span className="text-xs sm:text-sm text-cyber-gray-800">
                      {points.length} points
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={zoomIn}
                        className="p-1 sm:p-1.5 bg-cyber-gray-500 hover:bg-cyber-gray-400 rounded transition-colors border border-cyber-dim"
                        title="Zoom In"
                      >
                        <svg className="text-cyber-green-glow" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
                        </svg>
                      </button>
                      <button
                        onClick={zoomOut}
                        className="p-1 sm:p-1.5 bg-cyber-gray-500 hover:bg-cyber-gray-400 rounded transition-colors border border-cyber-dim"
                        title="Zoom Out"
                      >
                        <svg className="text-cyber-green-glow" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                        </svg>
                      </button>
                      <button
                        onClick={resetZoom}
                        className="p-1 sm:p-1.5 bg-cyber-gray-500 hover:bg-cyber-gray-400 rounded transition-colors border border-cyber-dim"
                        title="Reset Zoom"
                      >
                        <svg className="text-cyber-green-glow" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M4 4l5 5m11 11v-5h-5m5 5l-5-5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-[600px] p-[2px] border border-cyber-dim rounded-lg shadow-cyber-sm relative">
                {points.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-cyber-gray-800">
                    <div className="text-6xl mb-4">📊</div>
                    <p className="text-lg mb-2 text-cyber-green-700">No data to display</p>
                    <p className="text-sm text-center text-cyber-gray-800">Input a JSON file with embeddings to visualize</p>
                  </div>
                ) : (
                  <svg
                    ref={svgRef}
                    width="100%"
                    height="100%"
                    className="bg-cyber-black"
                    onClick={() => {
                      // Clear active point when clicking on SVG background
                      if (activePointRef.current) {
                        setActivePoint(null);
                        clearActivePointVisualization(svgRef, currentTransformRef);
                      }
                    }}
                  />
                )}
              </div>

              {activePoint && (
                <div className="mt-3 bg-cyber-gray-300 rounded-lg p-3 border border-cyber-accent shadow-cyber">
                  <h3 className="text-xs font-medium mb-1 text-cyber-green-700">
                    Active Point
                    <span className="ml-2 text-xs text-cyber-green-glow">(Click point or background to dismiss)</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <p className="text-xs text-cyber-gray-800">Title</p>
                      <p className="text-xs font-medium truncate text-cyber-green-700" title={activePoint.title}>{activePoint.title}</p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-gray-800">Index</p>
                      <p className="text-xs font-medium text-cyber-green-700">{activePoint.index}</p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-gray-800">Coordinates</p>
                      <p className="text-xs font-medium text-cyber-green-700">({activePoint.x.toFixed(4)}, {activePoint.y.toFixed(4)})</p>
                    </div>
                    {activePoint.text && (
                      <div className="md:col-span-2">
                        <p className="text-xs text-cyber-gray-800">Preview</p>
                        <p className="text-xs mt-0.5 text-cyber-green-700" title={activePoint.text}>{activePoint.text}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;