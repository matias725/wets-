import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export default function NotFound() {
  return (
    <Card className="mx-auto mt-16 max-w-md p-10 text-center">
      <Compass size={28} className="mx-auto text-brand-text" />
      <h1 className="mt-4 text-xl font-semibold">Página no encontrada</h1>
      <p className="mt-1 text-sm text-muted">La dirección no existe o fue movida.</p>
      <Link to="/" className="mt-6 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink">
        Volver al panel
      </Link>
    </Card>
  )
}
