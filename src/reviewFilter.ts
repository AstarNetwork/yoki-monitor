// Pure filter helper for the operator review view. Kept in its own
// module so the active/cleared toggle logic is unit-testable without
// dragging React into the test surface.

export type ReviewFilter = "active" | "cleared" | "all";

type Clearable = { cleared: boolean };

export function applyFilter<T extends Clearable>(items: T[], filter: ReviewFilter): T[] {
  switch (filter) {
    case "active":
      return items.filter((i) => !i.cleared);
    case "cleared":
      return items.filter((i) => i.cleared);
    case "all":
      return items;
  }
}
