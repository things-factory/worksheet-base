/* Inbound */
import { generateArrivalNoticeWorksheetResolver } from './generate-arrival-notice-worksheet'
import { generatePutawayWorksheetResolver } from './generate-putaway-worksheet'
import { generatePartialPutawayWorksheetResolver } from './generate-partial-putaway-worksheet'

/* Outbond */
import { generateReleaseGoodWorksheetResolver } from './generate-release-good-worksheet'

/* VAS */
import { generateVasOrderWorksheetResolver } from './generate-vas-order-worksheet'

/* Inspection */
import { generateCycleCountWorksheetResolver } from './generate-cycle-count-worksheet'

export const Mutations = {
  /* Inbound */
  ...generateArrivalNoticeWorksheetResolver,
  ...generatePutawayWorksheetResolver,
  ...generatePartialPutawayWorksheetResolver,

  /* Outbond */
  ...generateReleaseGoodWorksheetResolver,

  /* VAS */
  ...generateVasOrderWorksheetResolver,

  /* Inspection */
  ...generateCycleCountWorksheetResolver
}
