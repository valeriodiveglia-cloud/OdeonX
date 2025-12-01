import { Ticket } from 'lucide-react'

export default function VouchersPage() {
    return (
        <div className="p-8 flex flex-col items-center justify-center h-[calc(100vh-4rem)] text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Ticket className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-slate-600">Vouchers</h2>
            <p>Coming soon...</p>
        </div>
    )
}
