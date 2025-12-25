import * as d3 from 'd3';
import type { RefObject } from 'react';
import type { Point2D } from '../../types/embeddings';

export interface VisualizationConfig {
  svgRef: RefObject<SVGSVGElement | null>;
  points: Point2D[];
  zoomRef: RefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>;
  currentTransformRef: RefObject<d3.ZoomTransform>;
  activePointRef: RefObject<Point2D | null>;
  onHoverPoint?: (point: Point2D | null) => void;
  onActivePointChange: (point: Point2D | null) => void;
  onZoomTransformChange?: (transform: d3.ZoomTransform) => void;
}

// Helper function to format tick labels and avoid floating point precision issues
export const formatTickLabel = (value: d3.NumberValue | unknown): string => {
  // Convert to number, handling D3 tick value objects
  const num = typeof value === 'number' ? value : Number(value);

  // Handle NaN or invalid numbers
  if (!isFinite(num)) return '';

  // Handle zero specially
  if (num === 0) return '0';

  // For very large or very small numbers, use scientific notation
  if (Math.abs(num) >= 1e4 || Math.abs(num) < 1e-3) {
    // Use scientific notation with 2 decimal places in mantissa
    return num.toExponential(2);
  }

  // For moderate-sized numbers, handle floating point precision
  // First round to 12 decimal places to clean up floating point errors
  const rounded = Math.round(num * 1e12) / 1e12;

  // Check if the number is very close to an integer
  const nearestInt = Math.round(rounded);
  if (Math.abs(rounded - nearestInt) < 1e-10) {
    return nearestInt.toString();
  }

  // Use fixed decimal places based on magnitude
  if (Math.abs(rounded) < 0.01) return rounded.toFixed(4);
  if (Math.abs(rounded) < 0.1) return rounded.toFixed(3);
  if (Math.abs(rounded) < 1) return rounded.toFixed(2);
  if (Math.abs(rounded) < 10) return rounded.toFixed(1);

  // For numbers between 10 and 10000, round to nearest integer
  return Math.round(rounded).toString();
};

export interface VisualizationResult {
  cleanup: () => void;
  width: number;
  height: number;
}

/**
 * Sets up D3 visualization with zoom, points, axes, grid, and tooltips.
 * Returns a cleanup function to remove the visualization and current dimensions.
 */
export const setupVisualization = (config: VisualizationConfig): VisualizationResult => {
  const {
    svgRef,
    points,
    zoomRef,
    currentTransformRef,
    activePointRef,
    onHoverPoint,
    onActivePointChange,
    onZoomTransformChange,
  } = config;

  if (!svgRef.current || points.length === 0) {
    return { cleanup: () => {}, width: 0, height: 0 };
  }

  const svg = d3.select(svgRef.current);
  svg.selectAll('*').remove();

  // Allow SVG overflow for axis labels, but clip path handles the content area
  svg.style('overflow', 'visible');

  const width = svgRef.current.clientWidth;
  const height = svgRef.current.clientHeight;
  const margin = { top: 20, right: 20, bottom: 40, left: 75 };

  // Store reference to the active point data for updating tooltip position during zoom
  let activePointData: Point2D | null = null;

  // Create a clip path to constrain zoomed content within plot area bounds
  // This clip path stays in screen coordinates (SVG level) and doesn't transform with zoom
  // Add padding for max point radius (hover radius = 9) + stroke width (2)
  const maxPointRadius = 12;
  const defs = svg.append('defs');
  const clipPath = defs.append('clipPath')
    .attr('id', 'svg-clip');
  clipPath.append('rect')
    .attr('x', margin.left - maxPointRadius)
    .attr('y', margin.top - maxPointRadius)
    .attr('width', width - margin.left - margin.right + maxPointRadius * 2)
    .attr('height', height - margin.top - margin.bottom + maxPointRadius * 2);

  // Create a clipped container at SVG level (this won't be transformed by zoom)
  const clippedContainer = svg.append('g')
    .attr('clip-path', 'url(#svg-clip)');

  // Create a container group for all zoomable elements inside the clipped container
  const zoomContainer = clippedContainer.append('g')
    .attr('class', 'zoom-container');

  // The container will hold the points (same as zoomContainer now)
  const container = zoomContainer;

  const xExtent = d3.extent(points, d => d.x) as [number, number];
  const yExtent = d3.extent(points, d => d.y) as [number, number];

  const xScale = d3.scaleLinear()
    .domain(xExtent)
    .range([margin.left + maxPointRadius, width - margin.right - maxPointRadius]);

  const yScale = d3.scaleLinear()
    .domain(yExtent)
    .range([height - margin.bottom - maxPointRadius, margin.top + maxPointRadius]);

  // Calculate appropriate number of ticks based on available dimensions
  const plotWidth = width - margin.left - margin.right;
  const xTickCount = Math.max(3, Math.floor(plotWidth / 80)); // ~80px per tick label
  const yTickCount = Math.max(4, Math.floor((height - margin.top - margin.bottom) / 50));

  // Create tooltip group
  const tooltip = svg.append('g')
    .attr('class', 'tooltip')
    .style('opacity', 0)
    .style('pointer-events', 'none')
    .style('overflow', 'visible');

  const tooltipRect = tooltip.append('rect')
    .attr('rx', 4)
    .attr('ry', 4)
    .style('fill', 'rgba(15, 20, 18, 0.95)')
    .style('stroke', '#22cc66')
    .style('stroke-width', 1);

  const tooltipText = tooltip.append('text')
    .style('fill', '#5ae885')
    .style('font-size', '12px')
    .style('font-family', 'monospace');

  // Helper function to wrap text into multiple lines based on max width
  const wrapText = (text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = getTextWidth(testLine);

      if (testWidth <= maxWidth || !currentLine) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  };

  // Helper function to estimate text width (rough approximation for monospace font)
  const getTextWidth = (text: string): number => {
    // Approximate character width for 12px monospace font
    return text.length * 7.2;
  };

  // Helper function to position tooltip based on point data and current transform
  const updateTooltipPosition = (point: Point2D, transform: d3.ZoomTransform, isActive: boolean = false) => {
    const newXScale = transform.rescaleX(xScale);
    const newYScale = transform.rescaleY(yScale);

    // Get the transformed screen coordinates of the point
    const pointX = newXScale(point.x);
    const pointY = newYScale(point.y);

    // Calculate available width for tooltip based on screen size
    const svgWidth = svgRef.current?.clientWidth || 0;
    const maxTooltipWidth = Math.min(300, svgWidth * 0.4);
    const wrapPadding = 8;
    const maxTitleTextWidth = maxTooltipWidth - wrapPadding * 2;

    // Build the prefix line
    const prefix = `#${point.index + 1}: `;

    // Wrap the title if it's too long
    const titleLines = wrapText(point.title, maxTitleTextWidth - getTextWidth(prefix));

    const lines: string[] = [];
    // Add title with prefix only on first line
    if (titleLines.length > 0) {
      lines.push(prefix + titleLines[0]);
      // Add remaining title lines with indentation
      for (let i = 1; i < titleLines.length; i++) {
        lines.push(' '.repeat(prefix.length) + titleLines[i]);
      }
    }

    // Add coordinates and active status
    lines.push(`(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`);
    if (isActive) {
      lines.push('(Active - click to dismiss)');
    }

    tooltipText.selectAll('tspan').remove();
    lines.forEach((line, i) => {
      tooltipText.append('tspan')
        .attr('x', 0)
        .attr('dy', i === 0 ? '0' : '1.2em')
        .text(line);
    });

    // Measure text and position tooltip
    const bbox = tooltipText.node()?.getBBox();
    const textNode = tooltipText.node();
    // Use getComputedTextLength for more accurate width measurement of each tspan
    let maxTextWidth = 0;
    if (textNode) {
      const tspans = textNode.querySelectorAll('tspan');
      tspans.forEach((tspan) => {
        const width = (tspan as SVGTSpanElement).getComputedTextLength();
        maxTextWidth = Math.max(maxTextWidth, width);
      });
    }

    // Calculate actual tooltip dimensions based on text measurement
    let actualTooltipWidth = 0;
    let actualTooltipHeight = 0;
    let tooltipXOffset = 0;
    let tooltipYOffset = 0;

    if (bbox) {
      const padding = 8;
      actualTooltipWidth = Math.max(bbox.width, maxTextWidth) + padding * 2;
      actualTooltipHeight = bbox.height + padding * 2;
      tooltipXOffset = bbox.x - padding;
      tooltipYOffset = bbox.y - padding;

      tooltipRect
        .attr('x', tooltipXOffset)
        .attr('y', tooltipYOffset)
        .attr('width', actualTooltipWidth)
        .attr('height', actualTooltipHeight);
    }

    // Position tooltip using the calculated dimensions
    if (actualTooltipWidth > 0) {
      const svgWidth = svgRef.current?.clientWidth || 0;
      const svgHeight = svgRef.current?.clientHeight || 0;

      // Define bounds considering margins - tooltip should stay within the plot area
      // The plot area starts at margin.left (75px) and ends at width - margin.right (20px)
      const minBoundX = margin.left;
      const maxBoundX = svgWidth - margin.right;
      const minBoundY = margin.top;
      const maxBoundY = svgHeight - margin.bottom;

      // Position tooltip near the point (not cursor)
      let tooltipX = pointX + 15;
      let tooltipY = pointY - 15;

      // Handle horizontal positioning
      // The actual right edge is: tooltipX + tooltipXOffset + actualTooltipWidth
      const rightEdge = tooltipX + tooltipXOffset + actualTooltipWidth;

      if (rightEdge > maxBoundX) {
        // Try positioning to the left of the point
        tooltipX = pointX - actualTooltipWidth - 15;
      }
      // Recalculate edges after potential repositioning
      const newRightEdge = tooltipX + tooltipXOffset + actualTooltipWidth;
      const newLeftEdge = tooltipX + tooltipXOffset;

      if (newLeftEdge < minBoundX) {
        tooltipX = minBoundX - tooltipXOffset;
      }
      if (newRightEdge > maxBoundX) {
        tooltipX = maxBoundX - actualTooltipWidth - tooltipXOffset;
      }

      // Handle vertical positioning - use plot area bounds
      if (tooltipY + tooltipYOffset < minBoundY || tooltipY + tooltipYOffset + actualTooltipHeight > maxBoundY) {
        tooltipY = pointY + 15;
      }
      if (tooltipY + tooltipYOffset < minBoundY || tooltipY + tooltipYOffset + actualTooltipHeight > maxBoundY) {
        const overflowTop = Math.max(0, minBoundY - (tooltipY + tooltipYOffset));
        const overflowBottom = Math.max(0, tooltipY + tooltipYOffset + actualTooltipHeight - maxBoundY);

        if (overflowTop > 0 && overflowBottom > 0) {
          tooltipY = Math.max(minBoundY, (maxBoundY - actualTooltipHeight - tooltipYOffset) / 2);
        } else if (overflowTop > 0) {
          tooltipY = minBoundY - tooltipYOffset;
        } else if (overflowBottom > 0) {
          tooltipY = maxBoundY - actualTooltipHeight - tooltipYOffset;
        }
      }

      const minY = minBoundY - tooltipYOffset;
      const maxY = maxBoundY - actualTooltipHeight - tooltipYOffset;
      tooltipY = Math.max(minY, Math.min(tooltipY, maxY));

      tooltip
        .attr('transform', `translate(${tooltipX},${tooltipY})`)
        .style('opacity', 1);
    }
  };

  // Create zoom behavior
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 20]) // Allow zoom from 5% to 2000%
    .translateExtent([[0, 0], [width, height]])
    .on('zoom', (event) => {
      const transform = event.transform;
      onZoomTransformChange?.(transform);
      currentTransformRef.current = transform;
      zoomContainer.attr('transform', transform.toString());

      // Update axes with new scale
      const newXScale = transform.rescaleX(xScale);
      const newYScale = transform.rescaleY(yScale);

      svg.select<SVGGElement>('.x-axis').call(xAxis.scale(newXScale));
      svg.select<SVGGElement>('.y-axis').call(yAxis.scale(newYScale));

      // Update grid lines with same tick counts as axes
      svg.select<SVGGElement>('.x-grid').call(
        d3.axisBottom(newXScale).ticks(xTickCount).tickSize(-height + margin.top + margin.bottom).tickFormat(() => '')
      );
      svg.select<SVGGElement>('.y-grid').call(
        d3.axisLeft(newYScale).ticks(yTickCount).tickSize(-width + margin.left + margin.right).tickFormat(() => '')
      );

      // Adjust point sizes based on zoom scale
      // When zooming in (scale > 1), points should get smaller
      // When zooming out (scale < 1), points should get larger
      const baseRadius = 6;
      const adjustedRadius = baseRadius / transform.k;

      // Also adjust stroke width proportionally
      const baseStrokeWidth = 1;
      const adjustedStrokeWidth = baseStrokeWidth / transform.k;

      // Update all points' radius and stroke width
      container.selectAll('.points-group circle')
        .attr('r', adjustedRadius)
        .attr('stroke-width', adjustedStrokeWidth);

      // Update tooltip position if there's an active point
      if (activePointData) {
        updateTooltipPosition(activePointData, transform, true);
      }
    });

  // Apply zoom behavior to SVG
  svg.call(zoom);
  zoomRef.current = zoom;

  // Add axes to SVG (fixed position)
  const xAxis = d3.axisBottom(xScale)
    .ticks(xTickCount)
    .tickFormat(d => formatTickLabel(d));

  const yAxis = d3.axisLeft(yScale)
    .ticks(yTickCount)
    .tickFormat(d => formatTickLabel(d));

  // X axis with background
  const xAxisGroup = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height - margin.bottom})`);

  // Add background rectangle for x-axis tick labels
  // d3.axisBottom puts tick labels below the axis line (positive y)
  xAxisGroup.append('rect')
    .attr('x', margin.left)
    .attr('y', 0)
    .attr('width', width - margin.left - margin.right)
    .attr('height', 30)
    .attr('fill', 'rgba(10, 18, 16, 0.85)')
    .attr('stroke', 'none')
    .style('pointer-events', 'none');

  xAxisGroup.call(xAxis);

  // Y axis with background
  const yAxisGroup = svg.append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${margin.left},0)`);

  // Add background rectangle for y-axis tick labels
  yAxisGroup.append('rect')
    .attr('x', -75) // tick labels are left of axis line
    .attr('y', 0)
    .attr('width', 75) // enough to cover tick labels
    .attr('height', height)
    .attr('fill', 'rgba(10, 18, 16, 0.85)') // semi-transparent cyber-black
    .attr('stroke', 'none')
    .style('pointer-events', 'none');

  yAxisGroup.call(yAxis);

  // Add grid lines to SVG (fixed position)
  svg.append('g')
    .attr('class', 'x-grid d3-grid')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(xTickCount).tickSize(-height + margin.top + margin.bottom).tickFormat(() => ''));

  svg.append('g')
    .attr('class', 'y-grid d3-grid')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).ticks(yTickCount).tickSize(-width + margin.left + margin.right).tickFormat(() => ''));

  // Apply the saved transform if it exists (preserves zoom/pan across re-renders)
  const savedTransform = currentTransformRef.current;
  if (savedTransform && (savedTransform.k !== 1 || savedTransform.x !== 0 || savedTransform.y !== 0)) {
    // Apply the transform to the zoom behavior
    svg.call(zoom.transform, savedTransform);
    // Also apply it to the zoomContainer
    zoomContainer.attr('transform', savedTransform.toString());

    // Update axes with saved transform
    const newXScale = savedTransform.rescaleX(xScale);
    const newYScale = savedTransform.rescaleY(yScale);

    svg.select<SVGGElement>('.x-axis').call(xAxis.scale(newXScale));
    svg.select<SVGGElement>('.y-axis').call(yAxis.scale(newYScale));
    svg.select<SVGGElement>('.x-grid').call(
      d3.axisBottom(newXScale).ticks(xTickCount).tickSize(-height + margin.top + margin.bottom).tickFormat(() => '')
    );
    svg.select<SVGGElement>('.y-grid').call(
      d3.axisLeft(newYScale).ticks(yTickCount).tickSize(-width + margin.left + margin.right).tickFormat(() => '')
    );
  }

  // Add points with better visual distinction to container (zoomable)
  const pointsGroup = container.append('g').attr('class', 'points-group');

  // Create a futuristic green color scale for points with more distinction
  const colorScale = d3.scaleSequential()
    .domain([0, points.length - 1])
    .interpolator(d3.interpolateRgbBasis([
      '#0a1f14', // Very dark green
      '#1a4a32', // Dark green
      '#22cc66', // Bright accent green
      '#5ae885', // Glow green
      '#6fff96', // Bright green
      '#44dd88', // Bright accent
      '#22cc66', // Back to accent
      '#1a4a32', // Dark green
    ]));

  // Calculate initial radius and stroke width based on current zoom transform
  const baseRadius = 6;
  const initialRadius = baseRadius / currentTransformRef.current.k;
  const baseStrokeWidth = 1;
  const initialStrokeWidth = baseStrokeWidth / currentTransformRef.current.k;

  pointsGroup.selectAll('circle')
    .data(points)
    .enter()
    .append('circle')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', initialRadius)
    .attr('fill', (_, i) => colorScale(i))
    .attr('opacity', 0.8)
    .attr('stroke', '#fff')
    .attr('stroke-width', initialStrokeWidth)
    .on('mouseover', (event, d) => {
      // Only show hover effects if no point is active
      if (!activePointRef.current) {
        onHoverPoint?.(d);

        // Highlight the point - adjust hover radius and stroke width based on current zoom scale
        const baseHoverRadius = 9;
        const adjustedHoverRadius = baseHoverRadius / currentTransformRef.current.k;
        const baseHoverStrokeWidth = 2;
        const adjustedHoverStrokeWidth = baseHoverStrokeWidth / currentTransformRef.current.k;
        d3.select(event.currentTarget)
          .attr('r', adjustedHoverRadius)
          .attr('stroke', '#44dd88')
          .attr('stroke-width', adjustedHoverStrokeWidth);

        // Show tooltip - get coordinates relative to SVG root
        const [x, y] = d3.pointer(event, svgRef.current);

        // Calculate available width for tooltip based on screen size
        const svgWidth = svgRef.current?.clientWidth || 0;
        const maxTooltipWidth = Math.min(300, svgWidth * 0.4);
        const wrapPadding = 8;
        const maxTitleTextWidth = maxTooltipWidth - wrapPadding * 2;

        // Build the prefix line
        const prefix = `#${d.index + 1}: `;

        // Wrap the title if it's too long
        const titleLines = wrapText(d.title, maxTitleTextWidth - getTextWidth(prefix));

        const lines: string[] = [];
        // Add title with prefix only on first line
        if (titleLines.length > 0) {
          lines.push(prefix + titleLines[0]);
          // Add remaining title lines with indentation
          for (let i = 1; i < titleLines.length; i++) {
            lines.push(' '.repeat(prefix.length) + titleLines[i]);
          }
        }

        // Add coordinates
        lines.push(`(${d.x.toFixed(3)}, ${d.y.toFixed(3)})`);

        tooltipText.selectAll('tspan').remove();
        lines.forEach((line, i) => {
          tooltipText.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? '0' : '1.2em')
            .text(line);
        });

        // Measure text and position tooltip
        const bbox = tooltipText.node()?.getBBox();
        const textNode = tooltipText.node();
        // Use getComputedTextLength for more accurate width measurement of each tspan
        let maxTextWidth = 0;
        if (textNode) {
          const tspans = textNode.querySelectorAll('tspan');
          tspans.forEach((tspan) => {
            const width = (tspan as SVGTSpanElement).getComputedTextLength();
            maxTextWidth = Math.max(maxTextWidth, width);
          });
        }

        // Calculate actual tooltip dimensions based on text measurement
        let actualTooltipWidth = 0;
        let actualTooltipHeight = 0;
        let tooltipXOffset = 0;
        let tooltipYOffset = 0;

        if (bbox) {
          const padding = 8;
          actualTooltipWidth = Math.max(bbox.width, maxTextWidth) + padding * 2;
          actualTooltipHeight = bbox.height + padding * 2;
          tooltipXOffset = bbox.x - padding;
          tooltipYOffset = bbox.y - padding;

          tooltipRect
            .attr('x', tooltipXOffset)
            .attr('y', tooltipYOffset)
            .attr('width', actualTooltipWidth)
            .attr('height', actualTooltipHeight);
        }

        // Position tooltip using the calculated dimensions
        if (actualTooltipWidth > 0) {
          const svgWidth = svgRef.current?.clientWidth || 0;
          const svgHeight = svgRef.current?.clientHeight || 0;

          // Define bounds considering margins - tooltip should stay within the plot area
          const minBoundX = margin.left;
          const maxBoundX = svgWidth - margin.right;
          const minBoundY = margin.top;
          const maxBoundY = svgHeight - margin.bottom;

          // Default offset (position tooltip to the right and slightly above cursor)
          let tooltipX = x + 15;
          let tooltipY = y - 15;

          // First, handle horizontal positioning
          const rightEdge = tooltipX + tooltipXOffset + actualTooltipWidth;

          if (rightEdge > maxBoundX) {
            // Try positioning to the left of cursor
            tooltipX = x - actualTooltipWidth - 15;
          }

          // Recalculate edges after potential repositioning
          const newRightEdge = tooltipX + tooltipXOffset + actualTooltipWidth;
          const newLeftEdge = tooltipX + tooltipXOffset;

          if (newLeftEdge < minBoundX) {
            tooltipX = minBoundX - tooltipXOffset;
          }
          if (newRightEdge > maxBoundX) {
            tooltipX = maxBoundX - actualTooltipWidth - tooltipXOffset;
          }

          // Now handle vertical positioning
          tooltipY = y - 15;

          // If above position doesn't fit, try below cursor
          if (tooltipY + tooltipYOffset < minBoundY || tooltipY + tooltipYOffset + actualTooltipHeight > maxBoundY) {
            tooltipY = y + 15;
          }

          // If neither above nor below works perfectly, find the best position
          if (tooltipY + tooltipYOffset < minBoundY || tooltipY + tooltipYOffset + actualTooltipHeight > maxBoundY) {
            const overflowTop = Math.max(0, minBoundY - (tooltipY + tooltipYOffset));
            const overflowBottom = Math.max(0, tooltipY + tooltipYOffset + actualTooltipHeight - maxBoundY);

            if (overflowTop > 0 && overflowBottom > 0) {
              // Tooltip doesn't fit at all in vertical direction
              // Center it vertically
              tooltipY = Math.max(minBoundY, (maxBoundY - actualTooltipHeight - tooltipYOffset) / 2);
            } else if (overflowTop > 0) {
              // Tooltip extends beyond top edge
              tooltipY = minBoundY - tooltipYOffset;
            } else if (overflowBottom > 0) {
              // Tooltip extends beyond bottom edge
              tooltipY = maxBoundY - actualTooltipHeight - tooltipYOffset;
            }
          }

          // Final clamp to ensure tooltip stays within bounds
          const minY = minBoundY - tooltipYOffset;
          const maxY = maxBoundY - actualTooltipHeight - tooltipYOffset;
          tooltipY = Math.max(minY, Math.min(tooltipY, maxY));

          tooltip
            .attr('transform', `translate(${tooltipX},${tooltipY})`)
            .transition()
            .duration(200)
            .style('opacity', 1);
        } else {
          // Fallback to original positioning if measurement fails
          tooltip
            .attr('transform', `translate(${x + 15},${y - 15})`)
            .transition()
            .duration(200)
            .style('opacity', 1);
        }
      }
    })
    .on('mouseout', (event) => {
      // Only restore hover effects if no point is active
      if (!activePointRef.current) {
        onHoverPoint?.(null);

        // Restore point appearance - adjust radius and stroke width based on current zoom scale
        const baseRadius = 6;
        const adjustedRadius = baseRadius / currentTransformRef.current.k;
        const baseStrokeWidth = 1;
        const adjustedStrokeWidth = baseStrokeWidth / currentTransformRef.current.k;
        d3.select(event.currentTarget)
          .attr('r', adjustedRadius)
          .attr('stroke', '#fff')
          .attr('stroke-width', adjustedStrokeWidth);

        // Hide tooltip
        tooltip.transition()
          .duration(200)
          .style('opacity', 0);
      }
    })
    .on('click', (event, d) => {
      // Toggle active point - if clicking the same point, deactivate it
      if (activePointRef.current && activePointRef.current.index === d.index) {
        onActivePointChange(null);
        onHoverPoint?.(null);
        activePointData = null;

        // Restore all points to normal appearance
        const baseRadius = 6;
        const adjustedRadius = baseRadius / currentTransformRef.current.k;
        const baseStrokeWidth = 1;
        const adjustedStrokeWidth = baseStrokeWidth / currentTransformRef.current.k;

        d3.selectAll('.points-group circle')
          .attr('r', adjustedRadius)
          .attr('stroke', '#fff')
          .attr('stroke-width', adjustedStrokeWidth);

        // Hide tooltip
        tooltip.transition()
          .duration(200)
          .style('opacity', 0);
      } else {
        // Set new active point
        onActivePointChange(d);
        onHoverPoint?.(d);
        activePointData = d;

        // Highlight the active point with a different color
        const baseActiveRadius = 9;
        const adjustedActiveRadius = baseActiveRadius / currentTransformRef.current.k;
        const baseActiveStrokeWidth = 2;
        const adjustedActiveStrokeWidth = baseActiveStrokeWidth / currentTransformRef.current.k;

        // Reset all points first
        const baseRadius = 6;
        const adjustedRadius = baseRadius / currentTransformRef.current.k;
        const baseStrokeWidth = 1;
        const adjustedStrokeWidth = baseStrokeWidth / currentTransformRef.current.k;

        d3.selectAll('.points-group circle')
          .attr('r', adjustedRadius)
          .attr('stroke', '#fff')
          .attr('stroke-width', adjustedStrokeWidth);

        // Highlight the clicked point
        d3.select(event.currentTarget)
          .attr('r', adjustedActiveRadius)
          .attr('stroke', '#22cc66') // Bright green for active point
          .attr('stroke-width', adjustedActiveStrokeWidth);

        // Show tooltip for active point using the helper function
        updateTooltipPosition(d, currentTransformRef.current, true);
      }

      // Prevent event bubbling
      event.stopPropagation();
    });

  // Restore active point visualization if there was one (e.g., after resize)
  if (activePointRef.current) {
    const activePoint = activePointRef.current;
    activePointData = activePoint;

    // Find and highlight the active point
    const baseActiveRadius = 9;
    const adjustedActiveRadius = baseActiveRadius / currentTransformRef.current.k;
    const baseActiveStrokeWidth = 2;
    const adjustedActiveStrokeWidth = baseActiveStrokeWidth / currentTransformRef.current.k;

    // Reset all points first
    const baseRadius = 6;
    const adjustedRadius = baseRadius / currentTransformRef.current.k;
    const baseStrokeWidth = 1;
    const adjustedStrokeWidth = baseStrokeWidth / currentTransformRef.current.k;

    container.selectAll('.points-group circle')
      .attr('r', adjustedRadius)
      .attr('stroke', '#fff')
      .attr('stroke-width', adjustedStrokeWidth);

    // Highlight the active point by finding it in the data
    container.selectAll('.points-group circle')
      .filter((d: unknown) => (d as Point2D).index === activePoint.index)
      .attr('r', adjustedActiveRadius)
      .attr('stroke', '#22cc66')
      .attr('stroke-width', adjustedActiveStrokeWidth);

    // Show tooltip for active point
    updateTooltipPosition(activePoint, currentTransformRef.current, true);
  }

  // Return cleanup function and current dimensions
  const cleanup = () => {
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();
    }
  };

  return { cleanup, width, height };
};

/**
 * Clears active point visualization when clicking on SVG background.
 * Resets all points to normal appearance and hides tooltip.
 */
export const clearActivePointVisualization = (
  svgRef: RefObject<SVGSVGElement | null>,
  currentTransformRef: RefObject<d3.ZoomTransform>
): void => {
  if (!svgRef.current) return;

  const svg = d3.select(svgRef.current);
  const zoomContainer = svg.select('.zoom-container');
  if (zoomContainer.size() > 0) {
    const transform = currentTransformRef.current;
    const baseRadius = 6;
    const adjustedRadius = baseRadius / transform.k;
    const baseStrokeWidth = 1;
    const adjustedStrokeWidth = baseStrokeWidth / transform.k;

    zoomContainer.selectAll('.points-group circle')
      .attr('r', adjustedRadius)
      .attr('stroke', '#fff')
      .attr('stroke-width', adjustedStrokeWidth);

    // Hide tooltip
    svg.select('.tooltip')
      .transition()
      .duration(200)
      .style('opacity', 0);
  }
};