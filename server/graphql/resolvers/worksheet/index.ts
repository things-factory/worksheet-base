import { activatePutaway } from './activate-putaway'
import { activateUnloading } from './activate-unloading'
import { activateVas } from './activate-vas'
import { completePutaway } from './complete-putaway'
import { completeUnloading } from './complete-unloading'
import { completeVas } from './complete-vas'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { generateArrivalNoticeWorksheet } from './generate-arrival-notice-worksheet'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { unloadingWorksheetResolver } from './unloading-worksheet'
import { updateWorksheet } from './update-worksheet'
import { vasWorksheetResolver } from './vas-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'
import { putaway } from './putaway'
import { undoPutaway } from './undo-putaway'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...putawayWorksheetResolver,
  ...vasWorksheetResolver
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet,
  ...generateArrivalNoticeWorksheet,
  ...activateUnloading,
  ...activatePutaway,
  ...activateVas,
  ...completeUnloading,
  ...completePutaway,
  ...completeVas,
  ...putaway,
  ...undoPutaway
}
