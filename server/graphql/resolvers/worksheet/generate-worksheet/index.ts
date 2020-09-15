import { generateArrivalNoticeWorksheetResolver } from './generate-arrival-notice-worksheet'
import { generateCycleCountWorksheetResolver } from './generate-cycle-count-worksheet'
import { generatePartialPutawayWorksheetResolver } from './generate-partial-putaway-worksheet'
import { generatePutawayWorksheetResolver } from './generate-putaway-worksheet'
import { generateReleaseGoodWorksheetResolver } from './generate-release-good-worksheet'
import { generateVasOrderWorksheetResolver } from './generate-vas-order-worksheet'

export const Mutations = {
  ...generateArrivalNoticeWorksheetResolver,
  ...generateCycleCountWorksheetResolver,
  ...generatePartialPutawayWorksheetResolver,
  ...generatePutawayWorksheetResolver,
  ...generateReleaseGoodWorksheetResolver,
  ...generateVasOrderWorksheetResolver
}
