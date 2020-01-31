import * as Worksheet from './worksheet'
import * as WorksheetDetail from './worksheet-detail'
import * as WorksheetMovement from './worksheet-movement'
import * as Pallet from './pallet'

export const queries = [Worksheet.Query, WorksheetDetail.Query, WorksheetMovement.Query]

export const mutations = [Worksheet.Mutation, WorksheetDetail.Mutation, WorksheetMovement.Mutation, Pallet.Mutation]
