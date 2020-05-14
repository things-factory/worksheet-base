import { Attachment, STORAGE } from '@things-factory/attachment-base'
import { Bizplace, Partner, ContactPoint } from '@things-factory/biz-base'
import { config } from '@things-factory/env'
import { DeliveryOrder, OrderInventory, ORDER_STATUS, ArrivalNotice } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Pallet } from '@things-factory/warehouse-base'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { Equal, getRepository, In } from 'typeorm'
import { TEMPLATE_TYPE, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'

const REPORT_API_URL = config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html')

export async function renderJobSheet({ domain: domainName, doNo }) {
  const domain: Domain = await getRepository(Domain).findOne({
    where: { subdomain: domainName }
  }) //.. find domain
  const foundDO: DeliveryOrder = await getRepository(DeliveryOrder).findOne({
    where: { domain, name: doNo },
    relations: ['domain', 'bizplace', 'transportDriver', 'transportVehicle', 'releaseGood', 'creator', 'updater']
  }) // .. find do from deliveryOrderId

  const ownTransportFlag: Boolean = foundDO.ownCollection

  let foundCP: ContactPoint = null
  if (foundDO?.contactPointRefId) {
    foundCP = await getRepository(ContactPoint).findOne({
      where: { domain, id: foundDO.contactPointRefId }
    })
  }

  const foundGAN: ReleaseGood = foundDO.releaseGood
  const partnerBiz: Bizplace = foundDO.bizplace //customer bizplace
  const ownRefNo = foundRO.refNo

  // find domain bizplace name, address, brn
  const foundDomainBizId: Partner = await getRepository(Partner).findOne({
    where: { partnerBizplace: partnerBiz.id },
    relations: ['domainBizplace']
  })

  const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
    where: { id: foundDomainBizId.domainBizplace.id }
  })

  const foundDomainCP: ContactPoint = await getRepository(ContactPoint).findOne({
    where: { domain, bizplace: foundDomainBiz }
  })

  const foundWS: Worksheet = await getRepository(Worksheet).findOne({
    where: { domain, releaseGood: foundRO },
    relations: ['updater']
  })

  //find reusable pallet
  const foundRP: Pallet[] = await getRepository(Pallet).find({
    where: { domain, refOrderNo: foundRO.name }
  })

  //find list of loaded inventory
  const targetInventories: OrderInventory[] = await getRepository(OrderInventory).find({
    where: { domain, deliveryOrder: foundDO },
    relations: ['inventory']
  })
  const orderInvIds: string[] = targetInventories.map((oi: any) => oi.id)

  const foundWSD: WorksheetDetail[] = await getRepository(WorksheetDetail).find({
    where: {
      domain,
      targetInventory: In(orderInvIds),
      type: WORKSHEET_TYPE.LOADING,
      status: Equal(WORKSHEET_STATUS.DONE)
    },
    relations: [
      'targetInventory',
      'targetInventory.inventory',
      'targetInventory.inventory.location',
      'targetInventory.inventory.product',
      'updater'
    ]
  })

  const foundTemplate: Attachment = await getRepository(Attachment).findOne({
    where: { domain, category: TEMPLATE_TYPE.DO_TEMPLATE }
  })

  const foundLogo: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.LOGO
    }
  })

  let foundDriver: any = null
  if (foundDO.status !== ORDER_STATUS.READY_TO_DISPATCH) {
    if (foundDO?.ownCollection && foundDO?.otherDriver) {
      foundDriver = foundDO.otherDriver
    } else {
      foundDriver = foundDO.transportDriver.name
    }
  }

  const template = await STORAGE.readFile(foundTemplate.path, 'utf-8')
  let logo = null
  if (foundLogo?.path) {
    logo = 'data:' + foundLogo.mimetype + ';base64,' + (await STORAGE.readFile(foundLogo.path, 'base64'))
  }

  const productList: any = foundWSD
    .map((wsd: WorksheetDetail) => {
      const targetInventory: OrderInventory = wsd.targetInventory
      const inventory: Inventory = targetInventory.inventory
      return {
        product_name: `${inventory.product.name} (${inventory.product.description})`,
        product_type: inventory.packingType,
        product_batch: inventory.batchId,
        product_qty: targetInventory.releaseQty,
        product_weight: targetInventory.releaseWeight,
        remark: targetInventory.remark
      }
    })
    .reduce((newItem, item) => {
      var foundItem = newItem.find(
        newItem => newItem.product_name === item.product_name && newItem.product_batch === item.product_batch
      )
      if (!foundItem) {
        foundItem = {
          product_name: item.product_name,
          product_type: item.product_type,
          product_batch: item.product_batch,
          product_qty: item.product_qty,
          product_weight: item.product_weight,
          remark: 1
        }

        newItem.push(foundItem)
        return newItem
      } else {
        return newItem.map(ni => {
          if (ni.product_name === item.product_name && ni.product_batch === item.product_batch) {
            return {
              ...ni,
              remark: ni.remark + 1,
              product_qty: ni.product_qty + item.product_qty
            }
          } else {
            return ni
          }
        })
      }
    }, [])

  const data = {
    logo_url: logo,
    customer_biz: partnerBiz.name,
    delivery_company: foundCP ? foundCP.name : null,
    company_domain: foundDomainBiz.name,
    company_brn: foundDomainBiz.description,
    company_address: foundDomainBiz.address,
    company_phone: foundDomainCP.phone,
    company_email: foundDomainCP.email,
    own_collection: ownTransportFlag ? '[SELF-COLLECTION]' : `[${domain.brandName} TRANSPORT]`,
    destination: foundDO.to || '',
    ref_no: ownRefNo ? `${foundRO.name} / ${foundRO.refNo}` : `${foundRO.name}`,
    order_no: foundDO.name,
    delivery_date: foundDO.deliveryDate || '',
    truck_no: foundDO.truckNo,
    driver_name: foundDriver || '',
    pallet_qty: foundDO.palletQty,
    worker_name: foundWS.updater.name,
    pallet_list: foundRP.map(rp => rp.name).join(', '),
    product_list: productList.map((prod: any, idx) => {
      return {
        ...prod,
        list_no: idx + 1,
        remark: prod.remark > 1 ? `${prod.remark} PALLETS` : `${prod.remark} PALLET`
      }
    })
  } //.. make data from do
  const formData = new FormData()

  formData.append('template', template)
  formData.append('jsonString', JSON.stringify(data))

  const response = await fetch(REPORT_API_URL, {
    method: 'POST',
    body: formData
  })

  return await response.text()
}
