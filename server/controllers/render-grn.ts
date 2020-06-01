import { Attachment, STORAGE } from '@things-factory/attachment-base'
import { Bizplace, Partner, ContactPoint } from '@things-factory/biz-base'
import { config } from '@things-factory/env'
import { Product } from '@things-factory/product-base'
import {
  ArrivalNotice,
  GoodsReceivalNote,
  OrderProduct,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { DateTimeConverter } from '../utils/datetime-util'
import { Domain } from '@things-factory/shell'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { getRepository, Not, IsNull } from 'typeorm'
import { TEMPLATE_TYPE } from '../constants'
import { Worksheet } from '../entities'

const REPORT_API_URL = config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html')

export async function renderGRN({ domain: domainName, grnNo }) {
  // 1. find domain
  const domain: Domain = await getRepository(Domain).findOne({
    where: { subdomain: domainName }
  })

  // 2. find grn
  const foundGRN: GoodsReceivalNote = await getRepository(GoodsReceivalNote).findOne({
    where: { domain, name: grnNo },
    relations: ['domain', 'bizplace', 'arrivalNotice']
  })

  // 3. find GAN
  const foundGAN: ArrivalNotice = foundGRN.arrivalNotice
  const ownRefNo = foundGAN.refNo

  // 4. find customer bizplace
  const partnerBiz: Bizplace = foundGRN.bizplace

  // 5. find domain bizplace id
  const foundDomainBizId: Partner = await getRepository(Partner).findOne({
    where: { partnerBizplace: partnerBiz.id },
    relations: ['domainBizplace']
  })

  // 6. found domain bizplace object
  const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
    where: { id: foundDomainBizId.domainBizplace.id }
  })

  // 7. find domain contact point
  const foundCP: ContactPoint = await getRepository(ContactPoint).findOne({
    where: { domain, bizplace: foundDomainBiz }
  })

  // 8. find unloading worksheet
  const foundWS: Worksheet = await getRepository(Worksheet).findOne({
    where: { domain, arrivalNotice: foundGAN, type: ORDER_PRODUCT_STATUS.UNLOADING, status: ORDER_STATUS.DONE },
    relations: ['worksheetDetails']
  })

  const targetProducts: OrderProduct[] = await getRepository(OrderProduct).find({
    where: { domain, arrivalNotice: foundGAN, actualPalletQty: Not(IsNull()), actualPackQty: Not(IsNull()) },
    relations: ['product']
  })

  // 9. find grn template based on category
  const foundTemplate: Attachment = await getRepository(Attachment).findOne({
    where: { domain, category: TEMPLATE_TYPE.GRN_TEMPLATE }
  })

  // 10. find grn logo
  const foundLogo: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.LOGO
    }
  })

  // 11. find signature
  const foundSignature: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      refBy: foundGRN.id,
      category: TEMPLATE_TYPE.SIGNATURE
    }
  })

  const foundCop: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      refBy: foundGRN.id,
      category: TEMPLATE_TYPE.COP
    }
  })

  const template = await STORAGE.readFile(foundTemplate.path, 'utf-8')

  let logo = null
  if (foundLogo?.path) {
    logo = 'data:' + foundLogo.mimetype + ';base64,' + (await STORAGE.readFile(foundLogo.path, 'base64'))
  }

  let signature = null
  if (foundSignature?.path) {
    signature = 'data:' + foundSignature.mimetype + ';base64,' + (await STORAGE.readFile(foundSignature.path, 'base64'))
  }

  let cop = null
  if (foundCop?.path) {
    cop = 'data:' + foundSignature.mimetype + ';base64,' + (await STORAGE.readFile(foundCop.path, 'base64'))
  }

  const data = {
    logo_url: logo,
    sign_url: signature,
    cop_url: cop,
    customer_biz: partnerBiz.name,
    customer_address: partnerBiz.address,
    company_domain: foundDomainBiz.name,
    company_phone: foundCP.phone,
    company_email: foundCP.email,
    company_brn: foundDomainBiz.description,
    company_address: foundDomainBiz.address,
    order_no: foundGRN.name,
    unload_date: DateTimeConverter.date(foundWS.endedAt),
    ref_no: ownRefNo ? `${foundGAN.name} / ${foundGAN.refNo}` : `${foundGAN.name}`,
    received_date: DateTimeConverter.date(foundWS.endedAt),
    truck_no: foundGAN.truckNo || '',
    container_no: foundGAN.containerNo || '',
    product_list: targetProducts.map((op: OrderProduct, idx) => {
      const product: Product = op.product
      return {
        list_no: idx + 1,
        product_name: `${product.name} (${product.description})`,
        product_type: op.packingType,
        product_description: product.description,
        product_batch: op.batchId,
        product_qty: op.actualPackQty,
        product_weight: op.totalWeight,
        pallet_qty: op.actualPalletQty > 1 ? `${op.actualPalletQty} PALLETS` : `${op.actualPalletQty} PALLET`,
        remark: op.remark
      }
    })
  }

  const formData = new FormData()
  formData.append('template', template)
  formData.append('jsonString', JSON.stringify(data))

  const response = await fetch(REPORT_API_URL, {
    method: 'POST',
    body: formData
  })

  return await response.text()
}
