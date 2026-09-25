/**
 * Point représentatif d'une géométrie GeoJSON ([lon, lat]), situé SUR
 * l'objet : à l'intérieur d'un polygone, sur une ligne. Jamais le centroïde
 * ni le centre du rectangle englobant, qui tombent dehors pour un parc en
 * croissant ou un espace protégé en plusieurs morceaux.
 *
 * Polygone : même méthode que GEOS (InteriorPointArea, point_on_surface de
 * shapely et PostGIS). On coupe chaque polygone par une horizontale placée à
 * mi-hauteur, entre deux sommets (jamais sur un sommet, ce qui évite les cas
 * ambigus), et on prend le milieu du plus long segment intérieur, trous
 * compris. Déterministe : mêmes coordonnées, même point.
 */

/**
 * @param {{ type: string, coordinates: any }} geometry
 * @returns {[number, number] | null} [lon, lat]
 */
export function pointOnSurface(geometry) {
  switch (geometry?.type) {
    case 'Point':
      return geometry.coordinates;
    case 'MultiPoint':
      return geometry.coordinates[0] ?? null;
    case 'LineString':
      return pointOnLine(geometry.coordinates);
    case 'MultiLineString':
      return pointOnLine(longest(geometry.coordinates, lineLength));
    case 'Polygon':
      return interiorPoint([geometry.coordinates]);
    case 'MultiPolygon':
      return interiorPoint(geometry.coordinates);
    default:
      return null;
  }
}

function lineLength(line) {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return total;
}

function longest(items, measure) {
  let best = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const value = measure(item);
    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

/** Point situé à mi-longueur de la ligne. */
function pointOnLine(line) {
  if (!line?.length) return null;
  let remaining = lineLength(line) / 2;
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1];
    const [x2, y2] = line[i];
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d > 0 && remaining <= d) {
      const t = remaining / d;
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    remaining -= d;
  }
  return line[0];
}

/**
 * Horizontale de coupe d'un polygone : à mi-chemin entre les deux sommets de
 * l'anneau extérieur les plus proches (au-dessous et au-dessus) du milieu de
 * sa hauteur.
 */
function scanLineY(shell) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of shell) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const centreY = (minY + maxY) / 2;
  let loY = minY;
  let hiY = maxY;
  for (const [, y] of shell) {
    if (y <= centreY) {
      if (y > loY) loY = y;
    } else if (y < hiY) hiY = y;
  }
  return (loY + hiY) / 2;
}

/** Abscisses où l'horizontale y coupe les anneaux du polygone, triées. */
function crossings(rings, y) {
  const xs = [];
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [x1, y1] = ring[i - 1];
      const [x2, y2] = ring[i];
      if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  return xs.sort((a, b) => a - b);
}

/**
 * @param {number[][][][]} polygons liste de polygones (anneau extérieur puis trous)
 * @returns {[number, number] | null}
 */
function interiorPoint(polygons) {
  let best = null;
  let bestWidth = -1;
  for (const rings of polygons) {
    const shell = rings[0];
    if (!shell?.length) continue;
    const y = scanLineY(shell);
    const xs = crossings(rings, y);
    // Segments intérieurs : entre la 1re et la 2e intersection, la 3e et la 4e…
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i];
      if (width > bestWidth) {
        bestWidth = width;
        best = [(xs[i] + xs[i + 1]) / 2, y];
      }
    }
  }
  if (best) return best;
  // Polygone dégénéré (surface nulle) : un de ses sommets.
  return polygons.find((rings) => rings[0]?.length)?.[0][0] ?? null;
}
