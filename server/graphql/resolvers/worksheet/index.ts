import { Mutations as ActivateWorksheetMutations } from './activate-worksheet'
import { Mutations as CompleteWorksheetMutations } from './complete-worksheet'
import { confirmCancellationReleaseOrder } from './confirm-cancellation-release-order'
import { createWorksheet } from './create-worksheet'
import { crossDockPickingResolver } from './cross-dock-picking'
import { cycleCountAdjustment } from './cycle-count-adjustment'
import { cycleCountWorksheetResolver } from './cycle-count-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { deliveryOrderByWorksheetResolver } from './delivery-order-by-worksheet'
import { editBatchNo } from './edit-batch-no'
import { Mutations as GenerateWorksheetMutations } from './generate-worksheet'
import { havingVasResolver } from './having-vas'
import { inspecting } from './inspecting'
import { inventoriesByPalletResolver } from './inventories-by-pallet'
import { loadedInventories } from './loaded-inventories'
import { loading } from './loading'
import { loadingWorksheetResolver } from './loading-worksheet'
import { pendingCancellationReleaseOrder } from './pending-cancellation-release-order'
import { Mutations as PickingMutations } from './picking'
import { pickingWorksheetResolver } from './picking-worksheet'
import { preunloadWorksheetResolver } from './preunload-worksheet'
import { proceedEditedBatchResolver } from './proceed-edited-batch'
import { proceedExtraProductsResolver } from './proceed-extra-products'
import { Mutations as PutawayMutations } from './putaway'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { rejectCancellationReleaseOrder } from './reject-cancellation-release-order'
import { replacePickingPalletsResolver } from './replace-picking-pallets'
import { returnWorksheetResolver } from './return-worksheet'
import { returning } from './returning'
import { submitAdjustmentForApprovalResolver } from './submit-adjustment-for-approval'
import { transfer } from './transfer'
import { undoInspection } from './undo-inspection'
import { undoLoading } from './undo-loading'
import { Mutations as UnloadingMutations } from './unload'
import { unloadedInventories } from './unloaded-inventories'
import { unloadingWorksheetResolver } from './unloading-worksheet'
import { updateWorksheet } from './update-worksheet'
import { Mutations as VasMutations } from './vas'
import { vasCandidatesResolver } from './vas-candidates'
import {
  checkRelabelableResolver,
  relabelingResolver,
  repackagingResolver,
  repalletizingResolver,
  undoRelabelingResolver,
  undoRepackagingResolver,
  undoRepalletizingResolver
} from './vas-transactions'
import { vasWorksheetResolver } from './vas-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetByOrderNoResolver } from './worksheet-by-order-no'
import { worksheetsResolver } from './worksheets'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...preunloadWorksheetResolver,
  ...deliveryOrderByWorksheetResolver,
  ...putawayWorksheetResolver,
  ...returnWorksheetResolver,
  ...pickingWorksheetResolver,
  ...cycleCountWorksheetResolver,
  ...vasWorksheetResolver,
  ...loadingWorksheetResolver,
  ...unloadedInventories,
  ...loadedInventories,
  ...vasCandidatesResolver,
  ...inventoriesByPalletResolver,
  ...checkRelabelableResolver,
  ...havingVasResolver,
  ...worksheetByOrderNoResolver
}

export const Mutation = {
  ...GenerateWorksheetMutations,
  ...ActivateWorksheetMutations,
  ...CompleteWorksheetMutations,
  ...UnloadingMutations,
  ...PutawayMutations,
  ...VasMutations,
  ...PickingMutations,
  ...updateWorksheet,
  ...createWorksheet,
  ...cycleCountAdjustment,
  ...deleteWorksheet,
  ...editBatchNo,
  ...proceedEditedBatchResolver,
  ...returning,
  ...undoInspection,
  ...loading,
  ...undoLoading,
  ...transfer,
  ...inspecting,
  ...proceedExtraProductsResolver,
  ...replacePickingPalletsResolver,
  ...pendingCancellationReleaseOrder,
  ...confirmCancellationReleaseOrder,
  ...rejectCancellationReleaseOrder,
  ...submitAdjustmentForApprovalResolver,
  ...repalletizingResolver,
  ...undoRepalletizingResolver,
  ...repackagingResolver,
  ...undoRepackagingResolver,
  ...relabelingResolver,
  ...undoRelabelingResolver,
  ...crossDockPickingResolver
}
