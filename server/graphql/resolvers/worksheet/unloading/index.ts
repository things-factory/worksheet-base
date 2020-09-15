import { activateUnloadingResolver } from './activate-unloading'
import { unloadResolver } from './unload'
import { undoUnloadingResolver } from './undo-unloading'
import { completeUnloadingResolver } from './complete-unloading'
import { completeUnloadingPartiallyResolver } from './complete-unloading-partially'

import { preunloadResolver } from './preunload'
import { undoPreunloadResolver } from './undo-preunload'
import { completePreunloadResolver } from './complete-preunload'

export const Mutations = {
  ...activateUnloadingResolver,
  ...unloadResolver,
  ...undoUnloadingResolver,
  ...completeUnloadingResolver,
  ...completeUnloadingPartiallyResolver,

  ...preunloadResolver,
  ...undoPreunloadResolver,
  ...completePreunloadResolver
}
