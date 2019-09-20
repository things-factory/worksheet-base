import uuid from 'uuid/v4'

export class WorksheetNoGenerator {
  static unloading() {
    return `ULD-${uuid()}`
  }

  static vas() {
    return `VAS-${uuid()}`
  }

  static unloadingDetail() {
    return `ULD-DETAIL-${uuid()}`
  }

  static vasDetail() {
    return `VAS-DETAIL-${uuid()}`
  }
}
