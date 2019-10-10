import { activatePicking } from './activate-picking'
import { activatePutaway } from './activate-putaway'
import { activateUnloading } from './activate-unloading'
import { activateVas } from './activate-vas'
import { completePutaway } from './complete-putaway'
import { completeUnloading } from './complete-unloading'
import { completePicking } from './complete-picking'
import { completeVas } from './complete-vas'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { executeVas } from './execute-vas'
import { generateArrivalNoticeWorksheet } from './generate-arrival-notice-worksheet'
import { generateReleaseGoodWorksheet } from './generate-release-good-worksheet'
import { generateVasOrderWorksheet } from './generate-vas-order-worksheet'
import { picking } from './picking'
import { pickingWorksheetResolver } from './picking-worksheet'
import { putaway } from './putaway'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { transfer } from './transfer'
import { undoUnloading } from './undo-unloading'
import { undoVas } from './undo-vas'
import { unload } from './unload'
import { unloadedInventories } from './unloaded-inventories'
import { unloadingWorksheetResolver } from './unloading-worksheet'
import { updateWorksheet } from './update-worksheet'
import { vasWorksheetResolver } from './vas-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...putawayWorksheetResolver,
  ...pickingWorksheetResolver,
  ...vasWorksheetResolver,
  ...unloadedInventories
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet,
  ...generateArrivalNoticeWorksheet,
  ...generateReleaseGoodWorksheet,
  ...generateVasOrderWorksheet,
  ...activateUnloading,
  ...activatePutaway,
  ...activateVas,
  ...activatePicking,
  ...unload,
  ...undoUnloading,
  ...completeUnloading,
  ...putaway,
  ...transfer,
  ...completePutaway,
  ...picking,
  ...completePicking,
  ...executeVas,
  ...undoVas,
  ...completeVas
}
