import { activateCycleCountResolver } from './activate-cycle-count'
import { inspectingResolver } from './inspecting'
import { checkMissingPalletResolver } from './check-missing-pallet'
import { addExtraPalletResolver } from './add-extra-pallet'
import { relocatePalletResolver } from './relocate-pallet'
import { undoInspectionResolver } from './undo-inspection'
import { completeInspectionResolver } from './complete-inspection'

export const Mutations = {
  ...activateCycleCountResolver,
  ...inspectingResolver,
  ...addExtraPalletResolver,
  ...relocatePalletResolver,
  ...checkMissingPalletResolver,
  ...undoInspectionResolver,
  ...completeInspectionResolver
}
