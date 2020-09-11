"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DateTimeConverter {
    static date(dateTime) {
        let unloadDate = '';
        if (dateTime) {
            const unloadDateTime = new Date(dateTime);
            var year = unloadDateTime.getFullYear();
            var month = (1 + unloadDateTime.getMonth()).toString();
            month = month.length > 1 ? month : '0' + month;
            var day = unloadDateTime.getDate().toString();
            day = day.length > 1 ? day : '0' + day;
            unloadDate = day + '-' + month + '-' + year;
        }
        return unloadDate;
    }
    static datetime(dateTime) {
        let unloadDate = '';
        if (dateTime) {
            const datetime = Number(dateTime);
            const timezoneOffset = new Date(datetime).getTimezoneOffset() * 60000;
            const newUnloadDate = new Date(datetime - timezoneOffset).toISOString().slice(0, -1);
            var dateTimeParts = newUnloadDate.split('T');
            //handle date parts
            var dateParts = dateTimeParts[0].split('-');
            var newDate = DateTimeConverter.date(dateParts);
            //handle time part
            var timeParts = dateTimeParts[1].slice(0, -7);
            unloadDate = newDate + ' ' + timeParts;
        }
        return unloadDate;
    }
}
exports.DateTimeConverter = DateTimeConverter;
//# sourceMappingURL=datetime-util.js.map