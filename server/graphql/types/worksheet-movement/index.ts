import { WorksheetMovement } from './worksheet-movement'
import { NewWorksheetMovement } from './new-worksheet-movement'
import { WorksheetMovementPatch } from './worksheet-movement-patch'
import { WorksheetMovementList } from './worksheet-movement-list'
import { Filter, Pagination, Sorting } from '@things-factory/shell'

export const Mutation = `
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

export const Query = `
  worksheetMovements(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetMovementList
  worksheetMovement(id: String!): WorksheetMovement
`

export const Types = [Filter, Pagination, Sorting, WorksheetMovement, NewWorksheetMovement, WorksheetMovementPatch, WorksheetMovementList]
