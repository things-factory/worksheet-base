import { activateUnloading } from './activate-unloading'
import { activateVas } from './activate-vas'
import { completeUnloading } from './complete-unloading'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { generateArrivalNoticeWorksheet } from './generate-arrival-notice-worksheet'
import { unloadWorksheetResolver } from './unload-worksheet'
import { updateWorksheet } from './update-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'

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
  ...activateUnloading,
  ...activateVas,
  ...completeUnloading
}
