import { activateLoadingResolver } from './activate-loading'
import { activatePicking } from './activate-picking'
import { activatePutaway } from './activate-putaway'
import { activateReturnResolver } from './activate-return'
import { activateUnloading } from './activate-unloading'
import { activateVas } from './activate-vas'
import { completeLoading } from './complete-loading'
import { completePicking } from './complete-picking'
import { completePutaway } from './complete-putaway'
import { completeReturn } from './complete-return'
import { completeUnloading } from './complete-unloading'
import { completeUnloadingPartiallyResolver } from './complete-unloading-partially'
import { completeVas } from './complete-vas'
import { confirmCancellationReleaseOrder } from './confirm-cancellation-release-order'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { deliveryOrderByWorksheetResolver } from './delivery-order-by-worksheet'
import { executeVas } from './execute-vas'
import { generateArrivalNoticeWorksheet } from './generate-arrival-notice-worksheet'
import { generatePartialPutawayWorksheetResolver } from './generate-partial-putaway-worksheet'
import { generatePutawayWorksheetResolver } from './generate-putaway-worksheet'
import { generateReleaseGoodWorksheet } from './generate-release-good-worksheet'
import { generateVasOrderWorksheet } from './generate-vas-order-worksheet'
import { loadedInventories } from './loaded-inventories'
import { loading } from './loading'
import { loadingWorksheetResolver } from './loading-worksheet'
import { pendingCancellationReleaseOrder } from './pending-cancellation-release-order'
import { picking } from './picking'
import { pickingWorksheetResolver } from './picking-worksheet'
import { proceedExtraProductsResolver } from './proceed-extra-products'
import { putaway } from './putaway'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { replacePickingPalletsResolver } from './replace-picking-pallets'
import { returnWorksheetResolver } from './return-worksheet'
import { returning } from './returning'
import { transfer } from './transfer'
import { undoLoading } from './undo-loading'
import { undoUnloading } from './undo-unloading'
import { undoVas } from './undo-vas'
import { undoPutaway } from './undo-putaway'
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
  ...deliveryOrderByWorksheetResolver,
  ...putawayWorksheetResolver,
  ...returnWorksheetResolver,
  ...pickingWorksheetResolver,
  ...vasWorksheetResolver,
  ...loadingWorksheetResolver,
  ...unloadedInventories,
  ...loadedInventories,
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet,
  ...generateArrivalNoticeWorksheet,
  ...generatePutawayWorksheetResolver,
  ...generatePartialPutawayWorksheetResolver,
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
  ...undoPutaway,
  ...completeUnloading,
  ...completeUnloadingPartiallyResolver,
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
  ...replacePickingPalletsResolver,
  ...pendingCancellationReleaseOrder,
  ...confirmCancellationReleaseOrder,
}
