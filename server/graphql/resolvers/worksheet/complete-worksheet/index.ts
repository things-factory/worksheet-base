/* Inbound */
import { completePreunloadResolver } from './complete-preunload'
import { completeUnloadingResolver } from './complete-unloading'
import { completeUnloadingPartiallyResolver } from './complete-unloading-partially'
import { completePutawayResolver } from './complete-putaway'

/* Outbound */
import { completePickingResolver } from './complete-picking'
import { completeLoadingResolver } from './complete-loading'
import { completeReturnResolver } from './complete-return'

/* VAS */
import { completeVasResolver } from './complete-vas'

/* Inspection */
import { completeInspectionResolver } from './complete-inspection'

export const Mutations = {
  /* Inbound */
  ...completePreunloadResolver,
  ...completeUnloadingResolver,
  ...completeUnloadingPartiallyResolver,
  ...completePutawayResolver,

  /* Outbound */
  ...completePickingResolver,
  ...completeLoadingResolver,
  ...completeReturnResolver,

  /* VAS */
  ...completeVasResolver,

  /* Inspection */
  ...completeInspectionResolver
}
