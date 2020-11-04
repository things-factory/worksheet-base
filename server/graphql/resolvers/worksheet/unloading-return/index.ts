import { activateUnloadingReturnResolver } from './activate-unloading-return'
import { unloadReturnResolver } from './unload-return'
import { undoUnloadReturningResolver } from './undo-unload-returning'
import { completeUnloadReturningResolver } from './complete-unload-returning'
import { completeUnloadReturnPartiallyResolver } from './complete-unload-return-partially'
 
export const Mutations = {
  ...activateUnloadingReturnResolver,
  ...unloadReturnResolver,
  ...undoUnloadReturningResolver,
  ...completeUnloadReturningResolver,
  ...completeUnloadReturnPartiallyResolver
}
