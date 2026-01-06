
import { Asset } from '../types'

export const MOCK_ASSETS: Asset[] = [
    {
        id: '1',
        name: 'Rational Combi Oven iCombi Pro',
        sku: 'FIX-20240115-1001',
        category: 'Kitchen Equipment',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Hot Kitchen',
        type: 'fixed',
        status: 'active',
        condition: 'good',
        quantity: 1,
        serialNumber: 'E11SI2203294857',
        financials: {
            purchasePrice: 15200,
            purchaseDate: '2024-01-15',
            usefulLifeYears: 7,
            salvageValue: 2000,
            warrantyYears: 2
        }
    },
    {
        id: '2',
        name: 'Hobart Mixer 20L',
        sku: 'FIX-20220610-2002',
        category: 'Bakery',
        branch: 'Pasta Fresca Thanh My Loi',
        location: 'Pastry',
        type: 'fixed',
        status: 'maintenance',
        condition: 'fair',
        quantity: 1,
        serialNumber: '9988-7711-22',
        financials: {
            purchasePrice: 4800,
            purchaseDate: '2022-06-10',
            usefulLifeYears: 10,
            warrantyYears: 1
        }
    },
    {
        id: '3',
        name: 'La Marzocco Linea PB',
        sku: 'FIX-20241101-3003',
        category: 'Bar Equipment',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Coffee Bar',
        type: 'fixed',
        status: 'active',
        condition: 'new',
        quantity: 1,
        serialNumber: 'LM-PB-2394',
        financials: {
            purchasePrice: 12500,
            purchaseDate: '2024-11-01',
            usefulLifeYears: 5,
            warrantyYears: 3
        }
    },
    {
        id: '4',
        name: 'Wusthof Classic Knife Set',
        sku: 'SML-20230520-4004',
        category: 'Utensils',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Prep Kitchen',
        type: 'smallware',
        status: 'active',
        condition: 'good',
        quantity: 15,
        parLevel: 20,
        financials: {
            purchasePrice: 850,
            purchaseDate: '2023-05-20',
            usefulLifeYears: 3
        }
    },
    {
        id: '5',
        name: 'Riedel Wine Glasses',
        sku: 'SML-20230815-5005',
        category: 'Glassware',
        branch: 'Pasta Fresca Thanh My Loi',
        location: 'Bar Storage',
        type: 'smallware',
        status: 'active',
        condition: 'good',
        quantity: 48,
        parLevel: 50,
        financials: {
            purchasePrice: 1200,
            purchaseDate: '2023-08-15',
            usefulLifeYears: 2
        }
    },
    {
        id: '6',
        name: 'Teak Outdoor Tables',
        sku: 'FIX-20210310-6006',
        category: 'Furniture',
        branch: 'Pasta Fresca Da Lat',
        location: 'Patio',
        type: 'fixed',
        status: 'maintenance',
        condition: 'fair',
        quantity: 1,
        serialNumber: 'FURN-OUT-001',
        financials: {
            purchasePrice: 600,
            purchaseDate: '2021-03-10',
            usefulLifeYears: 5
        }
    },
    {
        id: '7',
        name: 'Honda PCX Delivery Scooter',
        sku: 'FIX-20241201-7007',
        category: 'Vehicles',
        branch: 'Pasta Fresca Da Lat',
        location: 'Parking',
        type: 'fixed',
        status: 'in_transit',
        condition: 'new',
        quantity: 1,
        serialNumber: 'VIN-9938475',
        financials: {
            purchasePrice: 3500,
            purchaseDate: '2024-12-01',
            usefulLifeYears: 4,
            warrantyYears: 2
        }
    },
    {
        id: '8',
        name: 'Toast POS Terminal',
        sku: 'FIX-20230901-8008',
        category: 'Technology',
        branch: 'Pasta Fresca Thao Dien',
        location: 'Counter',
        type: 'fixed',
        status: 'active',
        condition: 'good',
        quantity: 1,
        serialNumber: 'POS-T-2938',
        financials: {
            purchasePrice: 1200,
            purchaseDate: '2023-09-01',
            usefulLifeYears: 3,
            warrantyYears: 1
        }
    }
]

export const STORAGE_KEY = 'mock_assets_db_v2'
export const LOG_STORAGE_KEY = 'mock_asset_logs_v1'
