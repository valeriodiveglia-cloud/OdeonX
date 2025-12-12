
export type LoyaltyCard = {
    id: string
    card_number: string
    customer_name: string | null
    phone_number: string | null
    email: string | null
    address: string | null
    status: 'active' | 'blocked' | 'expired' | 'unassigned'
    class: string
    points: number
    balance: number
    total_spent: number
    issued_on: string
    tier_expires_on: string | null
    card_expires_on: string | null
    created_by?: string | null
    replaced_by?: string | null
}
