import { activatePutawayResolver } from './activate-putaway'
import { putawayResolver } from './putaway'
import { undoPutawayResolver } from './undo-putaway'
import { completePutawayResolver } from './complete-putaway'

export const Mutations = {
  ...activatePutawayResolver,
  ...putawayResolver,
  ...undoPutawayResolver,
  ...completePutawayResolver
}
