import { worksheetMovementResolver } from './worksheet-movement'
import { worksheetMovementsResolver } from './worksheet-movements'

import { updateWorksheetMovement } from './update-worksheet-movement'
import { createWorksheetMovement } from './create-worksheet-movement'
import { deleteWorksheetMovement } from './delete-worksheet-movement'

export const Query = {
  ...worksheetMovementsResolver,
  ...worksheetMovementResolver
}

export const Mutation = {
  ...updateWorksheetMovement,
  ...createWorksheetMovement,
  ...deleteWorksheetMovement
}
