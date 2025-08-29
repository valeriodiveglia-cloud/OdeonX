'use client'

import CategoryManager from './CategoryManager'

type Kind = 'dish' | 'prep' | 'equipment'

export default function ClientCategoryPage({ kind }: { kind: Kind }) {
  return <CategoryManager kind={kind} />
}
