import { worksheetResolver } from './worksheet'
import { worksheetsResolver } from './worksheets'

import { updateWorksheet } from './update-worksheet'
import { createWorksheet } from './create-worksheet'
import { deleteWorksheet } from './delete-worksheet'

export const Query = {
  ...worksheetsResolver,
  ...worksheetResolver
}

export const Mutation = {
  ...updateWorksheet,
  ...createWorksheet,
  ...deleteWorksheet
}
