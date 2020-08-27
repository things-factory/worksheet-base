/* Inbound */
import { activateUnloadingResolver } from './activate-unloading'
import { activatePutawayResolver } from './activate-putaway'

/* Outbound */
import { activatePickingResolver } from './activate-picking'
import { activateLoadingResolver } from './activate-loading'

/* VAS */
import { activateVasResolver } from './activate-vas'

/* Inspection */
import { activateCycleCountResolver } from './activate-cycle-count'

export const Mutations = {
  /* Inbound */
  ...activateUnloadingResolver,
  ...activatePutawayResolver,

  /* Outbound */
  ...activatePickingResolver,
  ...activateLoadingResolver,

  /* VAS */
  ...activateVasResolver,

  /* Inspection */
  ...activateCycleCountResolver
}
