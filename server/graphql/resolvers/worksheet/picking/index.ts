import { assignPickingInventoriesResolver } from './assign-picking-inventories'
import { undoPickingAssigmentResolver } from './undo-picking-assignment'
import { activatePickingResolver } from './activate-picking'
import { pickingResolver } from './picking'
import { completePickingResolver } from './complete-picking'

export const Mutations = {
  ...assignPickingInventoriesResolver,
  ...undoPickingAssigmentResolver,
  ...activatePickingResolver,
  ...pickingResolver,
  ...completePickingResolver
}
