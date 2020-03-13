import { activatePicking } from './activate-picking'
import { activatePutaway } from './activate-putaway'
import { activateUnloading } from './activate-unloading'
import { activateLoadingResolver } from './activate-loading'
import { activateReturnResolver } from './activate-return'
import { activateVas } from './activate-vas'
import { completePicking } from './complete-picking'
import { completePutaway } from './complete-putaway'
import { completeLoading } from './complete-loading'
import { completeUnloading } from './complete-unloading'
import { completeVas } from './complete-vas'
import { completeReturn } from './complete-return'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { executeVas } from './execute-vas'
import { generateArrivalNoticeWorksheet } from './generate-arrival-notice-worksheet'
import { generateReleaseGoodWorksheet } from './generate-release-good-worksheet'
import { generateVasOrderWorksheet } from './generate-vas-order-worksheet'
import { loading } from './loading'
import { undoLoading } from './undo-loading'
import { picking } from './picking'
import { pickingWorksheetResolver } from './picking-worksheet'
import { putaway } from './putaway'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { transfer } from './transfer'
import { undoUnloading } from './undo-unloading'
import { undoVas } from './undo-vas'
import { unload } from './unload'
import { returning } from './returning'
import { unloadedInventories } from './unloaded-inventories'
import { loadedInventories } from './loaded-inventories'
import { unloadingWorksheetResolver } from './unloading-worksheet'
import { deliveryOrderByWorksheetResolver } from './delivery-order-by-worksheet'
import { updateWorksheet } from './update-worksheet'
import { loadingWorksheetResolver } from './loading-worksheet'
import { vasWorksheetResolver } from './vas-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'
import { returnWorksheetResolver } from './return-worksheet'
import { proceedExtraProductsResolver } from './proceed-extra-products'
import { replacePickingPalletsResolver } from './replace-picking-pallets'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...deliveryOrderByWorksheetResolver,
  ...putawayWorksheetResolver,
  ...returnWorksheetResolver,
  ...pickingWorksheetResolver,
  ...vasWorksheetResolver,
  ...loadingWorksheetResolver,
  ...unloadedInventories,
  ...loadedInventories
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
  ...activateLoadingResolver,
  ...activateReturnResolver,
  ...activateVas,
  ...activatePicking,
  ...unload,
  ...returning,
  ...undoUnloading,
  ...completeUnloading,
  ...completeLoading,
  ...completeReturn,
  ...putaway,
  ...loading,
  ...undoLoading,
  ...transfer,
  ...completePutaway,
  ...picking,
  ...completePicking,
  ...executeVas,
  ...undoVas,
  ...completeVas,
  ...proceedExtraProductsResolver,
  ...replacePickingPalletsResolver
}
