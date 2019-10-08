import uuid from 'uuid/v4'

export class WorksheetNoGenerator {
  static unloading() {
    return `ULD-${uuid()}`
  }

  static putaway() {
    return `PUTAWAY-${uuid()}`
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

  static pickingDetail() {
    return `PICK-DETAIL-${uuid()}`
  }

  static vasDetail() {
    return `VAS-DETAIL-${uuid()}`
  }
}
