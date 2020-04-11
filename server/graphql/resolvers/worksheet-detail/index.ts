import { createWorksheetDetail } from './create-worksheet-detail'
import { deleteWorksheetDetail } from './delete-worksheet-detail'
import { generateReleaseGoodWorksheetDetailsResolver } from './generate-release-good-worksheet-details'
import { checkProgressingPalletResolver } from './check-progressing-pallet'
import { generatePalletIdResolver } from './generate-pallet-id'
import { updateWorksheetDetail } from './update-worksheet-detail'
import { worksheetDetailResolver } from './worksheet-detail'
import { worksheetDetailsResolver } from './worksheet-details'
import { worksheetDetailsByProductGroupResolver } from './worksheet-details-by-product-group'

export const Query = {
  ...worksheetDetailsResolver,
  ...worksheetDetailResolver,
  ...worksheetDetailsByProductGroupResolver,
  ...checkProgressingPalletResolver,
  ...generatePalletIdResolver,
}

export const Mutation = {
  ...updateWorksheetDetail,
  ...createWorksheetDetail,
  ...deleteWorksheetDetail,
  ...generateReleaseGoodWorksheetDetailsResolver,
}
