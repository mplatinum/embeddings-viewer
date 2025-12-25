import { useState } from 'react';
import type { UMAPParams } from '../types/embeddings';

interface UMAPParamsControlProps {
  params?: Partial<UMAPParams>;
  datasetSize?: number;
  onChange: (params: Partial<UMAPParams>) => void;
}

export const UMAPParamsControl = ({ params, datasetSize, onChange }: UMAPParamsControlProps) => {
  const [localParams, setLocalParams] = useState<Partial<UMAPParams>>(params || {});

  const handleChange = (key: keyof UMAPParams, value: number) => {
    const newParams = { ...localParams, [key]: value };
    setLocalParams(newParams);
    onChange(newParams);
  };

  // Compute auto n_neighbors based on the algorithm logic (must match uMAP.ts)
  const getAutoNeighbors = (n: number): number => {
    if (n < 50) return Math.max(3, Math.min(8, Math.floor(Math.sqrt(n))));
    if (n < 200) return Math.floor(10 + Math.sqrt(n - 100) / 3);
    return Math.min(15, Math.floor(n / 50));
  };

  // Compute auto n_epochs based on the algorithm logic (must match uMAP.ts)
  const getAutoEpochs = (n: number): number => {
    return n < 1000 ? 500 : 200;
  };

  // Get effective value for slider display - compute auto value if not set
  const sliderNeighborsValue = localParams.nNeighbors ?? (datasetSize !== undefined ? getAutoNeighbors(datasetSize) : 15);
  const displayNeighbors = localParams.nNeighbors;
  const isNeighborsAuto = !displayNeighbors;

  const sliderEpochsValue = localParams.nEpochs ?? (datasetSize !== undefined ? getAutoEpochs(datasetSize) : 500);
  const displayEpochs = localParams.nEpochs;
  const isEpochsAuto = !displayEpochs;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-cyber-green-glow">UMAP Parameters</h4>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">
          n_neighbors (3-100): {isNeighborsAuto ? `auto (${sliderNeighborsValue})` : sliderNeighborsValue}
        </label>
        <input
          type="range"
          min="3"
          max="100"
          value={sliderNeighborsValue}
          onChange={(e) => handleChange('nNeighbors', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
        <p className="text-xs text-cyber-gray-800 mt-1">Lower = tighter clusters, Higher = global structure</p>
      </div>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">
          n_epochs (100-2000): {isEpochsAuto ? `auto (${sliderEpochsValue})` : sliderEpochsValue}
        </label>
        <input
          type="range"
          min="100"
          max="2000"
          step="50"
          value={sliderEpochsValue}
          onChange={(e) => handleChange('nEpochs', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
        <p className="text-xs text-cyber-gray-800 mt-1">Auto: 500 for &lt;1000 samples, 200 for larger</p>
      </div>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">learning_rate (0.1-10): {(localParams.learningRate ?? 1.0).toFixed(1)}</label>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={localParams.learningRate ?? 1.0}
          onChange={(e) => handleChange('learningRate', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
      </div>
    </div>
  );
};
