import uuid from 'uuid/v4'
import { WORKSHEET_TYPE } from '../constants'

export class WorksheetNoGenerator {
  static generate(type: string, isDetail: boolean = false): string {
    if (isDetail) {
      return this.generateDetail(type)
    } else {
      if (Object.keys(WORKSHEET_TYPE).indexOf(type) < 0) {
        throw new Error(`Invalid type pased (passed type: ${type})`)
      }

      switch (type) {
        case WORKSHEET_TYPE.UNLOADING:
          return this.unloading()

        case WORKSHEET_TYPE.PUTAWAY:
          return this.putaway()

        case WORKSHEET_TYPE.PICKING:
          return this.picking()

        case WORKSHEET_TYPE.LOADING:
          return this.loading()

        case WORKSHEET_TYPE.RETURN:
          return this.return()

        case WORKSHEET_TYPE.VAS:
          return this.vas()

        case WORKSHEET_TYPE.CYCLE_COUNT:
          return this.cycleCount()
      }
    }
  }

  static generateDetail(type: string): string {
    if (Object.keys(WORKSHEET_TYPE).indexOf(type) < 0) {
      throw new Error(`Invalid type pased (passed type: ${type})`)
    }

    switch (type) {
      case WORKSHEET_TYPE.UNLOADING:
        return this.unloadingDetail()

      case WORKSHEET_TYPE.PUTAWAY:
        return this.putawayDetail()

      case WORKSHEET_TYPE.PICKING:
        return this.pickingDetail()

      case WORKSHEET_TYPE.LOADING:
        return this.loadingDetail()

      case WORKSHEET_TYPE.RETURN:
        return this.returnDetail()

      case WORKSHEET_TYPE.VAS:
        return this.vasDetail()

      case WORKSHEET_TYPE.CYCLE_COUNT:
        return this.cycleCountDetail()
    }
  }

  static unloading() {
    return `ULD-${uuid()}`
  }

  static putaway() {
    return `PUTAWAY-${uuid()}`
  }

  static loading() {
    return `LOAD-${uuid()}`
  }

  static return() {
    return `RETURN-${uuid()}`
  }

  static cycleCount() {
    return `CC-${uuid()}`
  }

  static stockTake() {
    return `ST-${uuid()}`
  }

  static picking() {
    return `PICK-${uuid()}`
  }

  static vas() {
    return `VAS-${uuid()}`
  }

  static unloadingDetail() {
    return `ULD-DETAIL-${uuid()}`
  }

  static putawayDetail() {
    return `PUTAWAY-DETAIL-${uuid()}`
  }

  static cycleCountDetail() {
    return `CC-DETAIL-${uuid()}`
  }

  static stockTakeDetail() {
    return `ST-DETAIL-${uuid()}`
  }

  static loadingDetail() {
    return `LOAD-DETAIL-${uuid()}`
  }

  static returnDetail() {
    return `RETURN-DETAIL-${uuid()}`
  }

  static pickingDetail() {
    return `PICK-DETAIL-${uuid()}`
  }

  static vasDetail() {
    return `VAS-DETAIL-${uuid()}`
  }
}
