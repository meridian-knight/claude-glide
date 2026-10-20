/**
 * Every tuning value in one place. Units: world units (the world is
 * WORLD_W × WORLD_H, origin top-left, y down), seconds, and world units per
 * second. Nothing here knows about pixels or screens, so flight feel and
 * difficulty are identical on every device.
 */

// World
export const WORLD_W = 240;
export const WORLD_H = 320;
/** Top of the ground band; the agent dies when its hitbox reaches it. */
export const GROUND_Y = 296;

// Simulation step
export const STEP_HZ = 120;
export const STEP_MS = 1000 / STEP_HZ;
export const DT = 1 / STEP_HZ;

// Agent (a 12×12 sprite drawn at 2 units per sprite pixel)
export const AGENT_W = 24;
export const AGENT_H = 24;
/** Horizontal centre of the agent; it never moves sideways. */
export const AGENT_X = 56;
export const AGENT_START_Y = 140;
/** Hitbox inset from the sprite box on every side (16×16 hitbox): fair, never surprising. */
export const HITBOX_INSET = 4;

// Flight
export const GRAVITY = 900;
/** Vertical velocity set by a flap (negative is up). Apex ≈ 38 units after 0.29 s. */
export const FLAP_VY = -260;
export const MAX_FALL_VY = 420;

// Obstacles ("stacks")
export const OB_W = 40;
/** Distance between the left edges of consecutive stacks. */
export const OB_SPACING = 144;
/** Where the first stack waits when a run starts (reaches the agent after ≈2.5 s of flight). */
export const FIRST_OB_X = WORLD_W + 60;
export const GAP_H_START = 100;
/** Floor for the gap: 3.5 agent heights, reached at 32 points. */
export const GAP_H_MIN = 84;
export const GAP_SHRINK_PER_POINT = 0.5;
/** Smallest distance from a gap edge to the ceiling or the ground. */
export const GAP_MARGIN = 24;
/** Largest change of gap centre between consecutive stacks (keeps every gap reachable). */
export const MAX_GAP_DELTA = 80;
/** The first stack's gap stays close to the agent's start height. */
export const FIRST_GAP_DELTA = 40;

// Speed ramp (by score only; set SPEED_PER_POINT to 0 for a flat speed)
export const SPEED_START = 96;
export const SPEED_PER_POINT = 1.6;
export const SPEED_MAX = 128;

// Loop and UI timing (milliseconds)
/** A frame longer than this is clamped so a hitch never drops the agent far without input. */
export const MAX_FRAME_MS = 100;
export const MAX_STEPS_PER_FRAME = 12;
/** How long the death animation plays before the game-over overlay opens. */
export const OVER_OVERLAY_DELAY_MS = 450;
/** After a death, Restart is ignored for this long so a mash never restarts by accident. */
export const RESTART_LOCKOUT_MS = 600;
/** Idle hover bob before the first flap (visual only; the sim does not move). */
export const HOVER_BOB_AMP = 4;
export const HOVER_BOB_HZ = 1;
