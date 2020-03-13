import { NewWorksheetMovement } from './new-worksheet-movement'
import { WorksheetMovement } from './worksheet-movement'
import { WorksheetMovementList } from './worksheet-movement-list'
import { WorksheetMovementPatch } from './worksheet-movement-patch'

export const Mutation = /* GraphQL */ `
  createWorksheetMovement (
    worksheetMovement: NewWorksheetMovement!
  ): WorksheetMovement

  updateWorksheetMovement (
    id: String!
    patch: WorksheetMovementPatch!
  ): WorksheetMovement

  deleteWorksheetMovement (
    id: String!
  ): WorksheetMovement

  publishWorksheetMovement (
    id: String!
  ): WorksheetMovement
`

export const Query = /* GraphQL */ `
  worksheetMovements(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetMovementList
  worksheetMovement(id: String!): WorksheetMovement
`

export const Types = [WorksheetMovement, NewWorksheetMovement, WorksheetMovementPatch, WorksheetMovementList]
