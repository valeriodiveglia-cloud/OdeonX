export const metadata = {
    title: 'My Loyalty Card',
    description: 'Check your loyalty card balance and transactions',
}

export default function MyCardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            {children}
        </div>
    )
}
