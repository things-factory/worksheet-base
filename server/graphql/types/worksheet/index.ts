import { Worksheet } from './worksheet'
import { NewWorksheet } from './new-worksheet'
import { WorksheetPatch } from './worksheet-patch'
import { WorksheetList } from './worksheet-list'
import { Filter, Pagination, Sorting } from '@things-factory/shell'

export const Mutation = `
  createWorksheet (
    worksheet: NewWorksheet!
  ): Worksheet

  updateWorksheet (
    id: String!
    patch: WorksheetPatch!
  ): Worksheet

  deleteWorksheet (
    id: String!
  ): Worksheet

  publishWorksheet (
    id: String!
  ): Worksheet
`

export const Query = `
  worksheets(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetList
  worksheet(id: String!): Worksheet
`

export const Types = [Filter, Pagination, Sorting, Worksheet, NewWorksheet, WorksheetPatch, WorksheetList]
