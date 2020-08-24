import { Attachment, STORAGE } from '@things-factory/attachment-base'
import { Bizplace, ContactPoint, Partner } from '@things-factory/biz-base'
import { config } from '@things-factory/env'
import { ArrivalNotice, GoodsReceivalNote, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { LOCATION_TYPE } from '@things-factory/warehouse-base'
import { Domain } from '@things-factory/shell'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { EntityManager, getManager, getRepository } from 'typeorm'
import { TEMPLATE_TYPE, TRANSACTION_TYPE } from '../constants'
import { Worksheet } from '../entities'
import { DateTimeConverter } from '../utils/datetime-util'

const REPORT_API_URL = config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html')

export async function renderElcclGRN({ domain: domainName, grnNo }) {
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

  // const targetProducts: OrderProduct[] = await getRepository(OrderProduct).find({
  //   where: { domain, arrivalNotice: foundGAN, actualPalletQty: Not(IsNull()), actualPackQty: Not(IsNull()) },
  //   relations: ['product']
  // })

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
      category: TEMPLATE_TYPE.SIGNATURE
    }
  })

  const foundCop: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
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

  let invItems: any

  await getManager().transaction(async (trxMgr: EntityManager) => {
    await trxMgr.query(
      `
      create temp table tmp as(
        select invh.* from (
          select invh.domain_id, invh.pallet_id, max(seq) as seq from order_inventories oi
          inner join inventories inv on inv.id = oi.inventory_id
          inner join reduced_inventory_histories invh on invh.domain_id = inv.domain_id and invh.pallet_id = inv.pallet_id and invh.transaction_type = $2
          where oi.arrival_notice_id = $1 
          group by invh.domain_id, invh.pallet_id
        ) src
        inner join inventory_histories invh on invh.domain_id = src.domain_id and invh.pallet_id = src.pallet_id and invh.seq = src.seq
      )   
    `,
      [foundGAN.id, TRANSACTION_TYPE.UNLOADING]
    )

    invItems = await trxMgr.query(
      `          
      select main.product_id, main.batch_id, main.packing_type, sum(main.opening_qty) as total_qty, sum(main.opening_weight) as total_weight ,p2.name as product_name, p2.description as product_description,
      sum(case when main.reusable_pallet_id is null then 1 else 0 end) as pallet_count,
      sum(case when main.reusable_pallet_id is not null then 1 else 0 end) as mixed_count 
      from tmp main
      inner join locations l2 on l2.id::varchar = main.location_id
      inner join products p2 on p2.id::varchar = main.product_id
      left join (select location_id, count(*) as cnt from tmp group by location_id) sec on sec.location_id = main.location_id and sec.cnt > 1
      group by main.product_id, main.batch_id, main.packing_type, p2.name, p2.description
    `,
      [LOCATION_TYPE.FLOOR, LOCATION_TYPE.BUFFER, LOCATION_TYPE.SHELF]
    )

    trxMgr.query(`
      drop table tmp
    `)
  })

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
    product_list: invItems.map((item, idx) => {
      return {
        list_no: idx + 1,
        product_name: `${item.product_name}(${item.product_description})`,
        product_type: item.packing_type,
        product_batch: item.batch_id,
        product_qty: item.total_qty,
        product_weight: item.total_weight,
        unit_weight: Math.round((item.total_weight / item.total_qty) * 100) / 100,
        pallet_qty: item.pallet_count,
        remark:
          item.pallet_count < 1
            ? '' + (item.mixed_count ? `${item.mixed_count} ${item.packing_type}` : '')
            : (item.pallet_count > 1 ? `${item.pallet_count} PALLETS` : `${item.pallet_count} PALLET`) +
              (item.mixed_count ? `, ${item.mixed_count} ${item.packing_type}` : '')
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
