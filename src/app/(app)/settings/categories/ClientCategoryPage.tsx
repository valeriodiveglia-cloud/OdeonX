'use client'

import CategoryManager from './CategoryManager'

export type Kind = 'materials' | 'dish' | 'prep' | 'equipment'

export default function ClientCategoryPage({ kind }: { kind: Kind }) {
  return <CategoryManager kind={kind} />
}
