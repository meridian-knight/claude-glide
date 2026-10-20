export const TOKEN_PALETTE: Readonly<Record<string, string>>;

/** A 12×12 grid of palette keys ('.' is transparent); frame 1 is the pulse. */
export function tokenGrid(frame?: 0 | 1): string[][];
