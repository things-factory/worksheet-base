import { Attachment, STORAGE } from '@things-factory/attachment-base'
import { Bizplace, Partner } from '@things-factory/biz-base'
import { config } from '@things-factory/env'
import {
  ArrivalNotice,
  DeliveryOrder,
  JobSheet,
  OrderInventory,
  OrderVas,
  OrderProduct,
  ORDER_INVENTORY_STATUS,
  ORDER_TYPE
} from '@things-factory/sales-base'
import { Product } from '@things-factory/product-base'
import { Domain } from '@things-factory/shell'
import { Inventory, InventoryHistory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { getRepository, IsNull, Not } from 'typeorm'
import { TEMPLATE_TYPE, WORKSHEET_TYPE } from '../constants'
import { Worksheet } from '../entities'

const REPORT_API_URL = config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html')

export async function renderJobSheet({ domain: domainName, ganNo }) {
  const domain: Domain = await getRepository(Domain).findOne({
    where: { subdomain: domainName }
  }) //.. find domain

  // find GAN
  const foundGAN: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
    where: { domain, name: ganNo },
    relations: ['bizplace', 'jobSheet']
  })

  // find job sheet
  const foundJS: JobSheet = foundGAN.jobSheet

  // customer bizplace
  const partnerBiz: Bizplace = foundGAN.bizplace

  // find domain bizplace name, address, brn
  const foundDomainBizId: Partner = await getRepository(Partner).findOne({
    where: { partnerBizplace: partnerBiz.id },
    relations: ['domainBizplace']
  })

  // owner domain bizplace
  const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
    where: { id: foundDomainBizId.domainBizplace.id }
  })

  // find unloading worksheet for getting unloading time
  const foundWS: Worksheet = await getRepository(Worksheet).findOne({
    where: { domain, arrivalNotice: foundGAN, type: WORKSHEET_TYPE.UNLOADING },
    relations: ['updater']
  })

  const foundTemplate: Attachment = await getRepository(Attachment).findOne({
    where: { domain, category: TEMPLATE_TYPE.JOB_TEMPLATE }
  })

  const foundLogo: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.LOGO
    }
  })

  const template = await STORAGE.readFile(foundTemplate.path, 'utf-8')
  let logo = null
  if (foundLogo?.path) {
    logo = 'data:' + foundLogo.mimetype + ';base64,' + (await STORAGE.readFile(foundLogo.path, 'base64'))
  }

  // find list of unloaded product
  const targetProducts: OrderProduct[] = await getRepository(OrderProduct).find({
    where: { domain, arrivalNotice: foundGAN, actualPalletQty: Not(IsNull()) },
    relations: ['product']
  })

  const products: Product[] = targetProducts.map((op: OrderProduct) => op.product)

  // sum up unloaded pack and pallet qty
  const sumPackQty: any = targetProducts.map((op: OrderProduct) => op.actualPackQty).reduce((a, b) => a + b, 0)
  const sumPalletQty: any = targetProducts.map((op: OrderProduct) => op.actualPalletQty).reduce((a, b) => a + b, 0)

  //find list of unloaded inventory
  const targetInventories: OrderInventory[] = await getRepository(OrderInventory).find({
    where: { domain, arrivalNotice: foundGAN },
    relations: ['inventory', 'inventory.product', 'inventory.location']
  })

  const productList: any = targetInventories.map(async (oi: OrderInventory) => {
    const inventory: Inventory = oi.inventory
    const foundIH: InventoryHistory[] = await getRepository(InventoryHistory).find({
      where: { domain, palletId: inventory.palletId, product: inventory.product.id }
    })

    const foundOV: OrderVas[] = await getRepository(OrderVas).find({
      where: { domain, inventory },
      relations: ['vas']
    })

    let terminatedInv = null
    if (inventory.status === INVENTORY_STATUS.TERMINATED) {
      terminatedInv = foundIH.filter(
        (ih: InventoryHistory) =>
          ih.status == ORDER_INVENTORY_STATUS.TERMINATED && ih.transactionType === ORDER_INVENTORY_STATUS.TERMINATED
      )
    }

    const foundOI: OrderInventory[] = await getRepository(OrderInventory).find({
      where: { domain, inventory, type: ORDER_TYPE.RELEASE_OF_GOODS },
      relations: ['deliveryOrders']
    })

    const foundDO: DeliveryOrder[] = foundOI.map((oi: OrderInventory) => oi.deliveryOrder)

    return {
      pallet_id: inventory.palletId,
      product_name: inventory.product.name,
      product_type: inventory.packingType,
      product_batch: inventory.batchId,
      in_pallet: inventory.createdAt,
      out_pallet: terminatedInv ? terminatedInv.updatedAt : '',
      do_list: foundDO.map(dos => dos.name).join(', '),
      product_qty: oi.releaseQty,
      remark: foundOV.map(ov => ov.vas.name).join(', ')
    }
  })

  const data = {
    logo_url: logo,
    customer_biz: partnerBiz.name,
    company_domain: foundDomainBiz.name,
    company_brn: foundDomainBiz.description,
    company_address: foundDomainBiz.address,
    container_no: foundGAN.containerNo,
    container_size: foundJS.containerSize,
    eta: foundGAN.eta,
    ata: foundGAN.ata,
    unloading_date: foundWS.startedAt,
    mt_date: foundJS.containerMtDate,
    advise_mt_date: foundJS.adviseMtDate,
    loose_item: foundGAN.looseItem ? 'Y' : 'N',
    no_of_pallet: foundGAN.looseItem ? `${sumPackQty} CTN` : `${sumPalletQty} PALLETS`,
    commodity: products.map(prod => prod.name).join(', '),
    created_on: foundJS.createdAt,
    job_no: foundJS.name,
    ref_no: foundGAN.name,
    product_list: productList
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
