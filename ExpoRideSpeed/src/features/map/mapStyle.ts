import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { theme } from '../../lib/theme';
import upstream from './styles/openfreemap-liberty.json';

export const mapAttribution = '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const nameFields = new Set(['name', 'name:en', 'name_en', 'name:th', 'name:latin', 'name:nonlatin']);
function hasNameField(value: unknown): boolean {
  return Array.isArray(value) && (value[0] === 'get' && nameFields.has(value[1]) || value.some(hasNameField));
}
// Both pinned renderers understand this v8 subset; their newer font-face types differ.
export type MapStyle = Omit<StyleSpecification, 'font-faces'>;
export function createMapStyle(mode: 'dark' | 'light', locale: 'th' | 'en'): MapStyle {
  const style = JSON.parse(JSON.stringify(upstream)) as StyleSpecification;
  const palette = theme.map[mode];
  style.name = `Ride Speed ${mode} ${locale}`;
  style.metadata = { ...(style.metadata as Record<string, unknown> | undefined), 'ride:style-source': 'OpenFreeMap Liberty', 'ride:locale': locale };
  style.transition = { duration: 0, delay: 0 };
  delete style['font-faces'];
  // The upstream low-zoom shaded raster would introduce uncontrolled colors.
  delete style.sources.ne2_shaded;
  const source = style.sources.openmaptiles;
  if (source.type === 'vector') source.attribution = mapAttribution;
  const field: ExpressionSpecification = locale === 'th'
    ? ['coalesce', ['get', 'name:th'], ['get', 'name:nonlatin'], ['get', 'name'], ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name'], ['get', 'name:th'], ['get', 'name:nonlatin']];
  style.layers = style.layers.filter(layer => !('source' in layer && layer.source === 'ne2_shaded')).map(layer => {
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : '';
    const result = layer as LayerSpecification;
    switch (result.type) {
      case 'background': result.paint = { ...result.paint, 'background-color': palette.background }; break;
      case 'fill':
        result.paint = { ...result.paint, 'fill-color': sourceLayer === 'building' ? palette.building : sourceLayer === 'water' ? palette.water : palette.land, 'fill-outline-color': sourceLayer === 'building' ? palette.roadCasing : palette.land };
        delete result.paint['fill-pattern'];
        break;
      case 'fill-extrusion': result.paint = { ...result.paint, 'fill-extrusion-color': palette.building }; break;
      case 'line': {
        const road = sourceLayer === 'transportation';
        const casing = /casing|outline/.test(result.id);
        const major = /motorway|trunk|primary|major/.test(result.id);
        result.paint = { ...result.paint, 'line-color': sourceLayer === 'waterway' ? palette.roadCasing : road ? casing ? palette.roadCasing : major ? palette.majorRoad : palette.road : palette.boundary };
        delete result.paint['line-pattern'];
        break;
      }
      case 'symbol': {
        result.paint = { ...result.paint, 'text-color': /country|city|town|highway/.test(result.id) ? palette.label : palette.secondaryLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
        if (result.layout && hasNameField(result.layout['text-field'])) result.layout = { ...result.layout, 'text-field': field,
          ...(locale === 'th' ? { 'text-letter-spacing': 0, 'text-line-height': theme.typography.thaiLeading } : {}) };
        break;
      }
    }
    return result;
  });
  return style;
}
