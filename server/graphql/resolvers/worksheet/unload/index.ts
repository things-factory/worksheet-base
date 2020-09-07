import { unloadResolver } from './unload'
import { undoUnloadingResolver } from './undo-unloading'
import { preunloadResolver } from './preunload'

export const Mutations = {
  ...unloadResolver,
  ...undoUnloadingResolver,
  ...preunloadResolver
}
