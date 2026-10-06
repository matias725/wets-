// Sucursales con coordenadas reales (aeropuertos: terminal de pasajeros).
// zone se usa para ponderar la flota: el norte concentra camionetas (zona minera).
import { REAL } from './realData'

const DEMO_BRANCHES = [
  { id: 'apt-arica', name: 'APT Arica', city: 'Arica', lat: -18.3485, lng: -70.3387, zone: 'norte' },
  { id: 'apt-iquique', name: 'APT Iquique', city: 'Iquique', lat: -20.5352, lng: -70.1813, zone: 'norte' },
  { id: 'iquique', name: 'Iquique', city: 'Iquique', lat: -20.2141, lng: -70.1524, zone: 'norte' },
  { id: 'apt-calama', name: 'APT Calama', city: 'Calama', lat: -22.4982, lng: -68.9036, zone: 'norte' },
  { id: 'calama', name: 'Calama', city: 'Calama', lat: -22.4567, lng: -68.9237, zone: 'norte' },
  { id: 'san-pedro', name: 'San Pedro de Atacama', city: 'San Pedro de Atacama', lat: -22.9087, lng: -68.1997, zone: 'norte' },
  { id: 'apt-antofagasta', name: 'APT Antofagasta', city: 'Antofagasta', lat: -23.4445, lng: -70.4451, zone: 'norte' },
  { id: 'antofagasta', name: 'Antofagasta', city: 'Antofagasta', lat: -23.6509, lng: -70.3975, zone: 'norte' },
  { id: 'caldera', name: 'Caldera', city: 'Caldera', lat: -27.0668, lng: -70.8233, zone: 'norte' },
  { id: 'apt-copiapo', name: 'APT Copiapó', city: 'Copiapó', lat: -27.2612, lng: -70.7792, zone: 'norte' },
  { id: 'copiapo', name: 'Copiapó', city: 'Copiapó', lat: -27.3668, lng: -70.3322, zone: 'norte' },
  { id: 'apt-la-serena', name: 'APT La Serena', city: 'La Serena', lat: -29.9162, lng: -71.1995, zone: 'centro' },
  { id: 'la-serena', name: 'La Serena (casa matriz)', city: 'La Serena', lat: -29.9045, lng: -71.2489, zone: 'centro', hq: true },
  { id: 'manquehue', name: 'Manquehue (Santiago)', city: 'Santiago', lat: -33.4005, lng: -70.5679, zone: 'centro' },
  { id: 'apt-santiago', name: 'APT Santiago', city: 'Santiago', lat: -33.3929, lng: -70.7858, zone: 'centro' },
  { id: 'apt-concepcion', name: 'APT Concepción', city: 'Concepción', lat: -36.7727, lng: -73.0631, zone: 'sur' },
  { id: 'concepcion', name: 'Concepción', city: 'Concepción', lat: -36.8270, lng: -73.0503, zone: 'sur' },
  { id: 'los-angeles', name: 'Los Ángeles', city: 'Los Ángeles', lat: -37.4693, lng: -72.3527, zone: 'sur' },
  { id: 'apt-temuco', name: 'APT Temuco', city: 'Temuco', lat: -38.9259, lng: -72.6515, zone: 'sur' },
  { id: 'temuco', name: 'Temuco', city: 'Temuco', lat: -38.7359, lng: -72.5904, zone: 'sur' },
  { id: 'pucon', name: 'Pucón', city: 'Pucón', lat: -39.2819, lng: -71.9544, zone: 'sur' },
  { id: 'apt-puerto-montt', name: 'APT Puerto Montt', city: 'Puerto Montt', lat: -41.4389, lng: -73.0940, zone: 'sur' },
  { id: 'puerto-montt', name: 'Puerto Montt', city: 'Puerto Montt', lat: -41.4693, lng: -72.9424, zone: 'sur' },
]

// Con datos SAP se usan las sucursales reales (las sin coordenadas no van al mapa).
export const BRANCHES = REAL ? REAL.branches : DEMO_BRANCHES
export const BRANCH_BY_ID = Object.fromEntries(BRANCHES.map((b) => [b.id, b]))
export const ALL_BRANCHES = 'all'
