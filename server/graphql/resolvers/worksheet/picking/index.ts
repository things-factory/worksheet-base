import { undoPickingAssigmentResolver } from './undo-picking-assignment'
import { pickingResolver } from './picking'

export const Mutations = {
  ...undoPickingAssigmentResolver,
  ...pickingResolver
}
