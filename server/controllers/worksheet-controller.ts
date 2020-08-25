import { ArrivalNotice, ReleaseGood, VasOrder } from '@things-factory/sales-base'
import { EntityManager } from 'typeorm'
import { Worksheet } from '../entities'

declare type ReferenceOrderType = ArrivalNotice | ReleaseGood | VasOrder

interface GenerateUnloadingInterface {
  type: 'UNLOADING'
}

interface GeneratePutawayInterface {
  type: 'PUTAWAY'
}

interface GeneratePickingInterface {
  type: 'PICKING'
}
interface GenerateLoadingInterface {
  type: 'LOADING'
}

interface GenerateVasInterface {
  type: 'VAS'
}

type GenerateWorksheetInterface =
  | GenerateUnloadingInterface
  | GeneratePutawayInterface
  | GeneratePickingInterface
  | GenerateLoadingInterface
  | GenerateVasInterface

export class WorksheetController {
  async generate(trxMgr: EntityManager, worksheetInterface: GenerateWorksheetInterface): Promise<Worksheet> {
    let worksheet: Worksheet

    switch (worksheetInterface.type) {
      case 'UNLOADING':
        worksheet = await this.generateUnloadingWorksheet(worksheetInterface)
        break

      case 'PUTAWAY':
        worksheet = await this.generatePutawayWorksheet(worksheetInterface)
        break

      case 'PICKING':
        worksheet = await this.generatePickingWorksheet(worksheetInterface)
        break

      case 'LOADING':
        worksheet = await this.generateLoadingWorksheet(worksheetInterface)
        break

      case 'VAS':
        worksheet = await this.generateVasWorksheet(worksheetInterface)
        break
    }

    return worksheet
  }

  async generateUnloadingWorksheet(worksheetInterface: GenerateUnloadingInterface): Promise<Worksheet> {
    return
  }

  async generatePutawayWorksheet(worksheetInterface: GeneratePutawayInterface): Promise<Worksheet> {
    return
  }

  async generatePickingWorksheet(worksheetInterface: GeneratePickingInterface): Promise<Worksheet> {
    return
  }

  async generateLoadingWorksheet(worksheetInterface: GenerateLoadingInterface): Promise<Worksheet> {
    return
  }

  async generateVasWorksheet(worksheetInterface: GenerateVasInterface): Promise<Worksheet> {
    return
  }
}
