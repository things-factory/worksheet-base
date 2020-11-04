import { activatePutawayReturnResolver } from './activate-putaway-return'
import { completePutawayReturnResolver } from './complete-putaway-return'
import { putawayReturnResolver } from './putaway-return'

export const Mutations = {
  ...activatePutawayReturnResolver,
  ...completePutawayReturnResolver,
  ...putawayReturnResolver,
}
