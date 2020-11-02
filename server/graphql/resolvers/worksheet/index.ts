import { Mutations as GenerateWorksheetMutations } from './generate-worksheet'
import { Mutations as InspectMutations } from './inspecting'
import { Mutations as LoadingMutations } from './loading'
import { Mutations as PickingMutations } from './picking'
import { Mutations as PutawayMutations } from './putaway'
import { Mutations as ReturningMutations } from './returning'
import { Mutations as OutboundReturnMutations } from './outbound-return'
import { Mutations as UnloadingMutations } from './unloading'
import { Mutations as VasMutations } from './vas'

import { confirmCancellationReleaseOrder } from './confirm-cancellation-release-order'
import { createWorksheet } from './create-worksheet'
import { crossDockPickingResolver } from './cross-dock-picking'
import { cycleCountAdjustmentResolver } from './cycle-count-adjustment'
import { cycleCountWorksheetResolver } from './cycle-count-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { deliveryOrderByWorksheetResolver } from './delivery-order-by-worksheet'
import { editBatchNo } from './edit-batch-no'
import { havingVasResolver } from './having-vas'
import { inventoriesByPalletResolver } from './inventories-by-pallet'
import { loadedInventories } from './loaded-inventories'
import { loadingWorksheetResolver } from './loading-worksheet'
import { notTallyTargetInventoriesResolver } from './not-tally-target-inventories'
import { pendingCancellationReleaseOrder } from './pending-cancellation-release-order'
import { pickingWorksheetResolver } from './picking-worksheet'
import { preunloadWorksheetResolver } from './preunload-worksheet'
import { proceedEditedBatchResolver } from './proceed-edited-batch'
import { proceedExtraProductsResolver } from './proceed-extra-products'
import { putawayWorksheetResolver } from './putaway-worksheet'
import { putawayReturningWorksheetResolver } from './putaway-returning-worksheet'
import { rejectCancellationReleaseOrder } from './reject-cancellation-release-order'
import { replacePickingPalletsResolver } from './replace-picking-pallets'
import { returnWorksheetResolver } from './return-worksheet'
import { submitAdjustmentForApprovalResolver } from './submit-adjustment-for-approval'
import { transfer } from './transfer'
import { unloadedInventories } from './unloaded-inventories'
import { unloadedInventoriesByReusablePallet } from './unloaded-inventories-by-reusable-pallet'
import { unloadingWorksheetResolver } from './unloading-worksheet'
import { unloadingReturnWorksheetResolver } from './unloading-return-worksheet'
import { updateWorksheet } from './update-worksheet'
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
import { worksheetWithPaginationResolver } from './worksheet-with-pagination'
import { worksheetsResolver } from './worksheets'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver,
  ...unloadingWorksheetResolver,
  ...unloadingReturnWorksheetResolver,
  ...preunloadWorksheetResolver,
  ...deliveryOrderByWorksheetResolver,
  ...putawayWorksheetResolver,
  ...putawayReturningWorksheetResolver,
  ...returnWorksheetResolver,
  ...pickingWorksheetResolver,
  ...cycleCountWorksheetResolver,
  ...vasWorksheetResolver,
  ...loadingWorksheetResolver,
  ...unloadedInventories,
  ...unloadedInventoriesByReusablePallet,
  ...loadedInventories,
  ...vasCandidatesResolver,
  ...inventoriesByPalletResolver,
  ...checkRelabelableResolver,
  ...havingVasResolver,
  ...worksheetByOrderNoResolver,
  ...worksheetWithPaginationResolver,
  ...notTallyTargetInventoriesResolver
}

export const Mutation = {
  ...GenerateWorksheetMutations,
  ...UnloadingMutations,
  ...PutawayMutations,
  ...VasMutations,
  ...PickingMutations,
  ...LoadingMutations,
  ...ReturningMutations,
  ...OutboundReturnMutations,
  ...InspectMutations,
  ...updateWorksheet,
  ...createWorksheet,
  ...cycleCountAdjustmentResolver,
  ...deleteWorksheet,
  ...editBatchNo,
  ...proceedEditedBatchResolver,
  ...transfer,
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
