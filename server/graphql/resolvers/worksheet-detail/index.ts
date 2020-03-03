import { createWorksheetDetail } from './create-worksheet-detail'
import { deleteWorksheetDetail } from './delete-worksheet-detail'
import { generateReleaseGoodWorksheetDetailsResolver } from './generate-release-good-worksheet-details'
import { updateWorksheetDetail } from './update-worksheet-detail'
import { worksheetDetailResolver } from './worksheet-detail'
import { worksheetDetailsResolver } from './worksheet-details'
import { worksheetDetailsByProductGroupResolver } from './worksheet-details-by-product-group'

export const Query = {
  ...worksheetDetailsResolver,
  ...worksheetDetailResolver,
  ...worksheetDetailsByProductGroupResolver
}

export const Mutation = {
  ...updateWorksheetDetail,
  ...createWorksheetDetail,
  ...deleteWorksheetDetail,
  ...generateReleaseGoodWorksheetDetailsResolver
}
