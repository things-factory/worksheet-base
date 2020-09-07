import { putawayResolver } from './putaway'
import { undoPutawayResolver } from './undo-putaway'

export const Mutations = {
  ...putawayResolver,
  ...undoPutawayResolver
}
