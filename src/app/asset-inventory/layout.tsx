import LeftNavAssetInventory from '@/components/LeftNavAssetInventory'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex bg-slate-900 min-h-screen">
            <LeftNavAssetInventory />

            {/* 
         The sidebar manages a CSS variable --leftnav-w.
         We use padding-left to push content.
      */}
            <main
                className="flex-1 transition-[padding] duration-150 ease-out"
                style={{ paddingLeft: 'var(--leftnav-w, 3.5rem)' }}
            >
                {children}
            </main>
        </div>
    )
}
