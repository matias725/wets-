import { useState } from 'react'
import { Copy, ImageDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'

/**
 * Copiar / descargar una imagen PNG generada al vuelo (fichas para WhatsApp o correo).
 * make: () => Promise<Blob>
 */
export function ShareImageButtons({ make, filename, size = 'sm', className }) {
  const [busy, setBusy] = useState('')
  const download = async () => {
    setBusy('download')
    try {
      const blob = await make()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast.success(`Imagen descargada: ${filename}`)
    } catch (e) {
      toast.error('No se pudo crear la imagen', { description: e?.message })
    } finally {
      setBusy('')
    }
  }
  const copy = async () => {
    setBusy('copy')
    try {
      // el portapapeles recibe la promesa: así el navegador no pierde el permiso mientras se dibuja
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': make() })])
      toast.success('Imagen copiada', { description: 'Péguela con Ctrl+V en WhatsApp Web o en un correo' })
    } catch {
      toast.error('El navegador no permitió copiar la imagen', { description: 'Use "Descargar imagen"' })
    } finally {
      setBusy('')
    }
  }
  return (
    <div className={className ?? 'flex gap-2'}>
      <Button size={size} onClick={copy} disabled={Boolean(busy)} title="Copiar como imagen">
        {busy === 'copy' ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Copiar imagen
      </Button>
      <Button size={size} onClick={download} disabled={Boolean(busy)} title="Descargar como imagen PNG">
        {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />} Descargar imagen
      </Button>
    </div>
  )
}
