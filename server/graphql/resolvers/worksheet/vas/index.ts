import { assignVasInventoriesResolver } from './assign-vas-inventories'
import { activateVasResolver } from './activate-vas'
import { executeVasResolver } from './execute-vas'
import { undoVasResolver } from './undo-vas'
import { completeVasResolver } from './complete-vas'

export const Mutations = {
  ...assignVasInventoriesResolver,
  ...activateVasResolver,
  ...executeVasResolver,
  ...undoVasResolver,
  ...completeVasResolver
}
