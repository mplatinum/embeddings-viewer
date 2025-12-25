import { useCallback } from 'react';
import * as d3 from 'd3';
import type { RefObject } from 'react';

export const useZoomControls = (
  svgRef: RefObject<SVGSVGElement | null>,
  zoomRef: RefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
) => {
  const zoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(300).call(zoomRef.current.scaleBy, 1.3);
    }
  }, [svgRef, zoomRef]);

  const zoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(300).call(zoomRef.current.scaleBy, 1 / 1.3);
    }
  }, [svgRef, zoomRef]);

  const resetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, [svgRef, zoomRef]);

  return { zoomIn, zoomOut, resetZoom };
};