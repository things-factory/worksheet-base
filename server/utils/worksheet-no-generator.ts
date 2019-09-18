import uuid from 'uuid/v4'

export class WorksheetNoGenerator {
  static arrivalNotice() {
    return uuid()
  }

  static arrivalNoticeDetail() {
    return uuid()
  }
}
