import { useState } from 'react';
import type { PCAParams } from '../types/embeddings';

interface PCAParamsControlProps {
  params?: Partial<PCAParams>;
  onChange: (params: Partial<PCAParams>) => void;
}

export const PCAParamsControl = ({ params, onChange }: PCAParamsControlProps) => {
  const [localParams, setLocalParams] = useState<Partial<PCAParams>>(params || {});

  const handleChange = (key: keyof PCAParams, value: number) => {
    const newParams = { ...localParams, [key]: value };
    setLocalParams(newParams);
    onChange(newParams);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-cyber-green-glow">PCA Parameters</h4>

      <div>
        <label className="block text-xs text-cyber-gray-800 mb-1">power_iterations (5-100): {localParams.powerIterations ?? 20}</label>
        <input
          type="range"
          min="5"
          max="100"
          value={localParams.powerIterations ?? 20}
          onChange={(e) => handleChange('powerIterations', Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
        />
        <p className="text-xs text-cyber-gray-800 mt-1">Higher = more accurate, slower</p>
      </div>
    </div>
  );
};
