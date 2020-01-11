import uuid from 'uuid/v4'

export class WorksheetNoGenerator {
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
