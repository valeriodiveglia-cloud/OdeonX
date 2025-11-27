import { en } from './en'
import { vi } from './vi'

export const getMonthlyReportsDictionary = (language: string) => {
    switch (language) {
        case 'vi':
            return vi
        case 'en':
        default:
            return en
    }
}
