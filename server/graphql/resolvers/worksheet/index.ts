import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'
import { updateWorksheet } from './update-worksheet'
import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet
}
