export class DateTimeConverter {
  static date(dateTime) {
    let unloadDate = ''
    if (dateTime) {
      const unloadDateTime: Date = new Date(dateTime)
      var year = unloadDateTime.getFullYear()

      var month = (1 + unloadDateTime.getMonth()).toString()
      month = month.length > 1 ? month : '0' + month

      var day = unloadDateTime.getDate().toString()
      day = day.length > 1 ? day : '0' + day

      unloadDate = day + '-' + month + '-' + year
    }
    return unloadDate
  }
}
