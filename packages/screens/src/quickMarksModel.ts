/** How many marks the quick-event panel holds (a 3x3 grid, spec S03-E). */
export const PANEL_LIMIT = 9;

/** Moves the mark at `index` one place up (-1) or down (+1); the ends stay where they are. */
export function moveInOrder(order: readonly string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return [...order];
  }
  const next = [...order];
  const moved = next[index];
  const other = next[target];
  if (moved === undefined || other === undefined) {
    return next;
  }
  next[index] = other;
  next[target] = moved;
  return next;
}

/** Adds a mark at the end of the panel unless it is there already or the panel is full. */
export function addToOrder(order: readonly string[], id: string): string[] {
  return order.includes(id) || order.length >= PANEL_LIMIT ? [...order] : [...order, id];
}

export function removeFromOrder(order: readonly string[], id: string): string[] {
  return order.filter((item) => item !== id);
}

export function panelIsFull(order: readonly string[]): boolean {
  return order.length >= PANEL_LIMIT;
}

/** The three rows of the panel as the owner will see them, empty slots included. */
export function panelRows(order: readonly string[]): (string | null)[][] {
  const cells: (string | null)[] = Array.from({ length: PANEL_LIMIT }, (_, i) => order[i] ?? null);
  return [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)];
}
