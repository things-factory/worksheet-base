import { activateLoadingResolver } from './activate-loading'
import { loadingResolver } from './loading'
import { undoLoadingResolver } from './undo-loading'
import { completeLoadingResolver } from './complete-loading'

export const Mutations = {
  ...activateLoadingResolver,
  ...loadingResolver,
  ...undoLoadingResolver,
  ...completeLoadingResolver
}
