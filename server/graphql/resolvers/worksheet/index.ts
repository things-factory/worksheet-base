import { activateUnloading } from './activate-unloading'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { generateArrivalNoticeWorksheet } from './generate-arrival-notice-worksheet'
import { updateWorksheet } from './update-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'
import { unloadWorksheetResolver } from './unload-worksheet'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadWorksheetResolver
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet,
  ...generateArrivalNoticeWorksheet,
  ...activateUnloading
}
