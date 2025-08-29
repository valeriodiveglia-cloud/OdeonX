// Restituisce l'UOM canonico e il moltiplicatore
export interface NormalizedUom {
  uom: 'gr' | 'ml' | 'unit';
  factor: number; // moltiplicatore per qty
}

export function normalizeUom(raw: string): NormalizedUom {
  const key = raw.trim().toLowerCase();
  switch (key) {
    // massa
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return { uom: 'gr', factor: 1000 };
    case 'g':
    case 'gram':
    case 'grams':
    case 'gr':
      return { uom: 'gr', factor: 1 };

    // volume
case 'l':
case 'lt':
case 'liter':
case 'liters':
  return { uom: 'ml', factor: 1000 };
case 'dl':
  return { uom: 'ml', factor: 100 };
case 'cl':
  return { uom: 'ml', factor: 10 };
case 'ml':
  return { uom: 'ml', factor: 1 };


    // pezzi
    case 'pc':
    case 'pcs':
    case 'piece':
    case 'pieces':
    case 'unit':
    case 'units':
      return { uom: 'unit', factor: 1 };

    default:
      return { uom: 'unit', factor: 1 };
  }
}
