export type Face = 'open' | 'blink' | 'chomp' | 'dizzy';
export type Gaze = 'centre' | 'up' | 'down' | 'left' | 'right';
export type Wing = 0 | 1;

export const SPRITE_PX: number;
export const PALETTE: Readonly<Record<string, string>>;

/** A 12×12 grid of palette keys ('.' is transparent). */
export function agentGrid(opts?: { wing?: Wing; face?: Face; gaze?: Gaze }): string[][];
