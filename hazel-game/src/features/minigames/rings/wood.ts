import type { TreeId } from '../../../lib/minigames/rings';

/** Ringwood's Rings' wood colours: a ring's wood, its dark edge (latewood), bark; and each tree's own. */
export const WOOD = '#ecc995';
export const LATE = '#9a6233';
export const BARK = '#5b3a24';

/** Each tree's wood and bark, so its page looks like it. */
export const TREE_TINT: Record<TreeId, { wood: string; bark: string }> = {
  birch: { wood: '#f3e2c0', bark: '#e9e4da' },
  willow: { wood: '#efd9b0', bark: '#7d6a4f' },
  beech: { wood: '#efcf9f', bark: '#8f8a83' },
  rowan: { wood: '#e8c38f', bark: '#6b5a49' },
  oak: { wood: '#dcb27a', bark: '#4f3a28' },
  pine: { wood: '#f0cf8e', bark: '#7a4b2d' },
  yew: { wood: '#d9925c', bark: '#7b3f2a' },
  sequoia: { wood: '#d98a63', bark: '#8a3d22' },
};
