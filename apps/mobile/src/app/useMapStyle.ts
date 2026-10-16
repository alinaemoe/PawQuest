import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
let styleCache: StyleSpecification | null = null;

/** The OpenFreeMap style, fetched once and kept; `failed` when the network says no (G-13). */
export function useMapStyle(): { style: StyleSpecification | null; failed: boolean } {
  const [style, setStyle] = useState<StyleSpecification | null>(styleCache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (styleCache !== null) {
      return;
    }
    fetch(STYLE_URL)
      .then((r) => r.json() as Promise<StyleSpecification>)
      .then((loaded) => {
        styleCache = loaded;
        setStyle(loaded);
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);
  return { style, failed };
}
