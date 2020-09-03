import { unloadResolver } from './unload'
import { undoUnloadingResolver } from './undo-unloading'

export const Mutations = {
  ...unloadResolver,
  ...undoUnloadingResolver
}
