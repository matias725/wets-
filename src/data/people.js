// Personas y empresas FICTICIAS para la demostración.

export const COMPANIES = [
  { id: 'emp-1', name: 'Minera Altos del Loa', rut: '76.412.880-3', kind: 'Minera', zone: 'norte', discount: 0.18, leasingUnits: 14 },
  { id: 'emp-2', name: 'Minera Pampa Norte', rut: '77.105.332-1', kind: 'Minera', zone: 'norte', discount: 0.15, leasingUnits: 9 },
  { id: 'emp-3', name: 'Constructora Cordillera', rut: '76.998.104-K', kind: 'Constructora', zone: 'centro', discount: 0.12, leasingUnits: 6 },
  { id: 'emp-4', name: 'Energía Atacama', rut: '77.340.551-6', kind: 'Energía', zone: 'norte', discount: 0.1, leasingUnits: 5 },
  { id: 'emp-5', name: 'Forestal Araucanía', rut: '76.220.917-4', kind: 'Forestal', zone: 'sur', discount: 0.1, leasingUnits: 4 },
]

const FIRST = [
  'Camila', 'Benjamín', 'Valentina', 'Matías', 'Javiera', 'Vicente', 'Catalina', 'Joaquín', 'Antonia', 'Tomás',
  'Fernanda', 'Diego', 'Constanza', 'Sebastián', 'Francisca', 'Nicolás', 'Isidora', 'Cristóbal', 'Josefa', 'Felipe',
]
const LAST = [
  'González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda',
  'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela',
]

// 40 clientes particulares con nombres y RUT ficticios, deterministas.
export const PERSONS = Array.from({ length: 40 }, (_, i) => {
  const first = FIRST[(i * 7) % FIRST.length]
  const last1 = LAST[(i * 3) % LAST.length]
  const last2 = LAST[(i * 11 + 5) % LAST.length]
  const body = 12_000_000 + ((i * 2_654_435) % 9_000_000)
  return {
    id: `cli-${i + 1}`,
    name: `${first} ${last1} ${last2}`,
    rut: `${body.toLocaleString('es-CL')}-${(i * 7) % 10}`,
    kind: 'Particular',
  }
})

// Responsables de taller por zona (ficticios).
export const RESPONSIBLES = {
  norte: ['Rodrigo Carrasco', 'Paula Henríquez', 'Gonzalo Tapia'],
  centro: ['Andrea Riquelme', 'Marcelo Vidal', 'Claudio Ortega'],
  sur: ['Daniela Cárdenas', 'Felipe Navarro', 'Pamela Aguilera'],
}
export const FALLBACK_RESPONSIBLE = 'Jefatura Nacional de Servicios'

export const CURRENT_USER = {
  name: 'Mario Zepeda',
  role: 'Jefe Nacional de Servicios',
  initials: 'MZ',
}
