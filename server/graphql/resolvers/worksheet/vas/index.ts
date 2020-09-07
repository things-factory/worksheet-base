import { assignVasInventoriesResolver } from './assign-vas-inventories'
import { executeVas } from './execute-vas'
import { undoVasResolver } from './undo-vas'

export const Mutations = {
  ...assignVasInventoriesResolver,
  ...executeVas,
  ...undoVasResolver
}
