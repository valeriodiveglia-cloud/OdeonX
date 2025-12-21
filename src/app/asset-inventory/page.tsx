import { Suspense } from 'react'
import AssetInventoryLayout from './_components/AssetInventoryLayout'

export default function Page() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AssetInventoryLayout />
        </Suspense>
    )
}
