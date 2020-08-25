import { generateArrivalNoticeWorksheetResolver } from './generate-arrival-notice-worksheet'
import { generateReleaseGoodWorksheetResolver } from './generate-release-good-worksheet'

export const Mutation = {
  ...generateArrivalNoticeWorksheetResolver,
  ...generateReleaseGoodWorksheetResolver
}
