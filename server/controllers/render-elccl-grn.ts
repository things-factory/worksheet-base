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
        select invh.*, invh2.ref_order_id as release_order_id, invh2.qty as release_qty, invh.qty as inbound_qty, 
        invh.qty + invh2.qty as remaining_qty, invh2.weight as release_weight, invh.weight as inbound_weight, 
        invh.weight + invh2.weight as remaining_weight
        from reduced_inventory_histories invh 
        left join reduced_inventory_histories invh2 on 
          invh2.domain_id = invh.domain_id and 
          invh2.pallet_id = invh.pallet_id and 
          invh2.seq = invh.seq + 1 and 
          invh2.transaction_type='PICKING'
        where invh.ref_order_id is not null and invh.ref_order_id::uuid = $1 and invh.transaction_type = $2
      )
    `,
      [foundGAN.id, TRANSACTION_TYPE.UNLOADING]
    )

    await trxMgr.query(
      `
      create temp table tmp2 as(
        select id,seq,ref_order_id,order_no,"name",pallet_id,batch_id,product_id,warehouse_id,location_id,"zone",order_ref_no,packing_type,unit,qty,
        opening_qty,weight,opening_weight,description,status,transaction_type,created_at,updated_at,domain_id,bizplace_id,creator_id,updater_id,
        reusable_pallet_id,release_order_id,release_qty,inbound_qty,remaining_qty, inbound_qty as loose_amt, release_weight, inbound_weight,remaining_weight, inbound_weight as loose_wgt, null as remarks
        from tmp where release_qty > 0 or release_qty is null
        union all 
        select id,seq,ref_order_id,order_no,"name",pallet_id,batch_id,product_id,warehouse_id,location_id,"zone",order_ref_no,packing_type,unit,qty,
        opening_qty,weight,opening_weight,description,status,transaction_type,created_at,updated_at,domain_id,bizplace_id,creator_id,updater_id,
        reusable_pallet_id,release_order_id,release_qty,inbound_qty,remaining_qty, remaining_qty as loose_amt, release_weight, inbound_weight,remaining_weight, remaining_weight as loose_wgt, null as remarks
        from tmp where release_qty < 0 and remaining_qty > 0
        union all 
        select id,seq,ref_order_id,order_no,"name",pallet_id,batch_id,product_id,warehouse_id,location_id,"zone",order_ref_no,packing_type,unit,qty,
        opening_qty,weight,opening_weight,description,status,transaction_type,created_at,updated_at,domain_id,bizplace_id,creator_id,updater_id,
        reusable_pallet_id,release_order_id,release_qty,inbound_qty,remaining_qty, -release_qty as loose_amt, release_weight,inbound_weight,remaining_weight, -release_weight as loose_wgt, '[C/D]' as remarks
        from tmp where release_qty < 0
      )
    `
    )

    invItems = await trxMgr.query(
      `          
    select main.product_id, main.batch_id, main.packing_type, sum(main.loose_amt) as total_qty, sum(main.loose_wgt) as total_weight,
    p2.name as product_name, p2.description as product_description, 
    sum(case when main.reusable_pallet_id is null then 1 else 0 end) as pallet_count,
    concat(
      case when sum(case when main.reusable_pallet_id is null then 1 else 0 end) > 0 then concat(sum(case when main.reusable_pallet_id is null then 1 else 0 end)::varchar, ' PALLET(S) ' ) else '' end,
      case when string_agg(plt.perc, ', ') is null then '' else string_agg(plt.perc, ', ') end,
      case when main.remarks is null then '' else concat(' ' ,main.remarks) end 
    )as remarks
    from tmp2 main
    inner join products p2 on p2.id::varchar = main.product_id
    left join (
      select concat(round((x.qty/y.loose_total)::numeric, 2), ' ', y.pallet_name) as perc,
      x.* from tmp as x
      left join (
        select plt.name as pallet_name, dt.reusable_pallet_id, sum(qty) as loose_total from tmp as dt 
        inner join pallets plt on plt.id = dt.reusable_pallet_id and plt.domain_id = dt.domain_id
        where dt.reusable_pallet_id is not null
        group by plt.name, dt.reusable_pallet_id
      ) as y on y.reusable_pallet_id = x.reusable_pallet_id
    ) plt on plt.reusable_pallet_id = main.reusable_pallet_id and 
    plt.product_id = main.product_id and plt.batch_id = main.batch_id and 
    plt.packing_type = main.packing_type --and main.remarks is null
    group by main.product_id, main.batch_id, main.packing_type, main.remarks, p2.name, p2.description
    order by product_name, remarks
    `
    )

    await trxMgr.query(`
      drop table tmp, tmp2
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
    container_no: foundGAN?.containerNo ? foundGAN.containerNo : foundGAN.deliveryOrderNo,
    product_list: invItems.map((item, idx) => {
      return {
        list_no: idx + 1,
        product_name: `${item.product_name} (${item.product_description})`,
        product_type: item.packing_type,
        product_batch: item.batch_id,
        product_qty: item.total_qty,
        product_weight: item.total_weight,
        unit_weight: Math.round((item.total_weight / item.total_qty) * 100) / 100,
        pallet_qty: item.pallet_count,
        remark: item.remarks
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
