import { activateReturnResolver } from './activate-return'
import { returningResolver } from './returning'
import { completeReturnResolver } from './complete-return'

export const Mutations = {
  ...activateReturnResolver,
  ...returningResolver,
  ...completeReturnResolver
}
