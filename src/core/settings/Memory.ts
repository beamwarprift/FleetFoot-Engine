// What FleetFoot Engine remembers between visits: nothing, one speed for every site,
// or a profile per site. The default remembers one number and no address.

export const MEMORY_MODES = ['none', 'global', 'site'] as const;

export type MemoryMode = (typeof MEMORY_MODES)[number];

export const DEFAULT_MEMORY: MemoryMode = 'global';
