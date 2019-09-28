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
import { unloadedInventories } from './unloaded-inventories'
import { unload } from './unload'
import { putaway } from './putaway'
import { undoPutaway } from './undo-putaway'
import { executeVas } from './execute-vas'
import { undoVas } from './undo-vas'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...putawayWorksheetResolver,
  ...vasWorksheetResolver,
  ...unloadedInventories
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet,
  ...generateArrivalNoticeWorksheet,
  ...activateUnloading,
  ...activatePutaway,
  ...activateVas,
  ...unload,
  ...completeUnloading,
  ...putaway,
  ...undoPutaway,
  ...completePutaway,
  ...executeVas,
  ...undoVas,
  ...completeVas
}
