import { worksheetDetailResolver } from './worksheet-detail'
import { worksheetDetailsResolver } from './worksheet-details'

import { updateWorksheetDetail } from './update-worksheet-detail'
import { createWorksheetDetail } from './create-worksheet-detail'
import { deleteWorksheetDetail } from './delete-worksheet-detail'

export const Query = {
  ...worksheetDetailsResolver,
  ...worksheetDetailResolver
}

export const Mutation = {
  ...updateWorksheetDetail,
  ...createWorksheetDetail,
  ...deleteWorksheetDetail
}
