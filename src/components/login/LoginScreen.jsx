import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { META, isRealData } from '@/data/api'
import fallbackPhoto from '@/assets/img/camioneta-4x4.jpg'
import logoYellow from '@/assets/img/west_logo_yellow.png'

/*
 * Ingreso de WEST IA (celular y computador): foto de la Hilux, datos de la flota
 * y formulario. Sin 3D ni efectos pesados: carga al instante.
 * Celular: foto arriba que se funde con el formulario.
 * Computador: foto a la izquierda con la frase, formulario a la derecha.
 */

// Foto del ingreso: Toyota Hilux 2024. Es material de Toyota, por eso vive solo en
// este equipo (public/local, fuera de git); si falta se usa la foto de respaldo.
const HERO = '/local/login-hero.jpg'

const ease = [0.16, 1, 0.3, 1]
const rise = (delay) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease, delay },
})

function updatedLabel() {
  const at = META?.generatedAt
  if (!isRealData || !at) return 'Versión de demostración con datos ficticios'
  const [d, t] = at.split('T')
  return `Datos del SAP actualizados el ${d.split('-').reverse().join('-')} a las ${t.slice(0, 5)}`
}

function Stat({ value, label }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
      <div className="tabular text-lg leading-tight font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-white/55">{label}</div>
    </div>
  )
}

function Headline({ className }) {
  return (
    <div className={className}>
      <motion.p {...rise(0.25)} className="text-[11px] font-semibold tracking-[0.3em] text-[#ffc400] uppercase lg:text-xs">
        West IA · Gestión de flota
      </motion.p>
      <motion.h1 {...rise(0.33)} className="mt-2 text-[40px] leading-[1.02] font-bold tracking-tight lg:mt-3 lg:text-6xl xl:text-7xl">
        Tu flota,
        <br />
        bajo control.
      </motion.h1>
    </div>
  )
}

export default function LoginScreen({ stats, onLogin }) {
  const [hero, setHero] = useState(HERO)
  const [email, setEmail] = useState('mzepeda@west.cl')
  const [password, setPassword] = useState('demo1234')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (!email.includes('@') || password.length < 4) return setError('Ingrese un correo válido y una contraseña de al menos 4 caracteres.')
    setError('')
    setLoading(true)
    setTimeout(onLogin, 500)
  }

  const field =
    'h-12 w-full rounded-2xl border border-white/12 bg-white/[0.05] pl-11 text-[15px] text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-[#ffc400] focus:bg-white/[0.08] focus:ring-4 focus:ring-[#ffc400]/15'

  return (
    <div
      className="flex min-h-svh flex-col overflow-hidden bg-[#0b1120] text-white lg:grid lg:h-svh lg:grid-cols-[minmax(0,1.45fr)_minmax(420px,1fr)]"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* foto: Toyota Hilux 2024 en el desierto */}
      <div className="relative -mb-20 min-h-[38svh] flex-1 lg:mb-0 lg:h-full lg:min-h-0">
        <motion.img
          src={hero}
          onError={() => setHero(fallbackPhoto)}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: hero === HERO ? '60% 62%' : '58% 50%' }}
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease }}
        />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0b1120]/80 to-transparent" />
        {/* celular: se funde hacia abajo · computador: hacia abajo y hacia el panel derecho */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/70 to-transparent lg:h-1/2 lg:via-[#0b1120]/40" />
        <div className="absolute inset-y-0 right-0 hidden w-40 bg-gradient-to-l from-[#0b1120] to-transparent lg:block" />
        <motion.header
          {...rise(0.1)}
          className="absolute inset-x-5 flex items-center justify-between lg:inset-x-12"
          style={{ top: 'max(18px, env(safe-area-inset-top))' }}
        >
          <img src={logoYellow} alt="West" className="h-7 w-auto lg:mt-6 lg:h-9" />
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] text-white/85 lg:hidden">
            <ShieldCheck size={13} className="text-[#ffc400]" /> Conexión privada
          </span>
        </motion.header>
        <Headline className="absolute bottom-14 left-12 hidden max-w-xl lg:block" />
      </div>

      <div className="relative px-5 lg:flex lg:items-center lg:justify-center lg:px-12" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="w-full lg:max-w-[400px]">
          <Headline className="lg:hidden" />
          <motion.div {...rise(0.25)} className="hidden lg:block">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80">
              <ShieldCheck size={14} className="text-[#ffc400]" /> Conexión privada
            </span>
            <h2 className="mt-6 text-3xl font-bold tracking-tight">Bienvenido</h2>
            <p className="mt-1.5 text-sm text-white/55">Ingrese con su cuenta corporativa West.</p>
          </motion.div>

          {stats && (
            <motion.div {...rise(0.42)} className="mt-5 grid grid-cols-3 gap-2 lg:mt-7">
              <Stat value={stats.vehicles.toLocaleString('es-CL')} label="vehículos" />
              <Stat value={stats.workshop.toLocaleString('es-CL')} label="en taller" />
              <Stat value={`${Math.round(stats.availability * 100)}%`} label="disponible" />
            </motion.div>
          )}

          <motion.form {...rise(0.5)} onSubmit={submit} noValidate className="mt-6 space-y-3">
            <label className="sr-only" htmlFor="ml-email">Correo</label>
            <div className="relative">
              <Mail size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/45" />
              <input id="ml-email" type="email" inputMode="email" autoComplete="username" placeholder="Correo corporativo" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </div>
            <label className="sr-only" htmlFor="ml-pass">Contraseña</label>
            <div className="relative">
              <Lock size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/45" />
              <input id="ml-pass" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pr-12`} />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white active:bg-white/10"
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && <p role="alert" className="text-[13px] text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#ffc400] text-[15px] font-semibold text-[#1a1712] shadow-[0_12px_36px_-12px_rgba(255,196,0,0.8)] transition hover:bg-[#ffd23f] active:scale-[0.98] disabled:opacity-80"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : (<>Ingresar <ArrowRight size={18} /></>)}
            </button>
          </motion.form>

          <motion.p {...rise(0.6)} className="mt-4 text-center text-[11px] text-white/40">
            {updatedLabel()}
          </motion.p>
        </div>
      </div>
    </div>
  )
}
