import { notFound } from 'next/navigation'
import ClientCategoryPage from '../ClientCategoryPage'
import { use } from 'react'

type Kind = 'dish' | 'prep' | 'equipment'
type ParamsP = Promise<{ kind: string }>

export default function Page({ params }: { params: ParamsP }) {
  // Next 15: params è una Promise, si sblocca con use(params)
  const { kind: rawKind } = use(params)
  const allowed = ['dish', 'prep', 'equipment'] as const
  if (!allowed.includes(rawKind as Kind)) return notFound()
  const kind = rawKind as Kind
  return <ClientCategoryPage kind={kind} />
}
