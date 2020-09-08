import { activateCycleCountResolver } from './activate-cycle-count'
import { inspectingResolver } from './inspecting'
import { undoInspectionResolver } from './undo-inspection'
import { completeInspectionResolver } from './complete-inspection'

export const Mutations = {
  ...activateCycleCountResolver,
  ...inspectingResolver,
  ...undoInspectionResolver,
  ...completeInspectionResolver
}
