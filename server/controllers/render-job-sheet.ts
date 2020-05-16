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
  ORDER_PRODUCT_STATUS,
  ORDER_TYPES
} from '@things-factory/sales-base'
import { DateTimeConverter } from '../utils/datetime-util'
import { Product } from '@things-factory/product-base'
import { Domain } from '@things-factory/shell'
import { Inventory, InventoryHistory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { getRepository, IsNull, Not, SelectQueryBuilder } from 'typeorm'
import { TEMPLATE_TYPE, WORKSHEET_TYPE, TRANSACTION_TYPE } from '../constants'
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

  // find unloading worksheet for getting unloading time
  const foundWS: Worksheet = await getRepository(Worksheet).findOne({
    where: { domain, arrivalNotice: foundGAN, type: WORKSHEET_TYPE.UNLOADING },
    relations: ['updater']
  })

  // find list of unloaded product
  const targetProducts: OrderProduct[] = await getRepository(OrderProduct).find({
    where: { domain, arrivalNotice: foundGAN, actualPalletQty: Not(IsNull()) },
    relations: ['product']
  })

  const products: Product[] = targetProducts.map((op: OrderProduct) => op.product)

  // sum up unloaded pack and pallet qty
  const sumPackQty: any = targetProducts.map((op: OrderProduct) => op.actualPackQty).reduce((a, b) => a + b, 0)
  const sumPalletQty: any = targetProducts.map((op: OrderProduct) => op.actualPalletQty).reduce((a, b) => a + b, 0)

  const subQueryInvHis = await getRepository(InventoryHistory)
    .createQueryBuilder('invHis')
    .select('invHis.palletId')
    .addSelect('invHis.domain')
    .addSelect('invHis.status')
    .addSelect('MAX(invHis.seq)', 'seq')
    .where("invHis.transactionType IN ('UNLOADING','ADJUSTMENT','TERMINATED')")
    .andWhere('invHis.domain = :domainId', { domainId: domain.id })
    .groupBy('invHis.palletId')
    .addGroupBy('invHis.status')
    .addGroupBy('invHis.domain')

  const query = await getRepository(Inventory)
    .createQueryBuilder('inv')
    .select('inv.id')
    .addSelect(subQuery => {
      return subQuery
        .select('COALESCE("invh".qty, 0)', 'unloadedQty')
        .from('inventory_histories', 'invh')
        .innerJoin(
          '(' + subQueryInvHis.getQuery() + ')',
          'invhsrc',
          '"invhsrc"."invHis_pallet_id" = "invh"."pallet_id" AND "invhsrc"."seq" = "invh"."seq" AND "invhsrc"."domain_id" = "invh"."domain_id"'
        )
        .where('"invhsrc"."invHis_status" = \'UNLOADED\'')
        .andWhere('"invh"."pallet_id" = "inv"."pallet_id"')
        .andWhere('"invh"."domain_id" = "inv"."domain_id"')
    }, 'unloadedQty')
    .addSelect(subQuery => {
      return subQuery
        .select('COALESCE("invh".created_at, null)', 'outboundAt')
        .from('inventory_histories', 'invh')
        .innerJoin(
          '(' + subQueryInvHis.getQuery() + ')',
          'invhsrc',
          '"invhsrc"."invHis_pallet_id" = "invh"."pallet_id" AND "invhsrc"."seq" = "invh"."seq" AND "invhsrc"."domain_id" = "invh"."domain_id"'
        )
        .where('"invhsrc"."invHis_status" = \'TERMINATED\'')
        .andWhere('"invh"."pallet_id" = "inv"."pallet_id"')
        .andWhere('"invh"."domain_id" = "inv"."domain_id"')
    }, 'outboundAt')
    .addSelect('inv.palletId', 'palletId')
    .addSelect('inv.packingType', 'packingType')
    .addSelect('inv.createdAt', 'createdAt')
    .addSelect('product.name', 'productName')
    .addSelect('dos.name', 'doName')
    .addSelect('dos.ownTransport', 'transport')
    .leftJoin('inv.orderInventory', 'orderInv')
    .innerJoin('orderInv.deliveryOrder', 'dos')
    .leftJoin('inv.product', 'product')
    .where(qb => {
      const subQuery = qb
        .subQuery()
        .select('oi.inventory_id')
        .from('order_inventories', 'oi')
        .where('oi.arrival_notice_id = :arrivalNoticeId', { arrivalNoticeId: foundGAN.id })
        .getQuery()
      return 'inv.id IN ' + subQuery
    })
    .andWhere('inv.domain_id = :domainId', { domainId: domain.id })

  const invItems: any[] = await query.getRawMany()

  const data = {
    logo_url: logo,
    customer_biz: partnerBiz.name,
    company_domain: foundDomainBiz.name,
    company_brn: foundDomainBiz.description,
    company_address: foundDomainBiz.address,
    container_no: foundGAN?.containerNo ? foundGAN.containerNo : null,
    container_size: foundJS ? foundJS.containerSize : null,
    eta: foundGAN.etaDate,
    ata: DateTimeConverter.date(foundGAN.ata),
    unloading_date: foundWS?.startedAt ? DateTimeConverter.date(foundWS.startedAt) : '',
    mt_date: foundJS?.containerMtDate ? DateTimeConverter.date(foundJS.containerMtDate) : '',
    advise_mt_date: DateTimeConverter.date(foundJS.adviseMtDate),
    loose_item: foundGAN.looseItem ? 'Y' : 'N',
    no_of_pallet: foundGAN.looseItem ? `${sumPackQty} CTN` : `${sumPalletQty} PALLETS`,
    commodity: products.map(prod => prod.name).join(', '),
    created_on: DateTimeConverter.date(foundJS.createdAt),
    job_no: foundJS ? foundJS.name : null,
    ref_no: foundGAN.name,
    product_list: invItems.map(item => {
      return {
        pallet_id: item.palletId,
        product_name: item.productName,
        product_type: item.packingType,
        in_pallet: DateTimeConverter.date(item.createdAt),
        out_pallet: item?.outboundAt ? DateTimeConverter.date(item.outboundAt) : null,
        do_list: null,
        transport: null,
        product_qty: item.unloadedQty,
        remark: null
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
