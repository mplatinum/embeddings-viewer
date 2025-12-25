import { useState } from 'react';
import type { TSNEParams } from '../types/embeddings';

interface TSNEParamsControlProps {
  params?: Partial<TSNEParams>;
  onChange: (params: Partial<TSNEParams>) => void;
}

export const TSNEParamsControl = ({ params, onChange }: TSNEParamsControlProps) => {
  const [localParams, setLocalParams] = useState<Partial<TSNEParams>>(params || {});

  const handleChange = (key: keyof TSNEParams, value: number) => {
    const newParams = { ...localParams, [key]: value };
    setLocalParams(newParams);
    onChange(newParams);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-cyber-green-glow">t-SNE Parameters</h4>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">perplexity (5-50): {localParams.perplexity ?? 'auto'}</label>
        <input
          type="range"
          min="5"
          max="50"
          value={localParams.perplexity ?? 30}
          onChange={(e) => handleChange('perplexity', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
        <p className="text-xs text-cyber-gray-800 mt-1">Lower = local clusters, Higher = global structure</p>
      </div>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">learning_rate (10-1000): {localParams.learningRate ?? 500}</label>
        <input
          type="range"
          min="10"
          max="1000"
          step="10"
          value={localParams.learningRate ?? 500}
          onChange={(e) => handleChange('learningRate', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
      </div>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">iterations (500-3000): {localParams.iterations ?? 1500}</label>
        <input
          type="range"
          min="500"
          max="3000"
          step="100"
          value={localParams.iterations ?? 1500}
          onChange={(e) => handleChange('iterations', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
      </div>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">early_exaggeration (1-10): {(localParams.earlyExaggeration ?? 4).toFixed(1)}</label>
        <input
          type="range"
          min="1"
          max="10"
          step="0.5"
          value={localParams.earlyExaggeration ?? 4}
          onChange={(e) => handleChange('earlyExaggeration', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
      </div>
    </div>
  );
};
